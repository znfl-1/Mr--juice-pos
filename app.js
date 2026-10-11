(function () {
var $ = function (s) { return document.querySelector(s); };
var fmt = function (n) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
var money = function (n) { return fmt(n) + ' ج.م'; };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
var timeFmt = function (ts) { return new Date(ts).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); };
var dateFmt = function (ts) { return new Date(ts).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' }); };
var SIZE = { M: 'M', L: 'L' };
var TYPE = { dine: 'صالة', take: 'تيك أواي', delivery: 'دليفري' };
var CAT_ORDER = ['العصائر الطازجة', 'سموزي', 'ميلك شيك', 'موهيتو', 'الزبادي اليوناني', 'جيلاتو', 'ساندي', 'العصائر العائلية', 'وافل', 'بان كيك', 'فروت سلاط', 'قهوة', 'أيس كوفي'];
var COLS = ['products', 'sales', 'expenses'];
var NOTE_CHIPS = ['بدون سكر', 'سكر خفيف', 'سكر زيادة', 'سكر على جنب', 'بدون ثلج', 'ثلج زيادة', 'بدون لبن', 'بدون نعناع', 'بدون كريمة', 'بدون مكسرات'];
var STATE_AR = { active: 'نشط', completed: 'مكتمل', refunded: 'مرتجع', cancelled: 'ملغي' };
var STAR = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6v36M8.4 15l31.2 18M8.4 33l31.2-18"/></svg>';
var S = { view: 'pos', cat: null, q: '', method: 'cash', otype: 'dine', paid: '', range: 'today', dateFrom: '', dateTo: '', discount: 0, deliveryFee: 0, categories: [], productCat: '', productQ: '', armed: '', busy: false, loading: true, role: 'cashier', staff: [], customers: [], cust: null, newCust: false, custQ: '', cuQ: '', orders: [], ofilter: 'active', payId: null, payM: 'cash', payPaid: '', note: null, products: [], sales: [], expenses: [], cart: {} };
var db = null, mode = 'local', LS = 'pos_sys_v2_';
var SB_URL = 'https://njrejjufurycusjhzfdv.supabase.co';
var SB_KEY = 'sb_publishable_QTk_CJO1kCz53R32-JNgBg_2vTq-Lvu';
var sb = window.supabase.createClient(SB_URL, SB_KEY);
mode = 'db';
function setStatus(t) { $('#status').textContent = t; }
function mapProduct(r) { return { id: r.id, name: r.name, cat: r.category || 'أخرى', price: r.price == null ? null : Number(r.price), sizes: r.sizes || null, active: r.active !== false }; }
function mapOrder(r) { var c = Date.parse(r.created_at), pd = r.paid_at ? Date.parse(r.paid_at) : c; return { id: r.id, cts: c, ts: pd, items: (r.items || []).filter(function(i){return !i.__pos_adjustment;}), adjustments: (r.items || []).filter(function(i){return i.__pos_adjustment;}), total: Number(r.total), method: r.method, type: r.order_type, paid: r.paid, cancelledAt:r.cancelled_at||null,createdByName:r.created_by_name||'موظف',paidByName:r.paid_by_name||'',cancelledBy:r.cancelled_by_name||'موظف',cancelReason:r.cancel_reason||'',number: r.day_number || r.number, businessDayId:r.business_day_id || null, customer: r.customer || null, state: r.state || 'completed', refundedAt: r.refunded_at ? Date.parse(r.refunded_at) : 0, refundedBy: r.refunded_by_name || 'موظف', reason: r.refund_reason || '' }; }
function mapCustomer(r) { return { id: r.id, ts: Date.parse(r.created_at), name: r.name, phone: r.phone, address: r.address || '' }; }
function mapStaff(r) { return { id: r.email, email: r.email, role: r.role, name:r.display_name || (r.role==='admin'?'أدمن':'كاشير') }; }
function mapExpense(r) { return { tillId: r.till_session_id || null, category:r.category||'', note:r.note||'', id: r.id, ts: Date.parse(r.created_at), title: r.title, amount: Number(r.amount) }; }
async function fetchAll(table) {
var out = [], from = 0;
for (;;) {
var q = sb.from(table).select('*');
var r = await q.order('created_at', { ascending: table === 'products' || table === 'staff' }).range(from, from + 999);
if (r.error) throw r.error;
out = out.concat(r.data);
if (r.data.length < 1000) break;
from += 1000;
}
return out;
}
async function reload() {
try {
var adm = S.role === 'admin';
var res = await Promise.all([fetchAll('products'), fetchAll('orders'), adm ? fetchAll('expenses') : Promise.resolve([]), adm ? fetchAll('staff') : Promise.resolve([]), fetchAll('customers'), sb.from('pos_business_days').select('id').eq('state','open').single()]);
if(res[5].error)throw res[5].error;S.businessDayId=res[5].data.id;
S.categories = Array.from(new Set(res[0].map(function(r){return r.category || 'أخرى';}))); S.products = res[0].filter(function(r){return r.name !== '__pos_category__';}).map(mapProduct); S.orders = res[1].map(mapOrder); S.sales = S.orders.filter(function (x) { return x.state === 'completed'; }); S.expenses = res[2].map(mapExpense); S.staff = res[3].map(mapStaff); S.customers = res[4].map(mapCustomer);
if(window.Till)await Till.refresh();
S.loading = false; setStatus('متصل');
} catch (e) { S.loading = false; setStatus('تعذر الاتصال بقاعدة البيانات'); }
renderAll();
}
async function addDoc(col, obj) {
var r;
if (col === 'products') r = await sb.from('products').insert({ name: obj.name, category: obj.cat, price: obj.price == null ? null : obj.price, sizes: obj.sizes || null, active: obj.active !== false });
else if (col === 'sales') r = await sb.from('orders').insert({ items: obj.items, total: obj.total, method: obj.method, paid: obj.paid == null ? null : obj.paid, order_type: obj.type || 'dine', customer: obj.customer || null, state: obj.state || 'completed' });
else if (col === 'staff') r = await sb.from('staff').insert({ email: obj.email, role: obj.role, display_name:obj.name||'' });
else r = await sb.from('expenses').insert({ title: obj.title, amount: obj.amount });
if (r.error) throw r.error;
await reload();
}
async function delDoc(col, id) {
var r = col === 'sales' ? await sb.from('orders').update({ status: 'void' }).eq('id', id) : col === 'staff' ? await sb.from('staff').delete().eq('email', id) : await sb.from(col).delete().eq('id', id);
if (r.error) throw r.error;
await reload();
}
async function orderUpdate(id, patch) {
if(patch.state==='cancelled'){var approval=await sb.rpc('cancel_order',{p_order:id,p_pin:null,p_reason:''});if(approval.error||!approval.data.ok)throw approval.error||new Error(approval.data.error);await reload();return;}
if(patch.state==='refunded'&&window.Till&&!Till.requireOpen())throw new Error('OPEN_TILL_REQUIRED');
var r = await sb.from('orders').update(patch).eq('id', id);
if (r.error) throw r.error;
await reload();
}
async function importMenu() {
var res = await fetch('menu.json'), rows = await res.json();
for (var i = 0; i < rows.length; i += 50) {
var base = Date.now();
var chunk = rows.slice(i, i + 50).map(function (x, j) { return Object.assign({}, x, { created_at: new Date(base + (i + j)).toISOString() }); });
var r = await sb.from('products').insert(chunk);
if (r.error) throw r.error;
}
await reload();
}
var rt, listening = false;
function schedule() { clearTimeout(rt); rt = setTimeout(reload, 300); }
function listen() {
var ch = sb.channel('pos');
['orders', 'products', 'expenses', 'customers'].forEach(function (t) { ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, schedule); });
ch.subscribe();
}
var loginMode = 'in';
function showLogin(msg) { document.body.classList.remove('authed', 'is-admin'); $('#login-msg').textContent = msg || ''; }
async function enter(session) {
var email = (session.user.email || '').toLowerCase();
myEmail = email;
var r = await sb.from('staff').select('email,role,display_name').eq('email', email);
if (!r.error && !r.data.length) {
await sb.from('staff').insert({ email: email, role: 'admin' });
r = await sb.from('staff').select('email,role,display_name').eq('email', email);
}
if (r.error || !r.data.length) { await sb.auth.signOut(); showLogin('الحساب ده غير مصرح له بالدخول. اطلب من المسؤول إضافته.'); return; }
S.role = r.data[0].role === 'admin' ? 'admin' : 'cashier';
document.body.classList.add('authed');
document.body.classList.toggle('is-admin', S.role === 'admin');
if(S.role==='admin')setView('admin');else if(['admin','products','printing'].includes(S.view))setView('pos');
S.loading = true; renderAll();
await reload();
if (!listening) { listening = true; listen(); }
}
$('#login-toggle').addEventListener('click', function () {
loginMode = loginMode === 'in' ? 'up' : 'in';
$('#login-go').textContent = loginMode === 'in' ? 'دخول' : 'إنشاء الحساب';
$('#login-toggle').textContent = loginMode === 'in' ? 'إنشاء حساب جديد' : 'عندي حساب بالفعل';
$('#login-msg').textContent = '';
});
$('#login-form').addEventListener('submit', async function (e) {
e.preventDefault();
var email = $('#l-email').value.trim(), password = $('#l-pass').value, msg = $('#login-msg'), go = $('#login-go');
go.disabled = true; msg.textContent = '';
try {
if (loginMode === 'in') {
var r = await sb.auth.signInWithPassword({ email: email, password: password });
if (r.error) msg.textContent = /confirm/i.test(r.error.message) ? 'الحساب لم يتم تفعيله بعد.' : 'البريد أو كلمة المرور غير صحيحة.';
else await enter(r.data.session);
} else {
var u = await sb.auth.signUp({ email: email, password: password });
if (u.error) msg.textContent = u.error.message;
else if (u.data.session) await enter(u.data.session);
else msg.textContent = 'تم إنشاء الحساب. يحتاج تفعيل من المسؤول قبل أول دخول.';
}
} catch (err) { msg.textContent = 'تعذر الاتصال، حاول مرة أخرى.'; }
go.disabled = false;
});
var toastT;
function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2600); }
function dateKey(ts) { var parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Cairo', year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts)); var o={};parts.forEach(function(x){o[x.type]=x.value;});return o.year+'-'+o.month+'-'+o.day; }
function shiftDate(key, days) { return new Date(Date.parse(key+'T12:00:00Z')+days*86400000).toISOString().slice(0,10); }
function dayBoundary(key) {
if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || new Date(key+'T00:00:00Z').toISOString().slice(0,10)!==key) return NaN;
var wanted=Date.parse(key+'T00:00:00Z'), guess=wanted;
for(var i=0;i<3;i++){var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)), v={};p.forEach(function(x){v[x.type]=x.value;});var local=Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute,+v.second);guess+=wanted-local;}
return guess;
}
function startOfDay(o) { return dayBoundary(shiftDate(dateKey(Date.now()),-(o||0))); }
function rangeBounds() {
var today=dateKey(Date.now());
if(S.range==='custom')return {start:dayBoundary(S.dateFrom),end:dayBoundary(shiftDate(S.dateTo,1))};
return {start:S.range==='all'?0:startOfDay(S.range==='7'?6:S.range==='30'?29:0),end:dayBoundary(shiftDate(today,1))};
}
function rangeStart() { return rangeBounds().start; }
function inRange(ts) {var bounds=rangeBounds();return ts>=bounds.start && ts<bounds.end;}
function sum(a, f) { return a.reduce(function (t, x) { return t + (Number(f(x)) || 0); }, 0); }
function prodPrice(p, z) { return z ? Number(p.sizes && p.sizes[z]) : Number(p.price); }
function cartItems() {
return Object.keys(S.cart).map(function (k) {
var pr = k.split('|'), p = S.products.find(function (x) { return x.id === pr[0]; });
if (!p) return null;
var z = pr[1] || '', note = pr[2] || '';
var full = (p.cat ? p.cat + ' · ' : '') + p.name;
return { key: k, b: full, n: full + (z ? ' (' + SIZE[z] + ')' : ''), z: z, note: note, price: prodPrice(p, z), q: S.cart[k] };
}).filter(Boolean);
}
function cents(n) {return Math.round((Number(n)+Number.EPSILON)*100);}
function cartAmounts() {
var subtotal=sum(cartItems(),function(i){return cents(i.price)*i.q;});
var discount=Math.round(subtotal*S.discount/100), delivery=S.otype==='delivery'?cents(S.deliveryFee):0;
return {subtotal:subtotal/100,discount:discount/100,delivery:delivery/100,total:(subtotal-discount+delivery)/100};
}
function cartTotal() {return cartAmounts().total;}
function adjustmentItems() {var a=cartAmounts(),out=[];if(S.discount)out.push({__pos_adjustment:true,kind:'discount',rate:S.discount,amount:a.discount,n:'خصم '+S.discount+'%',q:0,p:0});if(a.delivery)out.push({__pos_adjustment:true,kind:'delivery',amount:a.delivery,n:'رسوم دليفري',q:0,p:0});return out;}
function clearAdjustments(){S.discount=0;S.deliveryFee=0;$('#delivery-fee').value='';}

