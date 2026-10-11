#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mr Juice print agent.

يقرأ طلبات الطباعة (print_jobs) من Supabase ويطبعها على الطابعات الحرارية
عبر الشبكة (ESC/POS على بورت 9100) كصورة عربية.

الاستخدام:
  python3 printer_agent.py              # تشغيل دائم
  python3 printer_agent.py --test cashier   # طباعة إيصال تجريبي
  python3 printer_agent.py --test kitchen   # طباعة تذكرة مطبخ تجريبية
  python3 printer_agent.py --png            # حفظ صور تجريبية فقط بدون طباعة
"""
import datetime as dt
import os
import socket
import sqlite3
import json
import base64
import io
import sys
import time
import zoneinfo

import requests
import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

AGENT_VERSION = "5.14"
HERE = os.path.dirname(os.path.abspath(__file__))
try:
    TZ = zoneinfo.ZoneInfo("Africa/Cairo")
except Exception:  # لا توجد قاعدة مناطق زمنية: نستخدم توقيت القاهرة الصيفي الثابت
    TZ = dt.timezone(dt.timedelta(hours=3))
W = 576  # عرض الطباعة بالنقاط (80mm)
PAD = 14
MAX_AGE_MIN = 15      # أقدم طلب يُطبع؛ الأقدم يتم تخطيه
MAX_ATTEMPTS = 40
POLL_SEC = 3
RETRY_SEC = 10
TYPE_AR = {"dine": "صالة", "take": "تيك أواي", "delivery": "دليفري"}


def load_env():
    p = os.path.join(HERE, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
SB_URL = os.environ.get("SUPABASE_URL", "https://njrejjufurycusjhzfdv.supabase.co").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_QTk_CJO1kCz53R32-JNgBg_2vTq-Lvu")
AG_EMAIL = os.environ.get("AGENT_EMAIL", "")
AG_PASS = os.environ.get("AGENT_PASSWORD", "")
SHOP = os.environ.get("SHOP_NAME", "Mr Juice")
PAPER = int(os.environ.get("PAPER_WIDTH", W))
if PAPER < 256 or PAPER > 832 or PAPER % 8:
    raise SystemExit("PAPER_WIDTH لازم يكون بين 256 و832 ومضاعفًا للرقم 8، مثال 384 أو 576")
SUBTITLE = os.environ.get("SUBTITLE", "Mr.Juice - الرفاعي")
DELIVERY_PHONE = os.environ.get("DELIVERY_PHONE", "0402232302")
COPIES = 1  # one transmission per order and printer
LOGO = os.environ.get("LOGO", os.path.join(HERE, "logo.png"))


# ---------------------------------------------------------------- fonts / text
def find_font(bold, italic=False):
    cands = [os.environ.get("FONT_BOLD" if bold else "FONT", "")]
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    if italic:
        name = "DejaVuSans-Oblique.ttf"
        cands = []
    cands += [
        os.path.join(HERE, "fonts", name),
        "/usr/share/fonts/truetype/dejavu/" + name,
        "/usr/share/fonts/TTF/" + name,
        "C:\\Windows\\Fonts\\" + ("segoeuib.ttf" if bold else "segoeui.ttf"),
        "C:\\Windows\\Fonts\\" + ("arialbd.ttf" if bold else "arial.ttf"),
        "/system/fonts/NotoNaskhArabic-Bold.ttf" if bold else "/system/fonts/NotoNaskhArabic-Regular.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for c in cands:
        if c and os.path.exists(c):
            return c
    raise SystemExit("لم أجد خطًا يدعم العربية. ضع ملف خط في مجلد fonts أو اضبط FONT في .env")


_F = {}


def font(size, bold=False, italic=False):
    k = (size, bold, italic)
    if k not in _F:
        # BASIC: نعتمد على arabic_reshaper + bidi (يعمل على كل الأجهزة بنفس النتيجة)
        try:
            path = find_font(bold, italic)
        except SystemExit:
            path = find_font(bold)
        _F[k] = ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.BASIC)
    return _F[k]


_reshaper = arabic_reshaper.ArabicReshaper({"delete_harakat": True, "support_ligatures": True})


def shape(t):
    return get_display(_reshaper.reshape(str(t)))


def tw(t, f):
    return f.getlength(shape(t))


def wrap(t, f, maxw):
    """تقسيم نص عربي إلى أسطر بحسب العرض."""
    lines, cur = [], ""
    for word in str(t).split():
        trial = (cur + " " + word).strip()
        if tw(trial, f) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or [""]


class Canvas:
    def __init__(self, width):
        self.w = width
        self.items = []  # (kind, ...) نرسمها لاحقًا بعد معرفة الارتفاع
        self.h = 8

    def _add(self, h, fn):
        self.items.append((self.h, fn))
        self.h += h

    def space(self, n):
        self.h += n

    def line(self, style="solid"):
        y = self.h

        def d(dr):
            if True:  # كل الخطوط متصلة (غير منقطة)
                dr.line([(PAD, y + 4), (self.w - PAD, y + 4)], fill=0, width=2)
            else:
                x = PAD
                while x < self.w - PAD:
                    dr.line([(x, y + 4), (min(x + 6, self.w - PAD), y + 4)], fill=0, width=2)
                    x += 12
        self._add(10, d)

    def text(self, t, size=26, bold=False, align="right", inverse=False):
        f = font(size, bold)
        lh = int(size * 1.35)
        for ln in wrap(t, f, self.w - 2 * PAD - (16 if inverse else 0)):
            y = self.h
            s = shape(ln)
            wd = f.getlength(s)
            if align == "center":
                x = (self.w - wd) / 2
            elif align == "left":
                x = PAD
            else:
                x = self.w - PAD - wd

            def d(dr, s=s, x=x, y=y, f=f, wd=wd, lh=lh):
                if inverse:
                    dr.rectangle([x - 8, y, x + wd + 8, y + lh], fill=0)
                    dr.text((x, y + 2), s, font=f, fill=255)
                else:
                    dr.text((x, y + 2), s, font=f, fill=0)
            self._add(lh + (6 if inverse else 0), d)

    def row(self, right, left, size=26, bold=False):
        """سطر بعمودين: right (يمين، عربي) و left (يسار، رقم)."""
        f = font(size, bold)
        lh = int(size * 1.35)
        lw = tw(left, f) if left != "" else 0
        lines = wrap(right, f, self.w - 2 * PAD - lw - 14)
        for i, ln in enumerate(lines):
            y = self.h
            s = shape(ln)
            wd = f.getlength(s)
            ls = shape(left) if (i == 0 and left != "") else ""

            def d(dr, s=s, wd=wd, y=y, f=f, ls=ls):
                dr.text((self.w - PAD - wd, y + 2), s, font=f, fill=0)
                if ls:
                    dr.text((PAD, y + 2), ls, font=f, fill=0)
            self._add(lh, d)

    def cols(self, parts, size=26, bold=False, italic=False):
        """سطر بأعمدة: parts = [(نص, x, محاذاة l/r/c)]"""
        f = font(size, bold, italic)
        lh = int(size * 1.35)
        y = self.h

        def d(dr):
            for t, x, al in parts:
                sh = shape(t)
                wd = f.getlength(sh)
                xx = x if al == "l" else (x - wd if al == "r" else x - wd / 2)
                dr.text((xx, y + 2), sh, font=f, fill=0)
        self._add(lh, d)

    def image(self, im):
        y = self.h
        x = int((self.w - im.width) / 2)

        def d(dr, im=im, x=x, y=y):
            dr._image.paste(im, (x, y))
        self._add(im.height + 6, d)

    def box(self, t, size=40, bold=True):
        f = font(size, bold)
        sh = shape(t)
        wd = f.getlength(sh)
        lh = int(size * 1.3)
        y = self.h
        x = (self.w - wd) / 2

        def d(dr):
            dr.rectangle([x - 16, y, x + wd + 16, y + lh + 8], outline=0, width=3)
            dr.text((x, y + 4), sh, font=f, fill=0)
        self._add(lh + 14, d)

    def render(self):
        img = Image.new("L", (self.w, self.h + 8), 255)
        dr = ImageDraw.Draw(img)
        dr._image = img
        for _, fn in self.items:
            fn(dr)
        return img


# ---------------------------------------------------------------- ticket content
def money(n):
    n = float(n or 0)
    return ("%.2f" % n).rstrip("0").rstrip(".") if n != int(n) else str(int(n))


def fmt_dt(ts):
    return ts.astimezone(TZ).strftime("%Y-%m-%d  %H:%M")


RECEIPT_DEFAULTS = {
    "shop_name": "Mr Juice", "subtitle": "Mr.Juice - الرفاعي",
    "invoice_title": "Simplified Tax Invoice", "footer": "", "delivery_phone": "0402232302",
    "show_logo": True, "show_printed_at": True, "show_check_number": True,
    "show_customer": True, "show_product_count": True,
    "font_size": 26, "logo_width_percent": 75, "order_font_size": 40,
    "bottom_space": 24, "minimum_length_mm": 140, "section_space": 14, "logo_data": ""
}


def receipt_settings():
    cfg = dict(RECEIPT_DEFAULTS)
    cfg.update(shop_name=SHOP, subtitle=SUBTITLE, delivery_phone=DELIVERY_PHONE)
    path = os.path.join(HERE, "receipt_settings.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as file:
            raw = json.load(file)
        if not isinstance(raw, dict):
            raise ValueError("receipt_settings.json يجب أن يحتوي على إعدادات صحيحة")
        for key, default in RECEIPT_DEFAULTS.items():
            if key in raw and type(raw[key]) is type(default):
                cfg[key] = raw[key]
    for key, low, high in [("font_size", 18, 36), ("logo_width_percent", 30, 90), ("order_font_size", 28, 54), ("bottom_space", 0, 80), ("minimum_length_mm", 80, 250), ("section_space", 0, 32)]:
        cfg[key] = max(low, min(high, cfg[key]))
    for key in ["shop_name", "subtitle", "invoice_title", "footer", "delivery_phone"]:
        cfg[key] = cfg[key][:200]
    return cfg


def load_logo(width, cfg):
    if not cfg["show_logo"]:
        return None
    if cfg["logo_data"]:
        encoded = cfg["logo_data"]
        if not encoded.startswith("data:image/png;base64,") or len(encoded) > 4_000_000:
            raise ValueError("صيغة أو حجم اللوجو غير صالح")
        source = io.BytesIO(base64.b64decode(encoded.split(",", 1)[1], validate=True))
    elif os.path.exists(LOGO):
        source = LOGO
    elif os.path.exists(os.path.join(HERE, "logo.png")):
        source = os.path.join(HERE, "logo.png")
    else:
        return None
    with Image.open(source) as original:
        if original.width * original.height > 16_000_000:
            raise ValueError("حجم اللوجو كبير جدًا")
        rgba = original.convert("RGBA")
        background = Image.new("RGBA", rgba.size, "white")
        background.alpha_composite(rgba)
        im = background.convert("L")
    target_width = int(width * cfg["logo_width_percent"] / 100)
    im = im.resize((target_width, max(1, int(im.height * target_width / im.width))), Image.Resampling.LANCZOS)
    return im.point(lambda pixel: 0 if pixel < 160 else 255, "L")


def egp(n):
    return "EGP {:,.2f}".format(float(n or 0))


def short_name(it):
    base = it.get("b") or it.get("n") or ""
    name = base.split(" · ")[-1].strip()
    z = it.get("z")
    return name + (" " + z if z else "")


PRINT_SETTINGS = {"cashier_receipt": True, "cashier_pickup": True, "kitchen_ticket": True, "receipt_notes": False, "pickup_notes": True, "kitchen_notes": True}


def build_receipt(o, num, width, _layout_gap=None):
    cfg = receipt_settings()
    size = cfg["font_size"]
    small = max(18, size - 4)
    c = Canvas(width)
    gap = cfg["section_space"] if _layout_gap is None else _layout_gap
    c.space(18)
    logo = load_logo(width, cfg)
    if logo is not None:
        c.image(logo)
    else:
        c.text(cfg["shop_name"], 48, False, "center")
    if cfg["subtitle"]:
        c.text(cfg["subtitle"], small, False, "center")
    c.space(gap)
    if cfg["invoice_title"]:
        c.text(cfg["invoice_title"], small, False, "center")
    c.space(gap)
    c.box("Order# %s" % num, cfg["order_font_size"], True)
    c.space(gap)
    if cfg["show_printed_at"]:
        c.text("Printed At: " + dt.datetime.now(TZ).strftime("%Y/%m/%d %I:%M:%S %p"), small, False, "center")
    c.space(gap)
    c.line()
    c.space(gap)
    typ = {"dine": "Dine In", "take": "Pick Up", "delivery": "Delivery"}.get(o.get("order_type"), "Dine In")
    c.text("الكاشير: " + (o.get("paid_by_name") or o.get("created_by_name") or "كاشير"), small)
    c.row("Check# %s" % num if cfg["show_check_number"] else "", typ, size, False)
    c.text(o["_created"].astimezone(TZ).strftime("%Y/%m/%d %I:%M:%S %p"), small)
    cu = o.get("customer")
    if cfg["show_customer"] and cu:
        c.line()
        for key, label in [("name", "العميل"), ("phone", "الموبايل"), ("address", "العنوان")]:
            if cu.get(key):
                c.text(label + ": " + cu[key], small)
    c.space(gap)
    c.line()
    c.space(gap)
    qx, item_x, price_x = 42, 80, width - PAD
    c.cols([("Qty", qx, "c"), ("Item", item_x, "l"), ("Price", price_x, "r")], small)
    c.line()
    # Measure the widest price so long Arabic names never overlap it.
    max_price = max([tw(egp(float(it.get("p") or 0) * int(it.get("q") or 1)), font(size)) for it in (o.get("items") or []) if not it.get("__pos_adjustment")] + [tw("Price", font(size))])
    item_right = width - PAD - max_price - 16
    maxw = max(70, item_right - item_x)
    count = 0
    for it in [item for item in (o.get("items") or []) if not item.get("__pos_adjustment")]:
        q = int(it.get("q") or 1)
        count += q
        lines = wrap(short_name(it), font(size), maxw)
        c.cols([(str(q), qx, "c"), (lines[0], item_x, "l"), (egp(float(it.get("p") or 0) * q), price_x, "r")], size)
        for line in lines[1:]:
            c.cols([(line, item_x, "l")], size)
        if PRINT_SETTINGS["receipt_notes"] and it.get("note"):
            for line in wrap(it["note"], font(small), maxw):
                c.cols([(line, item_x, "l")], small)
    c.space(gap)
    c.line()
    c.space(gap)
    def total_row(label, value):
        c.cols([(label, int(width * .60), "r"), (value, price_x, "r")], size, False)
    total = float(o["total"])
    adjustments = [item for item in (o.get("items") or []) if item.get("__pos_adjustment")]
    if adjustments:
        subtotal = sum(float(item.get("p") or 0) * int(item.get("q") or 0) for item in (o.get("items") or []) if not item.get("__pos_adjustment"))
        total_row("Subtotal", egp(subtotal))
        for adjustment in adjustments:
            if adjustment.get("kind") == "discount":
                total_row("Discount %s%%" % adjustment.get("rate", 0), "- " + egp(adjustment.get("amount")))
            elif adjustment.get("kind") == "delivery":
                total_row("Delivery", egp(adjustment.get("amount")))
    total_row("Total", egp(total))
    if o.get("method") == "card":
        total_row("Payment - Card", egp(total))
    else:
        paid = float(o["paid"]) if o.get("paid") is not None else total
        total_row("Payment - Cash", egp(paid))
        if paid > total:
            total_row("Change", egp(paid - total))
    c.space(gap)
    if cfg["show_product_count"]:
        c.line()
        c.text("Products Count %s" % count, size, False, "center")
    if cfg["footer"]:
        c.line()
        c.text(cfg["footer"], small, False, "center")
    if cfg["delivery_phone"]:
        c.space(14)
        c.text("For delivery: " + cfg["delivery_phone"], small, False, "center")
    minimum_pixels = round(cfg["minimum_length_mm"] * 203 / 25.4)
    if _layout_gap is None and c.h + cfg["bottom_space"] < minimum_pixels:
        # Spread the extra length across the sections, instead of blank trailing paper.
        extra = (minimum_pixels - c.h - cfg["bottom_space"] + 7) // 8
        return build_receipt(o, num, width, min(44, gap + extra))
    c.space(cfg["bottom_space"])
    return c.render()


def build_kitchen(o, num, width, document="kitchen"):
    """Preparation/pickup slip shared by both printers; no prices."""
    cfg = receipt_settings()
    c = Canvas(width)
    c.text(cfg["shop_name"], 28, True, "center")
    c.text("Order# %s" % num, 44, True, "center")
    c.text("Printed At: " + dt.datetime.now(TZ).strftime("%Y/%m/%d %I:%M:%S %p"), 22, False, "center")
    c.line()
    typ = {"dine": "Dine In", "take": "Pick Up", "delivery": "Delivery"}.get(o.get("order_type"), "Dine In")
    c.row(typ, "Type:", 26, True)
    c.row("1", "Guests:", 26)
    c.row(o.get("created_by_name") or "كاشير", "Device:", 26)
    c.row(o["_created"].astimezone(TZ).strftime("%Y/%m/%d"), "Date:", 26)
    c.row(o["_created"].astimezone(TZ).strftime("%I:%M:%S %p"), "Time:", 26, True)
    c.line()
    c.text("New", 38, True, "center")
    c.line()
    for it in [item for item in (o.get("items") or []) if not item.get("__pos_adjustment")]:
        q = int(it.get("q") or 1)
        lines = wrap(short_name(it), font(30, True), width - PAD - 90)
        c.cols([(str(q), 42, "c"), (lines[0], width - PAD, "r")], 30, True)
        for line in lines[1:]:
            c.text(line, 30, True, "right")
        if PRINT_SETTINGS["pickup_notes" if document == "pickup" else "kitchen_notes"] and it.get("note"):
            c.text("ملاحظة: " + it["note"], 28, True, "right", inverse=True)
        c.line("dash")
    c.space(10)
    return c.render()


# ---------------------------------------------------------------- ESC/POS
def to_escpos(img, width, strip=160):
    img = img.convert("L")
    if img.width != width:
        canvas = Image.new("L", (width, img.height), 255)
        canvas.paste(img, (0, 0))
        img = canvas
    bw = img.point(lambda p: 0 if p < 150 else 255, "1")
    row_bytes = width // 8
    raw = bw.tobytes().translate(bytes(255 - i for i in range(256)))  # 1 = أسود
    out = bytearray(b"\x1b@")
    h = img.height
    for y in range(0, h, strip):
        n = min(strip, h - y)
        out += b"\x1dv0\x00" + bytes([row_bytes & 255, row_bytes >> 8, n & 255, n >> 8])
        out += raw[y * row_bytes:(y + n) * row_bytes]
    out += b"\x1bd\x04" + b"\x1dVB\x03"  # تغذية ثم قص
    return bytes(out)


def send(ip, port, data, timeout=6):
    with socket.create_connection((ip, int(port)), timeout=timeout) as s:
        s.settimeout(timeout)
        s.sendall(data)
        time.sleep(0.4)


# ---------------------------------------------------------------- supabase
class SB:
    def __init__(self):
        self.tok = None
        self.refresh = None
        self.exp = 0

    def _h(self):
        return {"apikey": SB_KEY, "Authorization": "Bearer " + (self.tok or SB_KEY),
                "Content-Type": "application/json"}

    def login(self):
        if self.refresh and time.time() > self.exp - 120:
            r = requests.post(SB_URL + "/auth/v1/token?grant_type=refresh_token",
                              json={"refresh_token": self.refresh}, headers={"apikey": SB_KEY}, timeout=15)
            if r.ok:
                self._set(r.json())
                return
        if not self.tok or time.time() > self.exp - 120:
            r = requests.post(SB_URL + "/auth/v1/token?grant_type=password",
                              json={"email": AG_EMAIL, "password": AG_PASS},
                              headers={"apikey": SB_KEY}, timeout=15)
            if not r.ok:
                raise RuntimeError("فشل تسجيل دخول برنامج الطباعة: %s" % r.text[:200])
            self._set(r.json())

    def _set(self, j):
        self.tok, self.refresh = j["access_token"], j.get("refresh_token")
        self.exp = time.time() + int(j.get("expires_in", 3600))

    def get(self, path, **params):
        self.login()
        r = requests.get(SB_URL + "/rest/v1/" + path, params=params, headers=self._h(), timeout=15)
        r.raise_for_status()
        return r.json()

    def rpc(self, name, body):
        self.login()
        response = requests.post(SB_URL + "/rest/v1/rpc/" + name, json=body, headers=self._h(), timeout=15)
        response.raise_for_status()
        return response.json()

    def patch(self, path, body, **params):
        self.login()
        r = requests.patch(SB_URL + "/rest/v1/" + path, params=params, json=body, headers=self._h(), timeout=15)
        r.raise_for_status()


def parse_ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def day_number(sb, o):
    """رقم الطلب اليومي (نفس ترقيم التطبيق)."""
    if o.get("day_number") is not None:
        return int(o["day_number"])
    c = o["_created"].astimezone(TZ)
    start = c.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(dt.timezone.utc)
    rows = sb.get("orders", select="id,created_at", created_at="gte." + start.isoformat(), order="created_at.asc", limit="2000")
    for i, r in enumerate(rows):
        if r["id"] == o["id"]:
            return i + 1
    return o.get("number") or 0


# Persist before sending: an uncertain transmission must never be retried automatically.
class PrintJournal:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("CREATE TABLE IF NOT EXISTS receipts (order_id TEXT, role TEXT, state TEXT, sent_at TEXT, PRIMARY KEY(order_id, role))")
        self.db.commit()

    def get(self, order_id, role):
        return self.db.execute("SELECT state, sent_at FROM receipts WHERE order_id=? AND role=?", (order_id, role)).fetchone()

    def reserve(self, order_id, role):
        with self.db:
            cursor = self.db.execute("INSERT OR IGNORE INTO receipts VALUES (?, ?, 'uncertain', NULL)", (order_id, role))
        return cursor.rowcount == 1

    def sent(self, order_id, role):
        with self.db:
            self.db.execute("UPDATE receipts SET state='sent', sent_at=? WHERE order_id=? AND role=?", (dt.datetime.now(dt.timezone.utc).isoformat(), order_id, role))


_journal = None
_agent_lock = None

def journal():
    global _journal
    if _journal is None:
        _journal = PrintJournal(os.path.join(HERE, "printed_orders.sqlite3"))
    return _journal


def sync_local_result(sb, job):
    receipt = journal().get(job["order_id"], "cashier_pickup" if job.get("document_kind") == "pickup" else job["printer_role"])
    if receipt is None:
        return False
    state, sent_at = receipt
    if job["printer_role"] == "cashier" and job.get("document_kind") != "pickup" and state == "sent":
        pickup = journal().get(job["order_id"], "cashier_pickup")
        if pickup is None:
            return False
        if pickup[0] != "sent":
            state = "uncertain"
    patch = {"status": "done", "printed_at": sent_at, "error": None} if state == "sent" else {
        "status": "failed", "error": "محاولة إرسال غير مؤكدة: راجع الورقة يدويًا، لا إعادة طباعة تلقائية"}
    sb.patch("print_jobs", patch, id="eq." + job["id"])
    return True


def lock_agent():
    global _agent_lock
    try:
        import fcntl
    except ImportError:
        raise SystemExit("هذه النسخة مخصصة لـ Termux/Linux/macOS")
    _agent_lock = open(os.path.join(HERE, ".printer_agent.lock"), "a")
    try:
        fcntl.flock(_agent_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("يوجد Agent يعمل بالفعل في هذا المجلد؛ أوقفه أولًا")


# ---------------------------------------------------------------- main loop
def process(sb, job, printers):
    jid = job["id"]
    if sync_local_result(sb, job):
        return
    age = (dt.datetime.now(dt.timezone.utc) - parse_ts(job["created_at"])).total_seconds() / 60
    if age > MAX_AGE_MIN:
        sb.patch("print_jobs", {"status": "failed", "error": "أقدم من %d دقيقة" % MAX_AGE_MIN}, id="eq." + jid)
        print("تخطي (قديم):", jid)
        return
    pickup_only = job.get("document_kind") == "pickup"
    local_role = "cashier_pickup" if pickup_only else job["printer_role"]
    pr = printers.get(job["printer_role"])
    if not pr or not pr.get("enabled") or not pr.get("ip"):
        sb.patch("print_jobs", {"status": "failed", "error": "الطابعة غير مفعلة أو بدون IP"}, id="eq." + jid)
        return
    rows = sb.get("orders", select="*", id="eq." + job["order_id"])
    if not rows:
        sb.patch("print_jobs", {"status": "failed", "error": "الطلب غير موجود"}, id="eq." + jid)
        return
    o = rows[0]
    o["_created"] = parse_ts(o["created_at"])
    if (job["printer_role"] == "cashier" and not pickup_only and o.get("state") != "completed") or o.get("state") in ("cancelled", "refunded"):
        sb.patch("print_jobs", {"status": "failed", "error": "الطلب غير مدفوع"}, id="eq." + jid)
        return
    dup = sb.get("print_jobs", select="id", order_id="eq." + job["order_id"],
                 printer_role="eq." + job["printer_role"], document_kind="eq." + ("pickup" if pickup_only else "receipt"), status="eq.done", limit="1")
    if dup and not journal().get(job["order_id"], local_role):
        sb.patch("print_jobs", {"status": "failed", "error": "طُبع من قبل"}, id="eq." + jid)
        print("تخطي (مكرر):", jid)
        return
    num = day_number(sb, o)
    documents = [(job["printer_role"], build_receipt if job["printer_role"] == "cashier" else build_kitchen)]
    if pickup_only:
        documents = [("cashier_pickup", lambda o,n,w: build_kitchen(o,n,w,"pickup"))]
    elif job["printer_role"] == "cashier":
        documents.append(("cashier_pickup", lambda o,n,w: build_kitchen(o,n,w,"pickup")))
    for document_role, builder in documents:
        previous = journal().get(job["order_id"], document_role)
        if previous:
            if previous[0] == "sent":
                continue
            sb.patch("print_jobs", {"status": "failed", "error": "محاولة إرسال غير مؤكدة: راجع الورقة يدويًا"}, id="eq." + jid)
            return
        setting_key = {"cashier": "cashier_receipt", "cashier_pickup": "cashier_pickup", "kitchen": "kitchen_ticket"}[document_role]
        if not PRINT_SETTINGS[setting_key]:
            if journal().reserve(job["order_id"], document_role):
                journal().sent(job["order_id"], document_role)
            continue
        data = to_escpos(builder(o, num, PAPER), PAPER)
        if not journal().reserve(job["order_id"], document_role):
            return
        send(pr["ip"], pr.get("port") or 9100, data)
        journal().sent(job["order_id"], document_role)
    sb.patch("print_jobs", {"status": "done", "printed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                            "attempts": (job.get("attempts") or 0) + 1, "error": None}, id="eq." + jid)
    print("طُبع:", job["printer_role"], "طلب #%s" % num)


def build_till_summary(report, width):
    t, summary = report["session"], report["summary"]
    c = Canvas(width)
    c.text(SHOP, 36, True, "center")
    if SUBTITLE:
        c.text(SUBTITLE, 22, False, "center")
    c.text("Till Summary", 32, True, "center")
    c.text("Business Date: " + str(t["business_date"]), 22, False, "center")
    c.text("Printed at: " + dt.datetime.now(TZ).strftime("%Y/%m/%d %I:%M:%S %p"), 20, False, "center")
    c.line()
    c.text("الكاشير: " + (t.get("cashier_name") or "كاشير"), 22)
    c.text(t["drawer"], 24)
    c.text("Opened At: " + fmt_dt(parse_ts(t["opened_at"])), 22)
    c.text("Closed At: " + fmt_dt(parse_ts(t["closed_at"])), 22)
    c.line()
    c.text("Payments", 28, True)
    for label, key in [("Cash", "cash_sales"), ("Card", "card_sales"), ("Total Payments", "total_payments"), ("Cash Returns", "cash_refunds"), ("Card Returns", "card_refunds"), ("Net Payments", "net_payments")]:
        c.row(label, egp(summary[key]), 24, key in ("total_payments", "net_payments"))
    c.line()
    c.text("Drawer Operations", 28, True)
    for label, key in [("Expenses", "expenses"), ("Pay In", "pay_in"), ("Pay Out", "pay_out"), ("Cash Drops", "cash_drops")]:
        c.row(label, egp(summary[key]), 24)
    expenses = [entry for entry in report.get("entries", []) if entry["kind"] == "expense"]
    if expenses:
        c.line()
        c.text("تفاصيل المصروفات", 26, True)
        for entry in expenses:
            c.row(entry["title"], egp(abs(float(entry["amount"]))), 24)
            if entry.get("category"):
                c.text(entry["category"], 20)
            if entry.get("note"):
                c.text(entry["note"], 20)
    c.line()
    c.row("Opening Amount", egp(t["opening_amount"]), 24)
    c.row("Expected Cash", egp(summary["expected_cash"]), 26, True)
    c.row("Counted Cash", egp(t["counted_amount"]), 26, True)
    difference = float(t["difference"])
    c.row("Cash Shortage" if difference < 0 else "Cash Overage" if difference > 0 else "Balanced", egp(abs(difference)), 28, True)
    if t.get("close_note"):
        c.line()
        c.text("ملاحظة الإغلاق: " + t["close_note"], 22)
    c.space(24)
    return c.render()


def process_till(sb, job, printers):
    key = "till:" + job["session_id"]
    saved = journal().get(key, "cashier")
    if saved:
        state, sent_at = saved
        patch = {"status": "done", "printed_at": sent_at, "error": None} if state == "sent" else {
            "status": "failed", "error": "إرسال ملخص العهدة غير مؤكد؛ راجع الورقة يدويًا"}
        sb.patch("till_print_jobs", patch, id="eq." + job["id"])
        return
    printer = printers.get("cashier")
    if not printer or not printer.get("enabled") or not printer.get("ip"):
        raise RuntimeError("طابعة الكاشير غير مفعلة أو عنوانها غير مضبوط")
    report = sb.rpc("till_report", {"p_session": job["session_id"]})
    if report["session"]["state"] != "closed":
        raise RuntimeError("العهدة لم تُغلق بعد")
    data = to_escpos(build_till_summary(report, PAPER), PAPER)
    if not journal().reserve(key, "cashier"):
        process_till(sb, job, printers)
        return
    send(printer["ip"], printer.get("port") or 9100, data)
    journal().sent(key, "cashier")
    sb.patch("till_print_jobs", {"status": "done", "printed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "error": None, "attempts": (job.get("attempts") or 0) + 1}, id="eq." + job["id"])
    print("تم إرسال ملخص العهدة مرة واحدة:", job["session_id"])


def run():
    lock_agent()
    if not AG_EMAIL or not AG_PASS:
        raise SystemExit("اكتب AGENT_EMAIL و AGENT_PASSWORD في ملف .env (حساب أدمن)")
    sb = SB()
    retry_at = {}
    printers, pr_t = {}, 0
    print("برنامج الطباعة يعمل… (Ctrl+C للإيقاف)")
    while True:
        try:
            if time.time() - pr_t > 30:
                printers = {p["role"]: p for p in sb.get("printers", select="*")}
                saved_settings = sb.get("pos_print_settings", select="*", id="eq.true", limit="1")
                if not saved_settings:
                    raise RuntimeError("إعدادات الطباعة غير متاحة؛ لم تتم الطباعة")
                for key in PRINT_SETTINGS:
                    if type(saved_settings[0].get(key)) is not bool:
                        raise RuntimeError("إعدادات طباعة غير صالحة")
                    PRINT_SETTINGS[key] = saved_settings[0][key]
                pr_t = time.time()
            jobs = sb.get("print_jobs", select="*", status="eq.pending", order="created_at.asc", limit="20")
            for j in jobs:
                if retry_at.get(j["id"], 0) > time.time():
                    continue
                try:
                    process(sb, j, printers)
                except Exception as e:  # فشل الطباعة: نعيد المحاولة
                    n = (j.get("attempts") or 0) + 1
                    st = "failed" if n >= MAX_ATTEMPTS else "pending"
                    if journal().get(j["order_id"], "cashier_pickup" if j.get("document_kind") == "pickup" else j["printer_role"]):
                        st = "pending"  # retry database synchronization only; process never resends
                    try:
                        sb.patch("print_jobs", {"attempts": n, "status": st, "error": str(e)[:300]}, id="eq." + j["id"])
                    except Exception:
                        pass
                    retry_at[j["id"]] = time.time() + RETRY_SEC
                    print("خطأ طباعة (%s) محاولة %d: %s" % (j["printer_role"], n, e))
            till_jobs = sb.get("till_print_jobs", select="*", status="eq.pending", order="created_at.asc", limit="10")
            for job in till_jobs:
                retry_key = "till:" + job["id"]
                if retry_at.get(retry_key, 0) > time.time():
                    continue
                try:
                    process_till(sb, job, printers)
                except Exception as error:
                    attempts = (job.get("attempts") or 0) + 1
                    saved = journal().get("till:" + job["session_id"], "cashier")
                    status = "pending" if saved or attempts < MAX_ATTEMPTS else "failed"
                    try:
                        sb.patch("till_print_jobs", {"status": status, "attempts": attempts, "error": str(error)[:300]}, id="eq." + job["id"])
                    except Exception:
                        pass
                    retry_at[retry_key] = time.time() + RETRY_SEC
                    print("تعذر مزامنة/طباعة ملخص العهدة:", error)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print("خطأ اتصال:", e)
            time.sleep(8)
        time.sleep(POLL_SEC)


# ---------------------------------------------------------------- demo / test
def demo_order(kind):
    now = dt.datetime.now(dt.timezone.utc)
    return {
        "id": "demo", "number": 146702, "_created": now, "state": "completed", "order_type": "delivery",
        "total": 185, "method": "cash", "paid": 200,
        "customer": {"name": "أحمد محمد", "phone": "01012345678", "address": "شارع التحرير، الدور الثالث، شقة 8"},
        "items": [
            {"b": "العصائر الطازجة · مانجا", "n": "العصائر الطازجة · مانجا (كبير)", "z": "L", "q": 2, "p": 55, "note": "بدون سكر، ثلج زيادة"},
            {"b": "ميلك شيك · أوريو", "n": "ميلك شيك · أوريو", "z": "", "q": 1, "p": 45, "note": ""},
            {"b": "وافل · وافل نوتيلا", "n": "وافل · وافل نوتيلا", "z": "", "q": 1, "p": 30, "note": "سكر على جنب"},
        ],
    }


def main():
    a = sys.argv[1:]
    if a and a[0] == "--png":
        o = demo_order("x")
        build_receipt(o, 7, PAPER).save("demo_receipt.png")
        build_kitchen(o, 7, PAPER).save("demo_kitchen.png")
        print("تم حفظ demo_receipt.png و demo_kitchen.png")
        return
    if a and a[0] == "--test":
        role = a[1] if len(a) > 1 else "cashier"
        sb = SB()
        pr = {p["role"]: p for p in sb.get("printers", select="*")}.get(role)
        if not pr or not pr.get("ip"):
            raise SystemExit("لا يوجد IP للطابعة " + role)
        o = demo_order("x")
        img = build_receipt(o, 7, PAPER) if role == "cashier" else build_kitchen(o, 7, PAPER)
        send(pr["ip"], pr.get("port") or 9100, to_escpos(img, PAPER))
        print("تم الإرسال إلى", pr["ip"])
        return
    if a and a[0] == "--raw":  # --raw role ip port : طباعة تجريبية بدون قاعدة بيانات
        role, ip, port = a[1], a[2], int(a[3]) if len(a) > 3 else 9100
        o = demo_order("x")
        img = build_receipt(o, 7, PAPER) if role == "cashier" else build_kitchen(o, 7, PAPER)
        send(ip, port, to_escpos(img, PAPER))
        print("تم الإرسال إلى", ip)
        return
    run()


if __name__ == "__main__":
    main()
