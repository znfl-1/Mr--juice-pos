import { Capacitor, registerPlugin } from '@capacitor/core';
(function () {
'use strict';
var cap = Capacitor;
var native = !!(cap && cap.isNativePlatform());
var printer = native ? registerPlugin('JuicePrinter') : null;
function raster(canvas) {
  var w = canvas.width, h = canvas.height, row = w / 8;
  var px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  var out = [27, 64];
  for (var y = 0; y < h; y += 160) {
    var n = Math.min(160, h - y);
    out.push(29, 118, 48, 0, row & 255, row >> 8, n & 255, n >> 8);
    for (var dy = 0; dy < n; dy++) for (var x = 0; x < w; x += 8) {
      var byte = 0;
      for (var bit = 0; bit < 8; bit++) {
        var i = ((y + dy) * w + x + bit) * 4;
        if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 150) byte |= 128 >> bit;
      }
      out.push(byte);
    }
  }
  out.push(27, 100, 4, 29, 86, 66, 3);
  var str = '';
  for (var i = 0; i < out.length; i++) str += String.fromCharCode(out[i]);
  return btoa(str);
}
async function receipt(order, role, number) {
  if (document.fonts) await document.fonts.ready;
  var width = 576, lines = [];
  var probe = document.createElement('canvas').getContext('2d');
  probe.font = '28px "IBM Plex Sans Arabic", sans-serif';
  function add(text) {
    var current = '';
    String(text).split(/\s+/).forEach(function (word) {
      var next = current ? current + ' ' + word : word;
      if (current && probe.measureText(next).width > width - 32) { lines.push(current); current = word; }
      else current = next;
    });
    if (current) lines.push(current);
  }
  add(role === 'kitchen' ? 'المطبخ — Mr Juice' : 'Mr Juice');
  add('طلب #' + number);
  add(new Date(order.cts).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }));
  add({ dine: 'صالة', take: 'تيك أواي', delivery: 'دليفري' }[order.type] || order.type);
  if (role === 'kitchen' && order.state === 'active') add('لم يُدفع بعد');
  if (order.customer) {
    add(order.customer.name + ' — ' + order.customer.phone);
    if (order.customer.address) add(order.customer.address);
  }
  add('────────────────────────');
  order.items.forEach(function (item) {
    add(item.q + ' × ' + item.n);
    if (item.note) add('ملاحظة: ' + item.note);
    if (role === 'cashier') add((item.q * item.p).toFixed(2) + ' ج.م');
  });
  if (role === 'cashier') {
    add('────────────────────────');
    if((order.adjustments||[]).length){add('مجموع المنتجات: '+order.items.reduce(function(t,i){return t+i.q*i.p;},0).toFixed(2)+' ج.م');(order.adjustments||[]).forEach(function(a){add(a.n+': '+(a.kind==='discount'?'− ':'')+Number(a.amount).toFixed(2)+' ج.م');});}
    add('الإجمالي: ' + order.total.toFixed(2) + ' ج.م');
    add(order.method === 'card' ? 'الدفع: كارت' : 'الدفع: كاش');
    if (order.method !== 'card' && order.paid != null) {
      add('المدفوع: ' + Number(order.paid).toFixed(2));
      add('الباقي: ' + Math.max(0, Number(order.paid) - order.total).toFixed(2));
    }
    add('شكرًا لزيارتكم');
  }
  var canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = lines.length * 44 + 32;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = 'black'; ctx.font = probe.font;
  ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  lines.forEach(function (line, i) { ctx.fillText(line, width - 16, 16 + i * 44); });
  return raster(canvas);
}
window.JuicePrint = {
  available: native,
  send: async function (order, role, number, config) {
    if (!printer) throw new Error('الطباعة المباشرة متاحة داخل تطبيق iPhone أو iPad');
    if (!config || !config.enabled || !config.ip) throw new Error('الطابعة غير مفعلة أو عنوانها غير مضبوط');
    return printer.send({ host: config.ip, port: Number(config.port || 9100), data: await receipt(order, role, number) });
  }
};
})();