function qtyOf(id) { return Object.keys(S.cart).reduce(function (t, k) { return k.split('|')[0] === id ? t + S.cart[k] : t; }, 0); }
function todayNums() {var m={};S.orders.forEach(function(x){m[x.id]=x.number;});return m;}

function catList() {
var seen = {}, out = S.categories.slice(); out.forEach(function(c){seen[c]=1;});
S.products.forEach(function (p) { var c = p.cat || 'أخرى'; if (!seen[c]) { seen[c] = 1; out.push(c); } });
return out.sort(function (a, b) {
var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
if (ia < 0 && ib < 0) return a.localeCompare(b, 'ar');
return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
}
function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[\u0623\u0625\u0622]/g, '\u0627').replace(/\u0629/g, '\u0647').replace(/\u0649/g, '\u064a').replace(/\s+/g, ' ').trim(); }
function priceLabel(p) {
if (p.sizes) return 'M ' + fmt(p.sizes.M) + ' · L ' + fmt(p.sizes.L);
return money(Number(p.price));
}
function renderPos() {
var host = $('#tiles'), crumb = $('#crumb');
if (S.loading) { crumb.innerHTML = ''; host.innerHTML = '<div class="empty" style="grid-column:1/-1">جاري تحميل المنتجات…</div>'; return renderCart(); }
if (!S.products.some(function(p){return p.active;}) && !S.categories.length) {
crumb.innerHTML = '';
host.innerHTML = '<div class="empty" style="grid-column:1/-1">لا توجد منتجات بعد.' + (S.role === 'admin' ? '<br><br><button class="btn sm" id="import-menu">استيراد منيو Mr Juice</button><br><br>أو أضف منتجاتك من لوحة الأدمن.' : '<br>اطلب من الأدمن إضافة المنتجات.') + '</div>';
return renderCart();
}
var list;
if (S.q) {
var nq = norm(S.q);
list = S.products.filter(function (p) { return p.active && (norm(p.name).indexOf(nq) >= 0 || norm(p.cat || '').indexOf(nq) >= 0); });
crumb.innerHTML = '<h2>نتائج البحث <small class="note">' + list.length + '</small></h2>';
} else if (S.cat) {
list = S.products.filter(function (p) { return p.active && (p.cat || 'أخرى') === S.cat; });
crumb.innerHTML = '<button class="back" id="back">‹ كل التصنيفات</button><h2>' + esc(S.cat) + '</h2>';
} else { list = null; crumb.innerHTML = ''; }
if (!list) {
host.innerHTML = catList().map(function (c) {
var n = S.products.filter(function (p) { return p.active && (p.cat || 'أخرى') === c; }).length;
return '<button class="tile" data-cat="' + esc(c) + '">' + STAR + '<span>' + esc(c) + '</span><small class="num">' + n + ' صنف</small></button>';
}).join('');
} else if (!list.length) { host.innerHTML = '<div class="empty" style="grid-column:1/-1">لا نتائج مطابقة.</div>'; }
else {
list.sort(function (a, b) { return 0; });
host.innerHTML = list.map(function (p) {
var q = qtyOf(p.id);
return '<button class="tile prod" data-p="' + esc(p.id) + '"><span class="pn">' + esc(p.name) + (S.q ? '<small class="note" style="display:block">' + esc(p.cat) + '</small>' : '') + '</span><span class="pp num">' + esc(priceLabel(p)) + '</span>' + (q ? '<span class="q num">' + q + '</span>' : '') + '</button>';
}).join('');
}
renderCart();
}
function renderCart() {
var items = cartItems(), total = cartTotal(), count = sum(items, function (i) { return i.q; });
$('#cart-count').textContent = count ? count + ' صنف' : '';
$('#lines').innerHTML = items.length ? items.map(function (i) {
return '<div class="line"><div class="ln">' + esc(i.n) + '<div class="ls num">' + money(i.price) + '</div><button class="notebtn' + (i.note ? ' has' : '') + '" data-note="' + esc(i.key) + '">' + (i.note ? 'ملاحظة: ' + esc(i.note) : '+ ملاحظة للمطبخ') + '</button></div>' +
'<div class="stepper"><button class="step" data-dec="' + esc(i.key) + '" aria-label="إنقاص">−</button><span class="n num">' + i.q + '</span><button class="step" data-inc="' + esc(i.key) + '" aria-label="زيادة">+</button></div>' +
'<div class="lt num">' + fmt(i.price * i.q) + '</div></div>';
}).join('') : '<div class="empty">اختر تصنيفًا ثم اضغط على المنتج لإضافته</div>';
var amounts=cartAmounts();
$('#subtotal').textContent=money(amounts.subtotal);
$('#discount-row').hidden=!S.discount;
$('#discount-value').textContent='− '+money(amounts.discount);
$('#discount-label').textContent='خصم '+S.discount+'%';
$('#discount-open').textContent=S.discount?'تعديل الخصم '+S.discount+'%':'إضافة خصم %';
$('#delivery-controls').hidden=S.otype!=='delivery';
$('#delivery-summary').hidden=!amounts.delivery;
$('#delivery-value').textContent=money(amounts.delivery);
$('#total').textContent = money(total);
$('#nav-total').textContent = money(total);
var cb = $('#nav-cart'); cb.classList.toggle('on', S.view === 'pos' && count > 0);
$('#checkout').disabled = !items.length || S.busy;
$('#clear').disabled = !items.length;
$('#kitchen').disabled = !items.length || S.busy;
document.querySelectorAll('#method button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === S.method)); });
document.querySelectorAll('#otype button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.t === S.otype)); });
$('#paid-row').hidden = S.method !== 'cash';
$('#cust').hidden = S.otype !== 'delivery';
var paid = parseFloat(S.paid), ch = $('#change');
if (S.method === 'cash' && !isNaN(paid) && items.length) {
ch.hidden = false;
if (paid >= total) { ch.style.color = 'var(--good)'; $('#change-v').textContent = money(paid - total); $('#change-l').textContent = 'الباقي للعميل'; }
else { ch.style.color = 'var(--bad)'; $('#change-v').textContent = money(total - paid); $('#change-l').textContent = 'ناقص'; }
} else ch.hidden = true;
}
function addToCart(key) { S.cart[key] = (S.cart[key] || 0) + 1; renderPos(); }
function openSheet(p) {
$('#sheet-t').textContent = p.name;
$('#sizes').innerHTML = ['M', 'L'].filter(function (z) { return p.sizes && p.sizes[z] != null; }).map(function (z) {
return '<button data-size="' + z + '" data-pid="' + esc(p.id) + '">' + SIZE[z] + '<span class="num">' + money(Number(p.sizes[z])) + '</span></button>';
}).join('');
$('#scrim').hidden = false;
}
async function checkout(state) {
if(S.role==='admin')return toast('إنشاء الطلبات من حساب الكاشير');
state = state || 'completed';
var items = cartItems(); if (!items.length || S.busy) return;
if(window.Till&&!Till.requireOpen())return;
var cu = S.otype === 'delivery' ? S.customers.find(function (x) { return x.id === S.cust; }) : null;
if (S.otype === 'delivery' && !cu) return toast('اختر العميل أو أضف عميل جديد للدليفري');
if(S.otype==='delivery' && !$('#delivery-fee').checkValidity())return toast('اكتب رسوم دليفري صحيحة');
var total = cartTotal(), paid = parseFloat(S.paid);
if(!Number.isFinite(total)||total<0)return toast('راجع أسعار المنتجات والإجمالي');
var rec = { ts: Date.now(), items: items.map(function (i) { return { b: i.b, n: i.n, z: i.z, q: i.q, p: i.price, note: i.note || '' }; }).concat(adjustmentItems()), total: total, method: state === 'active' ? 'cash' : S.method, type: S.otype, state: state, customer: cu ? { id: cu.id, name: cu.name, phone: cu.phone, address: cu.address } : null };
if (state === 'completed') {
if (S.method === 'cash' && !isNaN(paid) && paid < total) return toast('المبلغ المدفوع أقل من الإجمالي');
if (S.method === 'cash' && !isNaN(paid) && paid >= total) rec.paid = paid;
}
S.busy = true; renderCart();
try {
await addDoc('sales', rec);
S.cart = {}; clearAdjustments(); S.paid = ''; $('#paid').value = ''; S.cat = null; S.q = ''; $('#q').value = ''; S.cust = null; S.newCust = false; S.custQ = '';
toast(state === 'active' ? 'تم إرسال الطلب للمطبخ' : 'تم تأكيد الطلب ' + money(total));
} catch (e) { toast('تعذر حفظ الطلب، حاول مرة أخرى'); }
S.busy = false; renderAll(); renderCust(true);
}
function delBtn(col, id, label) {
var k = col + ':' + id, on = S.armed === k;
return '<button class="del' + (on ? ' armed' : '') + '" data-del="' + k + '">' + (on ? 'تأكيد؟' : label) + '</button>';
}
function minsSince(ts) { var m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'الآن' : m < 60 ? 'منذ ' + m + ' د' : 'منذ ' + Math.floor(m / 60) + ' س ' + (m % 60) + ' د'; }
function itemsHtml(x) {
return (x.items || []).map(function (i) { return '<div class="oi">' + (i.q > 1 ? i.q + '× ' : '') + esc(i.n) + (i.note ? ' <span class="onote">— ' + esc(i.note) + '</span>' : '') + '</div>'; }).join('');
}
function orderRow(x, nums) {
var small = 'بواسطة '+esc(x.createdByName)+(x.paidByName?' · التحصيل: '+esc(x.paidByName):'')+' · '+timeFmt(x.cts) + ' · ' + (TYPE[x.type] || 'صالة') + (x.state === 'completed' ? ' · ' + (x.method === 'card' ? 'فيزا' : 'كاش') : x.state === 'active' ? ' · ' + minsSince(x.cts) : '');
var cust = x.customer ? '<small>' + esc(x.customer.name) + ' · <span class="num">' + esc(x.customer.phone) + '</span>' + (x.customer.address ? ' · ' + esc(x.customer.address) : '') + '</small>' : '';
var info = '';
if (x.state === 'refunded') info = '<small class="neg-v">مرتجع ' + dateFmt(x.refundedAt || x.cts) + ' ' + timeFmt(x.refundedAt || x.cts) + (x.refundedBy ? ' · ' + esc(x.refundedBy) : '') + (x.reason ? ' · ' + esc(x.reason) : '') + '</small>';
if(x.state==='cancelled'&&S.role==='admin')info+='<small>ألغاه: '+esc(x.cancelledBy)+(x.cancelReason?' · السبب: '+esc(x.cancelReason):'')+'</small>';
var adjustmentSummary=(x.adjustments||[]).map(function(a){return '<small>'+esc(a.n)+': '+money(a.amount)+'</small>';}).join('');
var acts = '';
if (x.state === 'active' && S.role==='admin') acts=delBtn('ocancel',x.id,'إلغاء');
else if (x.state === 'active') acts = '<button class="btn sm" data-pay="' + esc(x.id) + '">تحصيل</button>' + delBtn('ocancel', x.id, 'إلغاء');
else if (x.state === 'completed' && S.role === 'admin') acts = delBtn('orefund', x.id, 'مرتجع');
if (window.JuicePrint && JuicePrint.available && (x.state === 'active' || x.state === 'completed')) {
acts += '<button class="btn sm" data-print="' + esc(x.id) + '" data-role="kitchen">طباعة المطبخ</button>';
if (x.state === 'completed') acts += '<button class="btn sm" data-print="' + esc(x.id) + '" data-role="cashier">طباعة الإيصال</button>';
}
return '<div class="row ord"><div class="t"><b>طلب #' + (nums[x.id] || x.number) + '</b> <span class="pill st-' + x.state + '">' + STATE_AR[x.state] + '</span>' + itemsHtml(x) + '<small class="num">' + small + '</small>' + cust + adjustmentSummary + info + '</div><div class="a num">' + money(Number(x.total)) + '</div><div class="acts">' + acts + '</div></div>';
}
function renderOrders() {
var st = startOfDay(0), nums = todayNums();
var by = { active: [], completed: [], refunded: [], cancelled: [] };
S.orders.forEach(function (x) {
if (x.state === 'active') by.active.push(x);
else if (x.state === 'refunded') { if (S.role === 'admin' || x.cts >= st) by.refunded.push(x); }
else if (by[x.state] && (x.businessDayId ? x.businessDayId===S.businessDayId : x.cts >= st || x.ts >= st)) by[x.state].push(x);
});
by.active.sort(function (a, b) { return a.cts - b.cts; });
by.completed.sort(function (a, b) { return b.ts - a.ts; });
by.refunded.sort(function (a, b) { return (b.refundedAt || b.cts) - (a.refundedAt || a.cts); });
by.cancelled.sort(function (a, b) { return b.cts - a.cts; });
var f = S.ofilter, list = by[f] || [], tot = sum(list, function (x) { return x.total; });
var tabs = [['active', 'نشطة'], ['completed', 'مكتملة'], ['refunded', 'مرتجعة'], ['cancelled', 'ملغية']];
var empty = { active: 'لا توجد طلبات نشطة في المطبخ', completed: 'لا طلبات مكتملة اليوم بعد', refunded: 'لا مرتجعات', cancelled: 'لا طلبات ملغية اليوم' };
$('#view-orders').innerHTML = '<div class="bar"><h2>الطلبات</h2><span class="note num">' + list.length + ' طلب · ' + money(tot) + '</span></div>' +
'<div class="chips">' + tabs.map(function (t) { return '<button class="chip" data-of="' + t[0] + '" aria-pressed="' + (f === t[0]) + '">' + t[1] + ' <span class="num">' + by[t[0]].length + '</span></button>'; }).join('') + '</div>' +
'<section class="card"><div class="rows">' + (list.length ? list.map(function (x) { return orderRow(x, nums); }).join('') : '<div class="empty">' + empty[f] + '</div>') + '</div></section>';
}
function niceMax(m) {
if (m <= 0) return 4;
var mag = Math.pow(10, Math.floor(Math.log10(m))), st = [1, 2, 2.5, 4, 5, 8, 10];
for (var i = 0; i < st.length; i++) if (st[i] * mag >= m) return st[i] * mag;
return 10 * mag;
}
function chartSvg() {
var days=[],bounds=rangeBounds(), first=bounds.start || Math.min.apply(null,S.sales.map(function(x){return x.ts;}).concat(S.expenses.map(function(x){return x.ts;}),[Date.now()])), firstKey=dateKey(first), lastKey=dateKey(bounds.end-1), count=Math.round((Date.parse(lastKey)-Date.parse(firstKey))/86400000)+1, groups=Math.min(7,count);
for(var i=0;i<groups;i++){var k=shiftDate(firstKey,Math.floor(i*count/groups)), next=shiftDate(firstKey,Math.floor((i+1)*count/groups));days.push({s:dayBoundary(k),e:dayBoundary(next),sales:0,exp:0});}
S.sales.forEach(function (x) { days.forEach(function (d) { if (x.ts >= d.s && x.ts < d.e) d.sales += Number(x.total) || 0; }); });
S.expenses.forEach(function (x) { days.forEach(function (d) { if (x.ts >= d.s && x.ts < d.e) d.exp += Number(x.amount) || 0; }); });
var max = niceMax(Math.max.apply(null, days.map(function (d) { return Math.max(d.sales, d.exp); }).concat([0])));
var W = 640, H = 240, pl = 52, pr = 8, pt = 12, pb = 30, iw = W - pl - pr, ih = H - pt - pb, gw = iw / days.length, bw = gw * 0.28;
var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="المبيعات والمصروفات خلال الفترة المحددة" font-family="inherit">';
for (var t = 0; t <= 4; t++) {
var v = max / 4 * t, y = pt + ih - (v / max) * ih;
out += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"' + (t === 0 ? '' : ' stroke-dasharray="3 4"') + '/>';
out += '<text x="' + (pl - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + fmt(v) + '</text>';
}
days.forEach(function (d, idx) {
var cx = pl + gw * idx + gw / 2, hs = (d.sales / max) * ih, he = (d.exp / max) * ih;
var label = new Date(d.s).toLocaleDateString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',day:'numeric',month:'short'});
out += '<rect x="' + (cx - bw - 2) + '" y="' + (pt + ih - hs) + '" width="' + bw + '" height="' + Math.max(hs, 0) + '" rx="3" fill="var(--accent)"><title>مبيعات: ' + money(d.sales) + '</title></rect>';
out += '<rect x="' + (cx + 2) + '" y="' + (pt + ih - he) + '" width="' + bw + '" height="' + Math.max(he, 0) + '" rx="3" fill="var(--bad)"><title>مصروفات: ' + money(d.exp) + '</title></rect>';
out += '<text x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle" font-size="12" fill="var(--muted)"' + (idx === 6 ? ' font-weight="600"' : '') + '>' + label + '</text>';
});
return out + '</svg>';
}
var myEmail = '';
var ADMIN_IDS = ['s-name', 's-email', 'e-title', 'e-amt', 'p-name', 'p-cat', 'p-price', 'p-lprice', 'cu-q', 'cu-name', 'cu-phone', 'cu-addr', 'report-from', 'report-to'];
function renderProducts() {
var cats=catList();
$('#view-products').innerHTML='<div class="bar"><div><h2>المنتجات والتصنيفات</h2><p class="note">المنيو والأسعار والأحجام في مكان واحد</p></div><button class="btn sm" id="product-new">+ منتج جديد</button></div>'+ '<div class="product-layout"><aside class="card"><h3>التصنيفات <small>'+cats.length+'</small></h3><div class="category-create"><input class="in" id="category-name" placeholder="تصنيف جديد" aria-label="اسم التصنيف"><button class="btn sm" id="cat-add">إضافة</button></div><button class="category-button" data-manage-cat="">كل المنتجات <span class="num">'+S.products.length+'</span></button>'+cats.map(function(c){var count=S.products.filter(function(p){return p.cat===c;}).length;return '<div class="category-manage"><button class="category-button '+(S.productCat===c?'selected':'')+'" data-manage-cat="'+esc(c)+'">'+esc(c)+' <span class="num">'+count+'</span></button><div class="category-actions"><button data-cat-rename="'+esc(c)+'">تعديل</button><button data-cat-delete="'+esc(c)+'">حذف</button></div></div>';}).join('')+'</aside><section class="card"><div class="bar"><h3>'+(S.productCat?esc(S.productCat):'كل المنتجات')+'</h3><span class="pill">M / L</span></div><input class="in" id="product-search" type="search" placeholder="بحث باسم المنتج" value="'+esc(S.productQ)+'"><div id="product-rows"></div></section></div>';
renderProductRows();
}
function renderProductRows(){
var list=S.products.filter(function(p){return (!S.productCat||p.cat===S.productCat)&&norm(p.name).includes(norm(S.productQ));});
$('#product-rows').innerHTML='<div class="rows">'+(list.length?list.map(function(p){return '<div class="row product-row"><div class="t"><b>'+esc(p.name)+'</b><small>'+esc(p.cat)+' · '+(p.active?'متاح للبيع':'مخفي من الكاشير')+'</small></div><div class="a num">'+esc(priceLabel(p))+'</div><div class="product-actions"><button class="chip" data-product-edit="'+esc(p.id)+'">تعديل</button><button class="chip" data-product-toggle="'+esc(p.id)+'">'+(p.active?'إخفاء':'إظهار')+'</button>'+delBtn('products',p.id,'حذف')+'</div></div>';}).join(''):'<div class="empty">لا توجد منتجات. أضف منتجًا جديدًا.</div>')+'</div>';
}
var editingProduct=null;
function openProduct(product){
editingProduct=product?product.id:null;
$('#product-title').textContent=product?'تعديل المنتج':'منتج جديد';
$('#edit-name').value=product?product.name:'';
$('#edit-category').innerHTML=catList().map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>';}).join('');
if(product)$('#edit-category').value=product.cat;else if(S.productCat)$('#edit-category').value=S.productCat;
$('#edit-price').value=product?(product.sizes?product.sizes.M:product.price):'';
$('#edit-lprice').value=product&&product.sizes?product.sizes.L:'';
$('#edit-active').checked=!product||product.active;
$('#product-error').textContent='';$('#productscrim').hidden=false;$('#edit-name').focus();
}
async function saveProduct(btn){
var name=$('#edit-name').value.trim(), category=$('#edit-category').value, m=Number($('#edit-price').value), lv=$('#edit-lprice').value.trim(), l=Number(lv), error=$('#product-error');
if(!name||name==='__pos_category__'||!category||$('#edit-price').value.trim()===''||!Number.isFinite(m)||m<0||(lv&&(!Number.isFinite(l)||l<0))){error.textContent='اكتب الاسم والتصنيف وسعرًا صحيحًا لا يقل عن صفر';return;}
var doc={name:name,category:category,price:lv?null:Math.round(m*100)/100,sizes:lv?{M:Math.round(m*100)/100,L:Math.round(l*100)/100}:null,active:$('#edit-active').checked};
btn.disabled=true;try{var query=editingProduct?sb.from('products').update(doc).eq('id',editingProduct):sb.from('products').insert(doc);var r=await query;if(r.error)throw r.error;$('#productscrim').hidden=true;await reload();toast('تم حفظ المنتج');}catch(e){error.textContent='تعذر حفظ المنتج، راجع الاتصال والصلاحيات';}finally{btn.disabled=false;}
}

function renderAdmin() {
var st = rangeStart();
var sales = S.sales.filter(function (x) { return inRange(x.ts); }), exps = S.expenses.filter(function (x) { return inRange(x.ts); });
var tS = sum(sales, function (x) { return x.total; }), tE = sum(exps, function (x) { return x.amount; }), net = tS - tE;
var cash = sum(sales.filter(function (x) { return x.method !== 'card'; }), function (x) { return x.total; }), card = tS - cash;
var avg = sales.length ? tS / sales.length : 0;
var names = { today: 'اليوم', '7': 'آخر 7 أيام', '30': 'آخر 30 يوم', all: 'كل الفترات', custom: 'الفترة المحددة' };
var agg = {};
sales.forEach(function (x) { (x.items || []).forEach(function (i) { var k = i.b || i.n, a = agg[k] || (agg[k] = { q: 0, r: 0 }); a.q += i.q; a.r += i.q * i.p * (1-((x.adjustments||[]).find(function(a){return a.kind==='discount';})||{rate:0}).rate/100); }); });
var top = Object.keys(agg).map(function (k) { return { n: k, q: agg[k].q, r: agg[k].r }; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 6);
var topMax = top.length ? top[0].r : 1;
var expList = exps.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 12);
var prods = S.products.slice().sort(function (a, b) { return String(a.cat || '').localeCompare(String(b.cat || ''), 'ar') || String(a.name).localeCompare(String(b.name), 'ar'); });
var cats = catList();
var refs = S.orders.filter(function (x) { return x.state === 'refunded'; }).sort(function (a, b) { return (b.refundedAt || b.cts) - (a.refundedAt || a.cts); });
refs = refs.filter(function(x){return inRange(x.refundedAt || x.cts);});
var refR = refs;
var tR = sum(refR, function (x) { return x.total; });
var months = {}, mkeys = [];
refs.forEach(function (x) { var t = x.refundedAt || x.cts, d = new Date(t), k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); if (!months[k]) { months[k] = { n: 0, t: 0, ts: t }; mkeys.push(k); } months[k].n++; months[k].t += x.total; });
var refCard = '<section class="card"><h3>المرتجعات الشهرية <small>' + refs.length + ' مرتجع</small></h3>' +
(mkeys.length ? '<div class="rows">' + mkeys.map(function (k) { var m = months[k]; return '<div class="row"><div class="t"><b>' + new Date(m.ts).toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }) + '</b><small class="num">' + m.n + ' طلب مرتجع</small></div><div class="a num neg-v">' + money(m.t) + '</div></div>'; }).join('') + '</div>' +
'<h3>آخر المرتجعات</h3><div class="rows scroll">' + refs.slice(0, 30).map(function (x) { var t = x.refundedAt || x.cts; return '<div class="row"><div class="t">' + itemsHtml(x) + '<small class="num">' + dateFmt(t) + ' · ' + timeFmt(t) + (x.refundedBy ? ' · ' + esc(x.refundedBy) : '') + '</small>' + (x.reason ? '<small>السبب: ' + esc(x.reason) + '</small>' : '') + '</div><div class="a num neg-v">' + money(x.total) + '</div><span></span></div>'; }).join('') + '</div>' : '<div class="empty">لا توجد مرتجعات</div>') + '</section>';
$('#view-admin').innerHTML =
'<div class="bar"><h2>ملخص ' + names[S.range] + '</h2><div class="chips">' +
['today', '7', '30', 'all', 'custom'].map(function (r) { return '<button class="chip" data-range="' + r + '" aria-pressed="' + (S.range === r) + '">' + names[r] + '</button>'; }).join('') + '</div></div>' +
'<section class="card"><div class="date-range"><label>من تاريخ<input class="in" type="date" id="report-from" value="'+esc(S.dateFrom||dateKey(Date.now()))+'"></label><label>إلى تاريخ<input class="in" type="date" id="report-to" value="'+esc(S.dateTo||dateKey(Date.now()))+'"></label><button class="btn sm" id="apply-dates">عرض التقرير</button></div><small class="note">التواريخ بتوقيت القاهرة، وتشمل اليومين بالكامل.</small></section>' +
'<div class="kpis">' +
'<div class="kpi main"><span class="kl">إجمالي المبيعات</span><span class="kv num">' + money(tS) + '</span><span class="ks">' + sales.length + ' طلب · متوسط ' + money(avg) + '</span></div>' +
'<div class="kpi"><span class="kl">إجمالي المصروفات</span><span class="kv num neg-v">' + money(tE) + '</span><span class="ks">' + exps.length + ' بند</span></div>' +
'<div class="kpi"><span class="kl">المبيعات بعد المصروفات</span><span class="kv num ' + (net >= 0 ? 'pos-v' : 'neg-v') + '">' + (net < 0 ? '−' : '') + money(Math.abs(net)) + '</span><span class="ks">المبيعات − المصروفات</span></div>' +
'<div class="kpi"><span class="kl">المرتجعات</span><span class="kv num neg-v">' + money(tR) + '</span><span class="ks">' + refR.length + ' طلب مرتجع</span></div>' +
'<div class="kpi"><span class="kl">طرق الدفع</span><span class="kv num" style="font-size:1.25rem">كاش ' + fmt(cash) + '</span><span class="ks num">فيزا ' + fmt(card) + ' ج.م</span></div></div>' +
'<div class="cols">' +
'<section class="card"><h3>الفترة المحددة <small>المبيعات مقابل المصروفات</small></h3><div class="legend"><span><i style="background:var(--accent)"></i>مبيعات</span><span><i style="background:var(--bad)"></i>مصروفات</span></div><div class="chartbox">' + chartSvg() + '</div></section>' +
'<section class="card top5"><h3>الأكثر مبيعًا <small>' + names[S.range] + '</small></h3><div class="rows">' +
(top.length ? top.map(function (t) { return '<div class="row"><div class="t">' + esc(t.n) + '<small class="num">' + t.q + ' قطعة</small><div class="meter"><b style="width:' + Math.max(4, t.r / topMax * 100) + '%"></b></div></div><div class="a num">' + money(t.r) + '</div></div>'; }).join('') : '<div class="empty">لا مبيعات في هذه الفترة</div>') + '</div></section></div>' +
refCard +
'<section class="card"><h3>عهدات الكاشير</h3><p class="note">مراجعة مبيعات ومصروفات كل عهدة والكاش المتوقع والفعلي والعجز والزيادة.</p><button class="btn sm" id="admin-tills">عرض العهدات</button></section>' +
'<section class="card"><h3>صلاحيات الإلغاء</h3><p class="note">حدد رمز اعتماد لإلغاء طلبات الكاشير وتفريغ السلة. الأدمن يلغي مباشرة بدون رمز.</p><button class="btn sm" id="admin-cancel-security">تحديد أو تغيير رمز الإلغاء</button></section>'+
'<section class="card"><h3>إعدادات الطباعة</h3><p class="note">اختيار أوراق الكاشير والمطبخ والتحكم في ظهور الملاحظات.</p><button class="btn sm" id="open-printing">فتح إعدادات الطباعة</button></section>'+
'<section class="card"><h3>تصميم الإيصال</h3><p>عدّل اللوجو والنصوص وأحجام الخطوط وشوف معاينة قبل الطباعة.</p><a href="receipt-editor.html">فتح محرّر الإيصال</a></section>' +
'<section class="card"><h3>المصروفات <small>' + names[S.range] + '</small></h3>' +
'<div class="form"><input class="in" id="e-title" placeholder="بند المصروف (إيجار، كهرباء، فواكه…)" autocomplete="off"><input class="in num" id="e-amt" inputmode="decimal" placeholder="المبلغ" autocomplete="off"><button class="btn sm" id="e-add">تسجيل</button></div>' +
'<div class="rows">' + (expList.length ? expList.map(function (x) { return '<div class="row"><div class="t">' + esc(x.title) + '<small class="num">' + dateFmt(x.ts) + ' · ' + timeFmt(x.ts) + '</small></div><div class="a num neg-v">' + money(Number(x.amount)) + '</div>' + (x.tillId?'<span class="pill">مصروف عهدة</span>':delBtn('expenses', x.id, 'حذف')) + '</div>'; }).join('') : '<div class="empty">لا مصروفات مسجلة في هذه الفترة</div>') + '</div></section>' +
'<section class="card"><h3>الموظفون <small>' + S.staff.length + ' حساب</small></h3>' +
'<div class="form"><input class="in" id="s-name" maxlength="80" placeholder="اسم العرض — كاشير ١"><input class="in" id="s-email" type="email" inputmode="email" placeholder="بريد الموظف" autocomplete="off"><select class="in" id="s-role"><option value="cashier">كاشير</option><option value="admin">أدمن</option></select><button class="btn sm" id="s-add">إضافة</button></div>' +
'<div class="rows">' + S.staff.map(function (m) { return '<div class="row"><div class="t"><b>'+esc(m.name)+'</b><small class="num">'+esc(m.email)+'</small><small>' + (m.role === 'admin' ? 'أدمن' : 'كاشير') + '</small></div><button class="chip" data-staff-name="'+esc(m.email)+'">تعديل الاسم</button>' + (m.email === myEmail ? '<span class="note">أنت</span>' : delBtn('staff', m.email, 'حذف')) + '</div>'; }).join('') + '</div>' +
'<p class="note">بعد إضافة البريد، الموظف يفتح الرابط ويضغط "إنشاء حساب جديد" بنفس البريد ويختار كلمة مروره.</p></section>' +
'<section class="card"><h3>المنتجات والتصنيفات</h3><p class="note">إدارة الأصناف والأسعار والأحجام في صفحة مستقلة.</p><button class="btn sm" id="open-products">إدارة المنتجات</button></section>' +
'<p class="note">' + (mode === 'db' ? 'البيانات محفوظة ومتزامنة بين كل الأجهزة المسجلة بنفس الحساب.' : 'البيانات محفوظة على هذا الجهاز فقط ولا تظهر على أجهزة أخرى.') + '</p>';
}
function normPhone(s) { return String(s || '').replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[^0-9+]/g, ''); }
function custMatch(c, q) { var n = norm(q), ph = normPhone(q); return !n || norm(c.name).indexOf(n) >= 0 || (ph && String(c.phone).indexOf(ph) >= 0) || norm(c.address).indexOf(n) >= 0; }
async function saveCustomer(name, phone, address) {
name = String(name || '').trim(); phone = normPhone(phone); address = String(address || '').trim();
if (!name) { toast('اكتب اسم العميل'); return null; }
if (phone.length < 7) { toast('اكتب رقم موبايل صحيح'); return null; }
var r = await sb.from('customers').insert({ name: name, phone: phone, address: address || null }).select().single();
if (r.error) {
if (r.error.code === '23505' || /duplicate|unique/i.test(r.error.message || '')) {
var ex = await sb.from('customers').select('*').eq('phone', phone);
if (!ex.error && ex.data && ex.data.length) { await reload(); toast('العميل مسجل بالفعل، تم اختياره'); return ex.data[0].id; }
}
toast('تعذر حفظ العميل'); return null;
}
await reload();
toast('تم حفظ العميل');
return r.data.id;
}
function renderCust(force) {
var host = $('#cust'); host.hidden = S.otype !== 'delivery';
if (host.hidden) return;
var a = document.activeElement; if (!force && a && host.contains(a)) return;
var sel = S.customers.find(function (x) { return x.id === S.cust; });
if (sel) {
host.innerHTML = '<div class="custsel"><div><b>' + esc(sel.name) + '</b> <span class="num">' + esc(sel.phone) + '</span><small class="note" style="display:block">' + esc(sel.address || 'بدون عنوان') + '</small></div><button class="del" id="c-clear">تغيير</button></div>';
} else if (S.newCust) {
host.innerHTML = '<div class="custform"><input class="in" id="c-name" placeholder="اسم العميل" autocomplete="off"><input class="in num" id="c-phone" inputmode="tel" placeholder="رقم الموبايل" autocomplete="off"><input class="in" id="c-addr" placeholder="العنوان" autocomplete="off"><div class="seg"><button class="btn sm" id="c-save">حفظ واختيار</button><button class="btn ghost sm" id="c-cancel">رجوع</button></div></div>';
} else {
host.innerHTML = '<input class="in" id="c-q" type="search" placeholder="ابحث عن عميل بالاسم أو الموبايل" autocomplete="off" value="' + esc(S.custQ) + '"><div id="c-list" class="custlist"></div><button class="btn ghost sm" id="c-new">+ عميل جديد</button>';
renderCustList();
}
}
function renderCustList() {
var l = $('#c-list'); if (!l) return;
var res = S.customers.filter(function (c) { return custMatch(c, S.custQ); }).slice(0, 5);
l.innerHTML = res.length ? res.map(function (c) { return '<button class="custitem" data-cust="' + esc(c.id) + '"><span>' + esc(c.name) + '</span><span class="num note">' + esc(c.phone) + '</span></button>'; }).join('') : '<div class="note">لا يوجد عميل بهذا البحث</div>';
}
function renderCustomers() {
var agg = {};
S.sales.forEach(function (x) { if (x.customer && x.customer.id) { var a = agg[x.customer.id] || (agg[x.customer.id] = { n: 0, t: 0, last: 0 }); a.n++; a.t += Number(x.total) || 0; a.last = Math.max(a.last, x.ts); } });
var list = S.customers.filter(function (c) { return custMatch(c, S.cuQ); });
$('#view-customers').innerHTML = '<div class="bar"><h2>العملاء</h2><span class="note num">' + S.customers.length + ' عميل</span></div>' +
'<section class="card"><h3>إضافة عميل</h3><div class="form p"><input class="in" id="cu-name" placeholder="الاسم" autocomplete="off"><input class="in num" id="cu-phone" inputmode="tel" placeholder="الموبايل" autocomplete="off"><input class="in" id="cu-addr" placeholder="العنوان" autocomplete="off" style="grid-column: span 2"><button class="btn sm" id="cu-add">إضافة</button></div></section>' +
'<section class="card"><input class="in" id="cu-q" type="search" placeholder="بحث بالاسم أو الموبايل أو العنوان" autocomplete="off" value="' + esc(S.cuQ) + '">' +
'<div class="rows">' + (list.length ? list.map(function (c) {
var a = agg[c.id];
return '<div class="row"><div class="t"><b>' + esc(c.name) + '</b> · <a class="num" href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a><small>' + esc(c.address || 'بدون عنوان') + '</small>' + (a ? '<small class="num">' + a.n + ' طلب · ' + money(a.t) + '</small>' : '') + '</div><button class="del" data-cedit="' + esc(c.id) + '">تعديل</button>' + (S.role === 'admin' ? delBtn('customers', c.id, 'حذف') : '<span></span>') + '</div>';
}).join('') : '<div class="empty">' + (S.customers.length ? 'لا نتائج مطابقة' : 'لا يوجد عملاء بعد') + '</div>') + '</div></section>';
}
function openNote(key) {
var pr = key.split('|'), p = S.products.find(function (x) { return x.id === pr[0]; });
S.note = { key: key, text: pr[2] || '' };
$('#note-t').textContent = p ? p.name + (pr[1] ? ' (' + SIZE[pr[1]] + ')' : '') : 'ملاحظة';
$('#note-chips').innerHTML = NOTE_CHIPS.map(function (c) { return '<button class="chip" data-chip="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>'; }).join('');
$('#note-in').value = S.note.text;
syncChips();
$('#notescrim').hidden = false;
}
function syncChips() {
var t = S.note ? S.note.text : '';
document.querySelectorAll('#note-chips .chip').forEach(function (b) { b.setAttribute('aria-pressed', String(t.indexOf(b.dataset.chip) >= 0)); });
}
function saveNote() {
if (!S.note) return;
var text = S.note.text.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim(), old = S.note.key, pr = old.split('|');
var nk = pr[0] + '|' + (pr[1] || '') + (text ? '|' + text : '');
if (nk !== old && S.cart[old]) { var q = S.cart[old]; delete S.cart[old]; S.cart[nk] = (S.cart[nk] || 0) + q; }
S.note = null; $('#notescrim').hidden = true; renderPos();
}
function payOrder() { return S.orders.find(function (x) { return x.id === S.payId; }); }
function openPay(id) {
S.payId = id; S.payM = 'cash'; S.payPaid = '';
var o = payOrder(); if (!o) return;
$('#pay-t').textContent = 'تحصيل طلب #' + (todayNums()[o.id] || o.number);
$('#pay-total').textContent = money(o.total);
$('#pay-paid').value = '';
updatePay();
$('#payscrim').hidden = false;
}
function updatePay() {
var o = payOrder(); if (!o) return;
document.querySelectorAll('#pay-method button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pm === S.payM)); });
$('#pay-paid-row').hidden = S.payM !== 'cash';
var paid = parseFloat(S.payPaid), ch = $('#pay-change');
if (S.payM === 'cash' && !isNaN(paid)) {
ch.hidden = false;
if (paid >= o.total) { ch.style.color = 'var(--good)'; $('#pay-change-v').textContent = money(paid - o.total); $('#pay-change-l').textContent = 'الباقي للعميل'; }
else { ch.style.color = 'var(--bad)'; $('#pay-change-v').textContent = money(o.total - paid); $('#pay-change-l').textContent = 'ناقص'; }
} else ch.hidden = true;
}
async function confirmPay() {
if(S.role==='admin')return toast('التحصيل من حساب الكاشير');
var o = payOrder(); if (!o) return;
if(window.Till&&!Till.requireOpen())return;
var paid = parseFloat(S.payPaid);
if (S.payM === 'cash' && !isNaN(paid) && paid < o.total) return toast('المبلغ المدفوع أقل من الإجمالي');
var btn = $('#pay-ok'); btn.disabled = true;
try {
await orderUpdate(o.id, { state: 'completed', method: S.payM, paid: S.payM === 'cash' && !isNaN(paid) ? paid : null });
$('#payscrim').hidden = true; S.payId = null; toast('تم تحصيل الطلب ' + money(o.total));
} catch (e) { toast('تعذر التحصيل، ربما الطلب اتغيّر. حدّث الصفحة'); }
btn.disabled = false;
}
function setView(v) {
if(S.role==='admin'&&v==='pos')v='admin';
if ((v==='admin'||v==='products'||v==='printing') && S.role!=='admin') v='pos';
S.view = v;
['pos', 'orders', 'customers', 'admin', 'products', 'till', 'printing'].forEach(function (k) { $('#view-' + k).hidden = k !== v; $('#nav-' + k).setAttribute('aria-pressed', String(k === v)); });
try { localStorage.setItem(LS + 'view', v); } catch (e) {}
window.scrollTo(0, 0);
renderAll();
}
function renderAll() {
if (S.view === 'printing' && window.PrintSettings) PrintSettings.render();
else if (S.view === 'till' && window.Till) Till.render();
else if (S.view === 'pos') renderPos();
else if (S.view === 'orders') renderOrders();
else {
var a = document.activeElement, vals = {};
var typing = a && a.tagName === 'INPUT' && a.closest && a.closest('#view-' + S.view);
if (typing) ADMIN_IDS.concat(['s-role']).forEach(function (i) { var el = document.getElementById(i); if (el) vals[i] = el.value; });
if (S.view === 'customers') renderCustomers(); else if(S.view === 'products') renderProducts(); else renderAdmin();
if (typing) { Object.keys(vals).forEach(function (i) {var el=document.getElementById(i);if(el)el.value=vals[i];}); var f = document.getElementById(a.id); if (f) f.focus(); }
}
renderCart(); renderCust();
var na = S.orders.filter(function (x) { return x.state === 'active'; }).length, bd = $('#ob');
bd.hidden = !na; bd.textContent = na;
}
document.addEventListener('click', async function (e) {
var t = e.target.closest('button'); if (!t) return;
if(t.dataset.discountPreset){$('#discount-input').value=t.dataset.discountPreset;return;}
if (t.id === 'discount-open') {$('#discount-input').value=S.discount||'';$('#discountscrim').hidden=false;$('#discount-input').focus();return;}
if (t.id === 'discount-close') {$('#discountscrim').hidden=true;$('#discount-open').focus();return;}
if (t.id === 'discount-apply') {var rate=Number($('#discount-input').value);if(!Number.isFinite(rate)||rate<0||rate>100)return toast('الخصم من 0 إلى 100%');S.discount=rate;$('#discountscrim').hidden=true;renderCart();return;}
if (t.id === 'discount-remove') {S.discount=0;renderCart();return;}
if (t.id === 'delivery-remove') {S.deliveryFee=0;$('#delivery-fee').value='';renderCart();return;}
if (t.id === 'apply-dates') {var from=$('#report-from').value,to=$('#report-to').value;if(!from||!to||!Number.isFinite(dayBoundary(from))||!Number.isFinite(dayBoundary(to))||from>to)return toast('اختار فترة صحيحة: من تاريخ لا يتجاوز إلى تاريخ');S.dateFrom=from;S.dateTo=to;S.range='custom';renderAdmin();return;}
if (t.dataset.range === 'custom' && !S.dateFrom) {S.dateFrom=dateKey(Date.now());S.dateTo=S.dateFrom;}
if (t.id === 'cat-add') {if(S.role!=='admin')return;var cname=$('#category-name').value.trim();if(!cname)return toast('اكتب اسم التصنيف');if(catList().includes(cname))return toast('التصنيف موجود بالفعل');t.disabled=true;try{await addDoc('products',{name:'__pos_category__',cat:cname,price:0,active:false});toast('تم إضافة التصنيف');}catch(e){toast('تعذر إضافة التصنيف');}return;}
if (t.dataset.catRename) {if(S.role!=='admin')return;var old=t.dataset.catRename,next=prompt('اسم التصنيف الجديد',old);if(next===null||!next.trim()||next.trim()===old)return;next=next.trim();if(catList().includes(next))return toast('الاسم مستخدم لتصنيف آخر');var cr=await sb.from('products').update({category:next}).eq('category',old);if(cr.error)return toast('تعذر تعديل التصنيف');S.productCat=next;await reload();toast('تم تعديل التصنيف');return;}
if (t.dataset.catDelete) {if(S.role!=='admin')return;var category=t.dataset.catDelete;if(S.products.some(function(p){return p.cat===category;}))return toast('انقل أو احذف المنتجات الموجودة في التصنيف أولًا');if(!confirm('حذف التصنيف '+category+'؟'))return;var cd=await sb.from('products').delete().eq('name','__pos_category__').eq('category',category);if(cd.error)return toast('تعذر حذف التصنيف');S.productCat='';await reload();return;}
if (t.dataset.productEdit) {if(S.role!=='admin')return;openProduct(S.products.find(function(p){return p.id===t.dataset.productEdit;}));return;}
if (t.id === 'product-new') {if(S.role!=='admin')return;openProduct(null);return;}
if (t.id === 'product-cancel') {$('#productscrim').hidden=true;return;}
if (t.id === 'product-save') {if(S.role!=='admin')return;await saveProduct(t);return;}
if (t.dataset.productToggle) {if(S.role!=='admin')return;var product=S.products.find(function(p){return p.id===t.dataset.productToggle;});if(!product)return;var pr=await sb.from('products').update({active:!product.active}).eq('id',product.id);if(pr.error)return toast('تعذر تغيير حالة المنتج');await reload();return;}
if (t.dataset.manageCat!==undefined) {S.productCat=t.dataset.manageCat;renderProducts();return;}
if (t.dataset.print) {
var order = S.orders.find(function (x) { return x.id === t.dataset.print; });
if (!order || t.disabled) return;
if (!confirm('طباعة نسخة على ' + (t.dataset.role === 'cashier' ? 'طابعة الكاشير' : 'طابعة المطبخ') + '؟')) return;
t.disabled = true;
try {
var pr = await sb.from('printers').select('ip,port,enabled').eq('role', t.dataset.role).single();
if (pr.error) throw pr.error;
await JuicePrint.send(order, t.dataset.role, todayNums()[order.id] || order.number, pr.data);
toast('تم إرسال البيانات للطابعة؛ راجع خروج الورقة');
} catch (err) { toast('تعذر تأكيد الطباعة. راجع الطابعة قبل إعادة المحاولة.'); }
finally { t.disabled = false; }
return;
}
if (t.id === 'logout') { await sb.auth.signOut(); return; }
if (t.id === 'import-menu') { t.disabled = true; try { await importMenu(); toast('تم استيراد المنيو'); } catch (err) { toast('تعذر الاستيراد'); t.disabled = false; } return; }
if(t.dataset.staffName){if(S.role!=='admin')return;var member=S.staff.find(function(m){return m.email===t.dataset.staffName;});var chosen=prompt('اسم العرض للموظف',member?member.name:'');if(chosen===null)return;if(!chosen.trim()||chosen.trim().length>80)return toast('اكتب اسمًا من 1 إلى 80 حرفًا');var renamed=await sb.rpc('set_staff_display_name',{p_email:t.dataset.staffName,p_name:chosen.trim()});if(renamed.error)return toast('تعذر تغيير الاسم');await reload();return toast('تم تغيير اسم الموظف');}
if (t.id === 'nav-pos') { S.cat = null; S.q = ''; $('#q').value = ''; return setView('pos'); }
if (t.id === 'nav-orders') return setView('orders');
if(t.id==='nav-printing'||t.id==='open-printing')return setView('printing');
if (t.id === 'nav-admin') return setView('admin');
if (t.id === 'nav-products' || t.id === 'open-products') return setView('products');
if (t.id === 'nav-cart') return $('#cart-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
if (t.id === 'back') { S.cat = null; return renderPos(); }
if (t.dataset.cat) { S.cat = t.dataset.cat; window.scrollTo(0, 0); return renderPos(); }
if (t.dataset.p) {
var p = S.products.find(function (x) { return x.id === t.dataset.p; }); if (!p) return;
return p.sizes ? openSheet(p) : addToCart(p.id + '|');
}
if (t.dataset.size) { $('#scrim').hidden = true; return addToCart(t.dataset.pid + '|' + t.dataset.size); }
if (t.id === 'sheet-x') { $('#scrim').hidden = true; return; }
if (t.dataset.inc) { S.cart[t.dataset.inc]++; return renderPos(); }
if (t.dataset.dec) { var k = t.dataset.dec; S.cart[k]--; if (S.cart[k] <= 0) delete S.cart[k]; return renderPos(); }
if (t.dataset.m) { S.method = t.dataset.m; return renderCart(); }
if (t.dataset.t) { S.otype = t.dataset.t; if(S.otype!=='delivery'){S.deliveryFee=0;$('#delivery-fee').value='';} renderCart(); return renderCust(true); }
if(t.id==='clear'&&S.role!=='admin'&&Object.keys(S.cart).length){return CancelSecurity.open(null,function(){S.cart={};clearAdjustments();S.paid='';$('#paid').value='';renderPos();});}
if (t.id === 'clear') { S.cart = {}; clearAdjustments(); S.paid = ''; $('#paid').value = ''; return renderPos(); }
if (t.id === 'checkout') return checkout();
if (t.dataset.range) { S.range = t.dataset.range; return renderAdmin(); }
if(t.dataset.del&&t.dataset.del.startsWith('ocancel:')&&S.role!=='admin'){return CancelSecurity.open(t.dataset.del.slice(8));}
if (t.dataset.del) {
if (S.armed === t.dataset.del) {
var pr = t.dataset.del.split(':'); S.armed = '';
var dcol = pr[0], did = pr.slice(1).join(':');
try {
if (dcol === 'orefund') {
var why = prompt('سبب المرتجع (اختياري)', ''); if (why === null) return renderAll();
await orderUpdate(did, { state: 'refunded', refund_reason: why.trim() || null }); toast('تم تسجيل المرتجع');
} else if (dcol === 'ocancel') { await orderUpdate(did, { state: 'cancelled' }); toast('تم إلغاء الطلب'); }
else { await delDoc(dcol, did); toast('تم الحذف'); }
} catch (err) { toast('تعذر تنفيذ العملية'); }
return renderAll();
}
S.armed = t.dataset.del; renderAll();
setTimeout(function () { if (S.armed === t.dataset.del) { S.armed = ''; renderAll(); } }, 3000);
return;
}
if (t.id === 'nav-customers') return setView('customers');
if (t.id === 'kitchen') return checkout('active');
if (t.dataset.note) return openNote(t.dataset.note);
if (t.dataset.chip) { if (!S.note) return; var ct = t.dataset.chip, tx = S.note.text; S.note.text = tx.indexOf(ct) >= 0 ? tx.replace(ct, '').replace(/\s*[،,]\s*[،,]\s*/g, '، ').replace(/^\s*[،,]\s*|\s*[،,]\s*$/g, '').trim() : (tx.trim() ? tx.trim() + '، ' : '') + ct; $('#note-in').value = S.note.text; return syncChips(); }
if (t.id === 'note-ok') return saveNote();
if (t.id === 'note-x') { S.note = null; $('#notescrim').hidden = true; return; }
if (t.dataset.of) { S.ofilter = t.dataset.of; return renderOrders(); }
if (t.dataset.pay) return openPay(t.dataset.pay);
if (t.dataset.pm) { S.payM = t.dataset.pm; return updatePay(); }
if (t.id === 'pay-ok') return confirmPay();
if (t.id === 'pay-x') { $('#payscrim').hidden = true; S.payId = null; return; }
if (t.dataset.cust) { S.cust = t.dataset.cust; return renderCust(true); }
if (t.id === 'c-clear') { S.cust = null; S.custQ = ''; return renderCust(true); }
if (t.id === 'c-new') { S.newCust = true; return renderCust(true); }
if (t.id === 'c-cancel') { S.newCust = false; return renderCust(true); }
if (t.id === 'c-save') {
t.disabled = true;
var cid = await saveCustomer($('#c-name').value, $('#c-phone').value, $('#c-addr').value);
if (cid) { S.cust = cid; S.newCust = false; renderCust(true); } else t.disabled = false;
return;
}
if (t.id === 'cu-add') {
t.disabled = true;
var cid2 = await saveCustomer($('#cu-name').value, $('#cu-phone').value, $('#cu-addr').value);
if (cid2) ['cu-name', 'cu-phone', 'cu-addr'].forEach(function (i) { var el = document.getElementById(i); if (el) el.value = ''; });
renderCustomers(); return;
}
if (t.dataset.cedit) {
var cc = S.customers.find(function (x) { return x.id === t.dataset.cedit; }); if (!cc) return;
var nn = prompt('الاسم', cc.name); if (nn === null) return;
var np = prompt('الموبايل', cc.phone); if (np === null) return;
var na = prompt('العنوان', cc.address || ''); if (na === null) return;
np = normPhone(np);
if (!nn.trim() || np.length < 7) return toast('الاسم والموبايل مطلوبين');
var ur = await sb.from('customers').update({ name: nn.trim(), phone: np, address: na.trim() || null }).eq('id', cc.id);
if (ur.error) return toast('تعذر التعديل، ربما الرقم مسجل لعميل آخر');
await reload(); toast('تم التعديل'); return;
}
if (t.id === 'e-add') {
var title = $('#e-title').value.trim(), amt = parseFloat($('#e-amt').value);
if (!title || isNaN(amt) || amt <= 0) return toast('اكتب بند المصروف والمبلغ');
try { if(window.Till){if(!await Till.addQuickExpense(title,amt,'أخرى',''))return;await reload();}else await addDoc('expenses', { ts: Date.now(), title: title, amount: amt }); $('#e-title').value = ''; $('#e-amt').value = ''; toast('تم تسجيل المصروف'); } catch (err) { toast('تعذر الحفظ'); }
return renderAll();
}
if (t.id === 's-add') {
var se = $('#s-email').value.trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(se)) return toast('اكتب بريد صحيح للموظف');
try { await addDoc('staff', { email: se, role: $('#s-role').value, name:$('#s-name').value.trim() }); $('#s-email').value = ''; $('#s-name').value='';toast('تمت إضافة الموظف'); } catch (err) { toast('تعذر الحفظ، ربما البريد مضاف بالفعل'); }
return renderAll();
}
if (t.id === 'p-add') {
var n = $('#p-name').value.trim(), c = $('#p-cat').value.trim(), m = parseFloat($('#p-price').value), l = parseFloat($('#p-lprice').value);
if (!n || isNaN(m) || m < 0) return toast('اكتب اسم المنتج وسعره');
var doc = { name: n, cat: c || 'أخرى' };
if (!isNaN(l)) doc.sizes = { M: m, L: l }; else doc.price = m;
try { await addDoc('products', doc); ['p-name', 'p-price', 'p-lprice'].forEach(function (i) { $('#' + i).value = ''; }); toast('تمت إضافة المنتج'); } catch (err) { toast('تعذر الحفظ'); }
return renderAll();
}
});
$('#scrim').addEventListener('click', function (e) { if (e.target.id === 'scrim') $('#scrim').hidden = true; });
$('#notescrim').addEventListener('click', function (e) { if (e.target.id === 'notescrim') { S.note = null; $('#notescrim').hidden = true; } });
$('#payscrim').addEventListener('click', function (e) { if (e.target.id === 'payscrim') { $('#payscrim').hidden = true; S.payId = null; } });
setInterval(function () { if (S.view === 'orders' && !S.payId) renderOrders(); }, 60000);
$('#q').addEventListener('input', function (e) { S.q = e.target.value.trim(); renderPos(); });
document.addEventListener('input', function (e) {
if(e.target.id==='delivery-fee'){var fee=Number(e.target.value);S.deliveryFee=Number.isFinite(fee)&&fee>=0?Math.round(fee*100)/100:0;e.target.setCustomValidity(fee<0?'الرسوم لا يمكن تكون سالبة':'');renderCart();}
else if(e.target.id==='product-search'){S.productQ=e.target.value;renderProductRows();}
else if (e.target.id === 'note-in') { if (S.note) { S.note.text = e.target.value; syncChips(); } }
else if (e.target.id === 'pay-paid') { S.payPaid = e.target.value; updatePay(); }
else if (e.target.id === 'c-q') { S.custQ = e.target.value; renderCustList(); }
else if (e.target.id === 'cu-q') { S.cuQ = e.target.value; var el = e.target, pos = el.selectionStart; renderCustomers(); var n2 = document.getElementById('cu-q'); if (n2) { n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (x) {} } }
});
$('#paid').addEventListener('input', function (e) { S.paid = e.target.value; renderCart(); });
async function boot() {
var v = 'pos';
try { v = localStorage.getItem(LS + 'view') || 'pos'; } catch (e) {}
setView(v === 'admin' || v === 'orders' || v === 'customers' || v === 'products' || v === 'till' ? v : 'pos');
sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') { S.products = []; S.sales = []; S.expenses = []; S.staff = []; S.customers = []; S.orders = []; S.cust = null; S.newCust = false; S.role = 'cashier'; S.cart = {}; clearAdjustments(); S.discount=0; if(window.CancelSecurity)CancelSecurity.reset();if(window.PrintSettings)PrintSettings.reset();if(window.Till)Till.reset();myEmail='';showLogin(); } });
var r = await sb.auth.getSession();
if (r.data.session) enter(r.data.session); else showLogin();
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){['discountscrim','productscrim'].forEach(function(id){$('#'+id).hidden=true;});}});
if(window.Till)Till.init({client:sb,role:function(){return S.role;},email:function(){return myEmail;},onChange:reload,showMessage:toast,changeView:setView,amount:money,escape:esc});
if(window.PrintSettings)PrintSettings.init({client:sb,role:function(){return S.role;},toast:toast});
if(window.CancelSecurity)CancelSecurity.init({client:sb,role:function(){return S.role;},reload:reload,toast:toast});
boot();
})();


