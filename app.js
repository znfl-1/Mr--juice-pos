(function () {
var $ = function (s) { return document.querySelector(s); };
var fmt = function (n) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
var money = function (n) { return fmt(n) + ' ج.م'; };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
var timeFmt = function (ts) { return new Date(ts).toLocaleTimeString('ar-EG-u-nu-latn', {timeZone:'Africa/Cairo', hour: 'numeric', minute: '2-digit' }); };
var dateFmt = function (ts) { return new Date(ts).toLocaleDateString('ar-EG-u-nu-latn', {timeZone:'Africa/Cairo', day: 'numeric', month: 'short' }); };
var SIZE = { M: 'M', L: 'L' };
var TYPE = { dine: 'صالة', take: 'تيك أواي', delivery: 'دليفري' };
var CAT_ORDER = ['العصائر الطازجة', 'سموزي', 'ميلك شيك', 'موهيتو', 'الزبادي اليوناني', 'جيلاتو', 'ساندي', 'العصائر العائلية', 'وافل', 'بان كيك', 'فروت سلاط', 'قهوة', 'أيس كوفي'];
var COLS = ['products', 'sales', 'expenses'];
var NOTE_CHIPS = ['بدون سكر', 'سكر خفيف', 'سكر زيادة', 'سكر على جنب', 'بدون ثلج', 'ثلج زيادة', 'بدون لبن', 'بدون نعناع', 'بدون كريمة', 'بدون مكسرات'];
var TAGS = ['طلب مستعجل', 'عميل دائم', 'توصيل سريع', 'طلب كبير', 'حفلة', 'مناسبة'];
var STATE_AR = { active: 'نشط', completed: 'مكتمل', refunded: 'مرتجع', cancelled: 'ملغي' };
var STAR = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6v36M8.4 15l31.2 18M8.4 33l31.2-18"/></svg>';
var S = { view: 'pos', cat: null, q: '', method: 'cash', otype: 'dine', typePicked: false, paid: '', range: 'today', dateFrom: '', dateTo: '', discount: 0, deliveryFee: 0, categories: [], productCat: '', productQ: '', armed: '', busy: false, pendingOrder: null, loading: true, role: 'cashier', staff: [], customers: [], cust: null, newCust: false, custQ: '', cuQ: '', orders: [], ofilter: 'active', orderQ: '', selectedOrderId: null, payBusy: false, refundId: null, refundBusy: false, payId: null, payM: 'cash', payPaid: '', note: null, orderNote: '', orderTag: '', products: [], sales: [], expenses: [], cart: {} };
var db = null, mode = 'local', LS = 'pos_sys_v2_';
var SB_URL = 'https://njrejjufurycusjhzfdv.supabase.co';
var SB_KEY = 'sb_publishable_QTk_CJO1kCz53R32-JNgBg_2vTq-Lvu';
const ipadPrint = (() => {
 const key='mr-cashier-ipad-print-v1';
 let config=JSON.parse(localStorage.getItem(key)||'{}'), busy=false, running=false, tillBusy=false, tillErrShown=false;
 const save=()=>localStorage.setItem(key,JSON.stringify(config));
 function transport(url,options={}) {
  const path=new URL(typeof url==='string'?url:url.url||String(url),location.href);
  if(config.device && path.origin===new URL(SB_URL).origin && options.method && ['POST','PATCH'].includes(options.method.toUpperCase()) && ['/rest/v1/rpc/submit_pos_order','/rest/v1/orders'].includes(path.pathname)){
   const headers=new Headers(options.headers);headers.set('x-pos-ipad',config.device);
   if(config.kitchen)headers.set('x-pos-kitchen','yes');
   if(path.pathname.endsWith('/submit_pos_order'))headers.set('x-pos-submit','yes');
   options={...options,headers};
  }
  return fetch(url,options);
 }
 const notify=msg=>{const el=document.getElementById('ipad-status');if(el)el.textContent=msg;toast(msg);};
 async function send(ip,body,statusOnly=false){
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))throw Error('عنوان الطابعة غير صالح');
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
  try{
   const r=await fetch('https://'+ip+'/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000',{method:'POST',credentials:'omit',signal:ctl.signal,headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':'""'},body:'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">'+body+(statusOnly?'':'<feed line="3"/><cut type="feed"/>')+'</epos-print></s:Body></s:Envelope>'});
   const node=new DOMParser().parseFromString(await r.text(),'application/xml').getElementsByTagNameNS('*','response')[0];
   if(!r.ok||node?.getAttribute('success')!=='true')throw Error(node?.getAttribute('code')||'تعذّر تأكيد الطباعة');
  }finally{clearTimeout(timer);}
 }
 function raster(lines){
  const canvas=document.createElement('canvas');canvas.width=576;canvas.height=40;
  const ctx=canvas.getContext('2d');let rows=[];
  for(const [text,bold] of lines){
   ctx.font=(bold?'bold ':'')+'26px Arial';let row='';
   for(const ch of String(text)){if(row&&ctx.measureText(row+ch).width>548){rows.push([row,bold]);row='';}row+=ch;}rows.push([row,bold]);
  }
  let xml='';
  for(let start=0;start<rows.length;start+=16){
   const block=rows.slice(start,start+16);canvas.height=40*block.length;ctx.fillStyle='white';ctx.fillRect(0,0,576,canvas.height);ctx.fillStyle='black';ctx.direction='rtl';ctx.textAlign='right';
   block.forEach(([line,bold],i)=>{ctx.font=(bold?'bold ':'')+'26px Arial';ctx.fillText(line,562,30+i*40);});
   const pixels=ctx.getImageData(0,0,576,canvas.height).data;let binary='';
   for(let i=0;i<pixels.length;i+=32){let byte=0;for(let bit=0;bit<8;bit++)if(pixels[i+bit*4]<155)byte|=128>>bit;binary+=String.fromCharCode(byte);}
   xml+='<image width="576" height="'+canvas.height+'" color="color_1" mode="mono">'+btoa(binary)+'</image>';
  }
  return xml;
 }
 async function paperLayout(job,items){
  const o=job.order,k=job.kind,num=o.day_number||o.number;
  let cfg={};try{cfg=JSON.parse(localStorage.getItem('mrjuice_receipt_design')||'{}')||{};}catch{}
  const width=576, pad=12, tile=document.createElement('canvas');tile.width=width;
  const c=tile.getContext('2d'), ops=[];let y=8;
  const size=Math.round(Math.max(18,Math.min(36,Number(cfg.font_size)||26))*(k==='receipt'?1.36:1.55));
  const price=n=>'EGP '+Number(n).toFixed(2);
  const type=({take:'Pick Up',delivery:'Delivery',dine:'Dine In'})[o.order_type]||'Pick Up';
  function text(t,x,align='left',px=size,bold=false,limit=552){
   t=String(t??'');const font=(bold?'bold ':'')+px+'px Arial';c.font=font;
   let lines=[],row='';
   for(const word of t.split(/\s+/)){let next=row?row+' '+word:word;if(row&&c.measureText(next).width>limit){lines.push(row);row=word;}else row=next;}lines.push(row);
   const top=y,step=px+(k==='receipt'?10:6);ops.push(()=>{c.font=font;c.fillStyle='black';c.textAlign=align;c.direction=/[\u0600-\u06ff]/.test(t)?'rtl':'ltr';lines.forEach((line,i)=>c.fillText(line,x,top+px+i*step,limit));});return step*lines.length;
  }
  function center(t,px=size,bold=false){y+=text(t,width/2,'center',px,bold);}
  function pair(l,r){y+=Math.max(text(l,pad,'left',size,false,265),text(r,width-pad,'right',size,false,265));}
  function rule(){const at=y+3;ops.push(()=>{c.fillStyle='black';c.fillRect(pad,at,width-2*pad,1);});y+=9;}
  function stamp(timestamp){if(k==='receipt'){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));return parts.year+'/'+parts.month+'/'+parts.day+' '+parts.hour+':'+parts.minute+':'+parts.second+' '+parts.dayPeriod;}return new Date(timestamp).toLocaleString('en-GB',{timeZone:'Africa/Cairo',hour12:true});}
  const receipt=k==='receipt',date=o.created_at;
  if(receipt && cfg.show_logo!==false){
   const img=new Image();img.src=cfg.logo_data?.startsWith('data:image/png;base64,')?cfg.logo_data:'/receipt-logo.png';
   try{await img.decode();const scale=Math.min(width*(Number(cfg.logo_width_percent)||75)/100/img.width,150/img.height),w=img.width*scale,h=img.height*scale,top=y;ops.push(()=>c.drawImage(img,(width-w)/2,top,w,h));y+=Math.ceil(h)+4;}catch{center(cfg.shop_name||'Mr Juice');}
  }else center(cfg.shop_name||'Mr Juice');
  if(receipt){if(cfg.subtitle!== '')center('\u2066'+(cfg.subtitle||'Mr.Juice - الرفاعي')+'\u2069',29);if(cfg.invoice_title!=='')center(cfg.invoice_title||'Simplified Tax Invoice',29);}
  const top=y;center('Order# '+num,(Number(cfg.order_font_size)||40)*(receipt?1.28:1),true);
  if(receipt){const h=y-top+4;c.font='bold '+((Number(cfg.order_font_size)||40)*(receipt?1.28:1))+'px Arial';const w=Math.min(540,c.measureText('Order# '+num).width+24);ops.push(()=>{c.strokeStyle='black';c.strokeRect((width-w)/2,top,w,h);});y+=8;}
  if(!receipt||cfg.show_printed_at!==false)center('Printed At: '+stamp(Date.now()),receipt?30:21);
  rule();
  if(receipt){rule();y+=text('الكاشير: '+(o.paid_by_name||o.created_by_name||'كاشير'),width-pad,'right',29);pair(type,cfg.show_check_number===false?'':'Check# '+num);y+=text(stamp(date),width-pad,'right',29);
   if(cfg.show_customer!==false&&o.customer)for(const t of [o.customer.name,o.customer.phone,o.customer.address])if(t)center(t,22);
   rule();y+=Math.max(text('Qty',pad),text('Item',76),text('Price',564,'right'));rule();
  }else{pair('Type:',type);pair('Guests:','1');pair('Device:',o.created_by_name||'Cashier');pair('Date:',stamp(date).split(',')[0]);pair('Time:',new Date(date).toLocaleTimeString('en-US',{timeZone:'Africa/Cairo'}));rule();center('New');rule();}
  for(const i of items){const label=String(i.b||i.n||'').split(' · ').slice(-1)[0]+(i.b&&i.z?' '+i.z:'');
   y+=Math.max(text(i.q,pad,'left',size,false,58),text(label,receipt?76:80,'left',size,false,receipt?265:476),receipt?text(price(i.q*i.p),564,'right',size,false,211):0);
   if(i.note&&job.settings[{receipt:'receipt_notes',pickup:'pickup_notes',kitchen:'kitchen_notes'}[k]])y+=text('ملاحظة: '+i.note,80,'left',22,false,470);
   if(!receipt)rule();
  }
  if(receipt){rule();const adjustments=o.items.filter(i=>i.__pos_adjustment);if(adjustments.length)pair('Subtotal',price(items.reduce((a,i)=>a+i.q*i.p,0)));
   for(const a of adjustments)pair(a.n,price(a.kind==='discount'?-a.amount:a.amount));function amountRow(label,value){y+=Math.max(text(label,350,'right',size,false,335),text(value,564,'right',size,false,205));}amountRow('Total',price(o.total));amountRow('Payment - '+(o.method==='card'?'Visa':'Cash'),price(o.paid??o.total));
   if(o.paid!=null&&o.paid>o.total)amountRow('Change',price(o.paid-o.total));rule();
   if(cfg.show_product_count!==false)center('Products Count '+items.reduce((a,i)=>a+Number(i.q),0),size);
   if(cfg.footer)center(cfg.footer,22);if(cfg.delivery_phone!=='')center('For delivery: '+(cfg.delivery_phone||'0402232302'),30);
  }
  const height=Math.ceil(y+12);let xml='';
  for(let start=0;start<height;start+=256){tile.height=Math.min(256,height-start);c.fillStyle='white';c.fillRect(0,0,width,tile.height);c.save();c.translate(0,-start);for(const draw of ops)draw();c.restore();
   const pixels=c.getImageData(0,0,width,tile.height).data;let binary='';for(let i=0;i<pixels.length;i+=32){let byte=0;for(let b=0;b<8;b++)if(pixels[i+b*4]<155)byte|=128>>b;binary+=String.fromCharCode(byte);}
   xml+='<image width="576" height="'+tile.height+'" color="color_1" mode="mono">'+btoa(binary)+'</image>';
  }return xml;
 }
 async function documentBody(job){
  const o=job.order,s=job.settings,k=job.kind,receipt=k==='receipt';
  const enabled={receipt:s.cashier_receipt,pickup:s.cashier_pickup,kitchen:s.kitchen_ticket};
  if(!enabled[k])return '';
  const items=o.items.filter(i=>!i.__pos_adjustment&&(receipt||s.category_routes?.[i.category||String(i.b||'').split(' · ').slice(0,-1).join(' · ')]?.[k]!==false));
  if(!receipt&&!items.length)return '';
  if(receipt||k==='pickup'||k==='kitchen')return paperLayout(job,items);
  const lines=[['Mr Juice'],['طلب #'+(o.day_number||o.number),true],[{receipt:'إيصال العميل',pickup:'تجهيز',kitchen:'المطبخ'}[k]+' · '+(TYPE[o.order_type]||'')],[dateFmt(Date.parse(o.created_at))+' · '+timeFmt(Date.parse(o.created_at))]];
  if(o.customer)lines.push([o.customer.name||''],[o.customer.phone||''],[o.customer.address||'']);
  for(const i of items){lines.push([i.q+' × '+(i.n||i.b)+(receipt?'   '+money(i.q*i.p):'')]);if(i.note&&s[{receipt:'receipt_notes',pickup:'pickup_notes',kitchen:'kitchen_notes'}[k]])lines.push(['ملاحظة: '+i.note]);}
  if(receipt){for(const a of o.items.filter(i=>i.__pos_adjustment))lines.push([a.n+' '+money(a.amount)]);lines.push(['الإجمالي '+money(o.total)],[o.method==='card'?'فيزا':'كاش']);if(o.paid!=null)lines.push(['المدفوع '+money(o.paid)],['الباقي '+money(o.paid-o.total)]);}
  return raster(lines);
 }
 async function drain(){
  if(busy||!config.device||!myEmail||S.role!=='cashier'||document.hidden)return;
  busy=true;
  try{for(let count=0;count<10;count++){
   const d=config.device,next=await sb.rpc('ipad_next',{d});if(next.error)throw next.error;const job=next.data;if(!job)break;
   let ok=true,msg='';try{const body=await documentBody(job);if(body)await send(job.ip,body);}catch(e){ok=false;msg=e.message;notify('راجع ورقة الطلب #'+(job.order.day_number||job.order.number)+' — '+msg);}
   const ack=await sb.rpc('ipad_finish',{d,j:job.id,ok,msg});if(ack.error)throw ack.error;
  }}catch(e){notify('تعذّر تأكيد حالة طباعة الآيباد');}finally{busy=false;}
 }
 function tillBody(report){
  const t=report.session,s=report.summary||{},sep='————————————————';
  const row=(label,key,bold)=>[label+': '+money(Number(s[key]||0)),!!bold];
  const lines=[['Mr Juice',true],['ملخص العهدة',true],['تاريخ العمل: '+t.business_date],['الكاشير: '+(t.cashier_name||'كاشير')],[String(t.drawer||'')],['الفتح: '+dateFmt(Date.parse(t.opened_at))+' '+timeFmt(Date.parse(t.opened_at))],['الإغلاق: '+dateFmt(Date.parse(t.closed_at))+' '+timeFmt(Date.parse(t.closed_at))],[sep],['المدفوعات',true],
   row('مبيعات كاش','cash_sales'),row('مبيعات كارت','card_sales'),row('إجمالي المدفوعات','total_payments',true),row('مرتجعات كاش','cash_refunds'),row('مرتجعات كارت','card_refunds'),row('صافي المدفوعات','net_payments',true),[sep],['حركات الدرج',true],
   row('المصروفات','expenses'),row('إضافات نقدية','pay_in'),row('سحب كاش','pay_out'),row('توريد للخزنة','cash_drops')];
  const expenses=(report.entries||[]).filter(e=>e.kind==='expense');
  if(expenses.length){lines.push([sep],['تفاصيل المصروفات',true]);for(const e of expenses){lines.push([e.title+': '+money(Math.abs(Number(e.amount||0)))]);if(e.category)lines.push([e.category]);if(e.note)lines.push([e.note]);}}
  const d=t.difference!=null?Number(t.difference):Number(t.counted_amount||0)-Number(s.expected_cash||0);
  lines.push([sep],['كاش بداية العهدة: '+money(Number(t.opening_amount||0))],['الكاش المتوقع في الدرج: '+money(Number(s.expected_cash||0)),true],['الكاش الفعلي: '+money(Number(t.counted_amount||0)),true],
   [d<0?'العجز: '+money(Math.abs(d)):d>0?'الزيادة: '+money(d):'الفرق: العهدة مطابقة',true]);
  if(t.close_note)lines.push([sep],['ملاحظة الإغلاق: '+t.close_note]);
  return raster(lines);
 }
 async function drainTill(){
  if(tillBusy||!config.device||!myEmail||S.role!=='cashier'||document.hidden)return;
  tillBusy=true;
  try{
   const stale=new Date(Date.now()-3*60000).toISOString();
   const q=await sb.from('till_print_jobs').select('id,session_id,attempts,status,created_at').or('status.eq.pending,and(status.eq.printing,created_at.lt."'+stale+'")').order('created_at',{ascending:true}).limit(3);
   if(q.error){if(!tillErrShown){tillErrShown=true;notify('طباعة ملخص العهدة متوقفة: صلاحيات جدول الطباعة ناقصة في قاعدة البيانات');}return;}
   for(const job of (q.data||[])){
    const claim=await sb.from('till_print_jobs').update({status:'printing',attempts:(job.attempts||0)+1}).eq('id',job.id).eq('status',job.status).select('id');
    if(claim.error||!claim.data||!claim.data.length)continue;
    try{
     const rep=await sb.rpc('till_report',{p_session:job.session_id});if(rep.error)throw rep.error;const report=rep.data;
     if(!report||!report.session||report.session.state!=='closed')throw Error('العهدة لم تُغلق بعد');
     const pr=await sb.from('printers').select('ip').eq('role','cashier').eq('enabled',true).single();if(pr.error)throw pr.error;
     await send(pr.data.ip,tillBody(report));
     await sb.from('till_print_jobs').update({status:'done',printed_at:new Date().toISOString(),error:null}).eq('id',job.id);
     notify('تمت طباعة ملخص العهدة من هذا الآيباد');
    }catch(e){
     await sb.from('till_print_jobs').update({status:'pending',error:String(e.message||e).slice(0,300)}).eq('id',job.id);
     notify('تعذّرت طباعة ملخص العهدة — '+(e.message||e));
    }
   }
  }catch(e){}finally{tillBusy=false;}
 }
 function mount(){
  let panel=document.getElementById('ipad-panel');
  if(!panel){panel=document.createElement('details');panel.id='ipad-panel';panel.className='card';document.getElementById('view-printing').append(panel);panel.open=true;}
  function draw(){panel.innerHTML='<summary>الطباعة من هذا الجهاز</summary><p id="ipad-status" role="status"></p><button type="button" class="btn" id="ipad-toggle"></button> <button type="button" class="chip" id="ipad-kitchen"></button> <button type="button" class="chip" id="ipad-cash-test">اختبار إيصال الكاشير</button>';
   const toggle=panel.querySelector('#ipad-toggle'),k=panel.querySelector('#ipad-kitchen');toggle.textContent=config.device?'العودة لوسيط الطباعة':'تفعيل طابعة الكاشير على هذا الآيباد';k.hidden=!config.device;k.textContent=config.kitchen?'إرجاع المطبخ للوسيط':'اختبار المطبخ وتفعيله';
   const test=panel.querySelector('#ipad-cash-test');
   test.onclick=async()=>{
    test.disabled=true;let phase='تحميل عنوان الكاشير';
    try{
     const result=await sb.from('printers').select('ip').eq('role','cashier').eq('enabled',true).single();
     if(result.error)throw result.error;
     phase='الاتصال بطابعة '+result.data.ip;
     const status=panel.querySelector('#ipad-status');
     const mode=navigator.standalone||matchMedia('(display-mode: standalone)').matches?'الأيقونة':'Safari';
     status.textContent='جاري اختبار الاتصال من '+mode;
     // A status query has no paper or cut command and can be safely repeated.
     await send(result.data.ip,'',true);
     phase='طباعة الإيصال العربي بعد نجاح الاتصال';
     await send(result.data.ip,await paperLayout({kind:'receipt',settings:{},order:{number:'TEST',created_at:new Date().toISOString(),created_by_name:'كاشير ١',order_type:'dine',method:'cash',total:75,paid:75,items:[]}},[{b:'العصائر الطازجة · بطيخ',z:'L',q:1,p:75}]));
     notify('أكّدت طابعة الكاشير طباعة الإيصال من '+mode);
    }catch(err){notify(phase+' — '+err.message);}finally{test.disabled=false;}
   };
   toggle.onclick=()=>{if(busy)return;if(config.device){if(!confirm('تحويل الطلبات الجديدة للوسيط؟'))return;config={};}else config={device:crypto.randomUUID(),kitchen:false};save();draw();drain();};
   k.onclick=async()=>{if(config.kitchen){config.kitchen=false;save();draw();return;}k.disabled=true;try{const r=await sb.from('printers').select('ip').eq('role','kitchen').eq('enabled',true).single();if(r.error)throw r.error;await send(r.data.ip,'<text>MR CASHIER - KITCHEN TEST&#10;</text>');if(confirm('هل خرجت ورقة الاختبار من طابعة المطبخ؟'))config.kitchen=true;save();draw();}catch(e){notify('اختبار المطبخ: '+e.message);}finally{k.disabled=false;}};
  }draw();if(!running){running=true;setInterval(()=>{drain();drainTill();},4000);}drain();drainTill();
 }
 return {transport,mount};
})();
var recoveryReturn = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
var sb = window.supabase.createClient(SB_URL, SB_KEY,{global:{fetch:ipadPrint.transport}});
mode = 'db';
function setStatus(t) { $('#status').textContent = t; }
function pendingOrderKey(){return LS+'pending_order_'+myEmail;}
function restorePendingOrder(){S.pendingOrder=null;try{var value=localStorage.getItem(pendingOrderKey());if(value){var saved=JSON.parse(value);if(saved.id&&saved.payload&&saved.snapshot){S.pendingOrder=saved;Object.assign(S,saved.snapshot);S.typePicked=true;$('#paid').value=S.paid;$('#delivery-fee').value=S.deliveryFee||'';}else toast('بيانات طلب معلّق غير صالحة؛ راجع الأدمن قبل إنشاء طلب جديد');}}catch(e){toast('تعذر قراءة الطلب المعلّق من الجهاز');}}
function paidValue(text){var value=String(text==null?'':text).trim().replace(/[٠-٩]/g,function(c){return String(c.charCodeAt(0)-1632);}).replace(/[۰-۹]/g,function(c){return String(c.charCodeAt(0)-1776);}).replace(/٫/g,'.');if(!value)return null;if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('INVALID_PAID_AMOUNT');var n=Number(value);if(!Number.isFinite(n)||n>1000000000)throw new Error('INVALID_PAID_AMOUNT');return Math.round(n*100)/100;}
function paidPreview(text){try{var value=paidValue(text);return value===null?NaN:value;}catch(e){return NaN;}}
function basketLocked(){return S.busy||!!S.pendingOrder;}
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
var query=sb.from('orders').update(patch).eq('id',id);if(patch.state==='completed')query=query.eq('state','active');
var r = await query.select('id');
if (r.error) throw r.error;
if(!r.data||!r.data.length)throw new Error('ORDER_CHANGED_OR_NOT_AUTHORIZED');
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
function loadScriptOnce(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function csvToRows(text) { var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); }); if (lines.length < 2) return []; var head = lines[0].split(',').map(function (h) { return h.trim(); }); return lines.slice(1).map(function (l) { var cells = l.split(','), o = {}; head.forEach(function (h, i) { o[h] = (cells[i] || '').trim(); }); return o; }); }
async function sheetRows(file) {
if (/\.csv$/i.test(file.name)) return csvToRows(await file.text());
if (!window.XLSX) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
var wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}
function pickVal(row, aliases) { var keys = Object.keys(row); for (var a = 0; a < aliases.length; a++) { for (var i = 0; i < keys.length; i++) { if (norm(keys[i]) === norm(aliases[a])) { var v = String(row[keys[i]] == null ? '' : row[keys[i]]).trim(); if (v) return v; } } } return ''; }
async function importCustomersFile(file) {
if (S.role !== 'admin') return;
try {
var rows = await sheetRows(file), seen = {}, docs = [], skipped = 0;
S.customers.forEach(function (c) { seen[normPhone(c.phone)] = 1; });
rows.forEach(function (r) { var name = pickVal(r, ['الاسم', 'اسم العميل', 'العميل', 'name', 'customer']), phone = normPhone(pickVal(r, ['الهاتف', 'رقم الهاتف', 'رقم الموبايل', 'الموبايل', 'الجوال', 'phone', 'mobile', 'tel'])), addr = pickVal(r, ['العنوان', 'address']); if (!name || !phone || seen[phone]) { skipped++; return; } seen[phone] = 1; docs.push({ name: name, phone: phone, address: addr || null }); });
for (var i = 0; i < docs.length; i += 50) { var r2 = await sb.from('customers').insert(docs.slice(i, i + 50)); if (r2.error) throw r2.error; }
await reload(); toast('تم استيراد ' + docs.length + ' عميل' + (skipped ? ' · تم تخطي ' + skipped + ' صف (ناقص أو مكرر)' : ''));
} catch (e) { toast('تعذر استيراد ملف العملاء'); }
}
async function importProductsFile(file) {
if (S.role !== 'admin') return;
try {
var rows = await sheetRows(file), docs = [], skipped = 0;
rows.forEach(function (r) { var name = pickVal(r, ['الصنف', 'اسم الصنف', 'اسم المنتج', 'المنتج', 'name', 'product']), cat = pickVal(r, ['التصنيف', 'الفئة', 'القسم', 'category', 'cat']), ps = pickVal(r, ['السعر', 'سعر M', 'price', 'm']), ls = pickVal(r, ['سعر L', 'سعر الحجم الكبير', 'lprice', 'l']); var m = Number(ps), l = ls === '' ? null : Number(ls); if (!name || name === '__pos_category__' || ps === '' || !Number.isFinite(m) || m < 0 || (l !== null && (!Number.isFinite(l) || l < 0))) { skipped++; return; } m = Math.round(m * 100) / 100; if (l !== null) l = Math.round(l * 100) / 100; docs.push({ name: name, category: cat || 'أخرى', price: l !== null ? null : m, sizes: l !== null ? { M: m, L: l } : null, active: true }); });
for (var i = 0; i < docs.length; i += 50) { var r2 = await sb.from('products').insert(docs.slice(i, i + 50)); if (r2.error) throw r2.error; }
await reload(); toast('تم استيراد ' + docs.length + ' صنف' + (skipped ? ' · تم تخطي ' + skipped + ' صف (ناقص أو سعر غير صحيح)' : ''));
} catch (e) { toast('تعذر استيراد ملف الأصناف'); }
}
document.addEventListener('change', function (e) { var f = e.target; if (!f || !f.files || !f.files.length) return; if (f.id === 'cu-file') { importCustomersFile(f.files[0]); f.value = ''; } else if (f.id === 'prod-file') { importProductsFile(f.files[0]); f.value = ''; } });
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
S.role = r.data[0].role === 'admin' ? 'admin' : 'cashier';restorePendingOrder();if(S.role==='cashier')ipadPrint.mount();
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
function searchRank(p){var name=norm(p.name),cat=norm(p.cat||''),toks=nq.split(' ').filter(Boolean);if(name.startsWith(nq))return 0;if(name.split(' ').some(function(word){return word.startsWith(nq);}))return 1;if(toks.every(function(tk){return name.includes(tk);}))return 2;if(toks.every(function(tk){return cat.includes(tk);}))return 3;if(toks.every(function(tk){var i=0;for(var ci=0;ci<name.length&&i<tk.length;ci++){if(name[ci]===tk[i])i++;}return i>=tk.length;}))return 4;return 99;}
list = S.products.filter(function(p){return p.active&&searchRank(p)<99;}).sort(function(a,b){return searchRank(a)-searchRank(b);});
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
$('#otype').hidden = !items.length;
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
$('#checkout').disabled = !items.length || basketLocked();
$('#checkout').textContent = items.length ? 'ادفع · ' + money(total) : 'ادفع';
$('#clear').disabled = !items.length || basketLocked();
$('#kitchen').disabled = !items.length || basketLocked();
var pending=$('#pending-order');if(pending){pending.hidden=!S.pendingOrder;pending.innerHTML=S.pendingOrder?'<p>نتيجة حفظ الطلب غير مؤكدة. إجمالي الطلب: '+money(S.pendingOrder.payload.total)+'. أكّد النتيجة قبل إنشاء طلب جديد.</p><button class="btn" id="pending-order-retry" '+(S.busy?'disabled':'')+'>التحقق وإكمال نفس الطلب</button>':'';}
document.querySelectorAll('#cart-panel input,#cart-panel select,#cart-panel button[data-inc],#cart-panel button[data-dec],#cart-panel button[data-note],#discount-open,#discount-remove,#delivery-remove,#method button,#otype button').forEach(function(el){el.disabled=basketLocked();});
document.querySelectorAll('#method button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === S.method)); });
document.querySelectorAll('#otype button').forEach(function (b) { b.setAttribute('aria-pressed', String(S.typePicked && b.dataset.t === S.otype)); });
$('#paid-row').hidden = S.method !== 'cash';
$('#cust').hidden = S.otype !== 'delivery';
var paid = paidPreview(S.paid), ch = $('#change');
if (S.method === 'cash' && !isNaN(paid) && items.length) {
ch.hidden = false;
if (paid >= total) { ch.style.color = 'var(--good)'; $('#change-v').textContent = money(paid - total); $('#change-l').textContent = 'الباقي للعميل'; }
else { ch.style.color = 'var(--bad)'; $('#change-v').textContent = money(total - paid); $('#change-l').textContent = 'ناقص'; }
} else ch.hidden = true;
var ct = $('#cpay-total'); if (ct) ct.textContent = money(total);
var cd2 = $('#cpay-discount'); if (cd2) cd2.textContent = S.discount ? 'تعديل الخصم ' + S.discount + '%' : 'إضافة خصم %';
document.querySelectorAll('#cpay-method button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cpm === S.method)); });
var cpr = $('#cpay-paid-row'); if (cpr) cpr.hidden = S.method !== 'cash';
var cc = $('#cpay-change');
if (cc) {
if (S.method === 'cash' && !isNaN(paid) && items.length) {
cc.hidden = false;
if (paid >= total) { cc.style.color = 'var(--good)'; $('#cpay-change-v').textContent = money(paid - total); $('#cpay-change-l').textContent = 'الباقي للعميل'; }
else { cc.style.color = 'var(--bad)'; $('#cpay-change-v').textContent = money(total - paid); $('#cpay-change-l').textContent = 'ناقص'; }
} else cc.hidden = true;
}
var om = $('#order-meta');
if (om) { var oh = ''; if (S.orderTag) oh += '<button class="chip" id="om-tag" aria-pressed="true">وسم: ' + esc(S.orderTag) + ' ✕</button>'; if (S.orderNote) oh += '<button class="chip" id="om-note" aria-pressed="true">ملاحظة: ' + esc(S.orderNote) + ' ✕</button>'; om.innerHTML = oh; }
}
async function reprintLatest() {
var order = S.orders.slice().sort(function (a, b) { return (b.cts || 0) - (a.cts || 0); })[0];
if (!order) return toast('لا يوجد طلب سابق لإعادة طباعته');
if (!confirm('إعادة طباعة إيصال آخر طلب (#' + (todayNums()[order.id] || order.number) + ') على طابعة الكاشير؟')) return;
try {
var pr = await sb.from('printers').select('ip,port,enabled').eq('role', 'cashier').single();
if (pr.error) throw pr.error;
await JuicePrint.send(order, 'cashier', todayNums()[order.id] || order.number, pr.data);
toast('تم إرسال الإيصال للطابعة؛ راجع خروج الورقة');
} catch (e) { toast('تعذر تأكيد الطباعة. راجع الطابعة قبل إعادة المحاولة.'); }
}
function openCartPay() { if (!cartItems().length || basketLocked()) return; $('#cpay-paid').value = S.paid; $('#cartpayscrim').hidden = false; renderCart(); }
function addToCart(key) { S.cart[key] = (S.cart[key] || 0) + 1; renderPos(); }
var pendingTypePid = null;
function openTypeSheet() {
$('#sheet-t').textContent = 'اختر نوع الطلب';
$('#sizes').innerHTML = [['dine', 'صالة'], ['take', 'تيك أواي'], ['delivery', 'دليفري']].map(function (x) {
return '<button data-typepick="' + x[0] + '">' + x[1] + '</button>';
}).join('');
$('#scrim').hidden = false;
}
function openSheet(p) {
$('#sheet-t').textContent = p.name;
$('#sizes').innerHTML = ['M', 'L'].filter(function (z) { return p.sizes && p.sizes[z] != null; }).map(function (z) {
return '<button data-size="' + z + '" data-pid="' + esc(p.id) + '">' + SIZE[z] + '<span class="num">' + money(Number(p.sizes[z])) + '</span></button>';
}).join('');
$('#scrim').hidden = false;
}
async function submitPendingOrder(){
if(!S.pendingOrder||S.busy)return;var request=S.pendingOrder;S.busy=true;renderCart();
try{var r=await sb.rpc('submit_pos_order',{p_request:request.id,p_payload:request.payload});if(r.error)throw r.error;if(!r.data||!r.data.saved||r.data.id!==request.id)throw new Error('ORDER_UNCONFIRMED');
localStorage.removeItem(request.storageKey||pendingOrderKey());S.pendingOrder=null;S.cart={};S.typePicked=false;clearAdjustments();S.paid='';$('#paid').value='';S.cat=null;S.q='';$('#q').value='';S.cust=null;S.newCust=false;S.custQ='';S.orderNote='';S.orderTag='';await reload();toast(r.data.state==='active'?'تم تأكيد إرسال الطلب للمطبخ':'تم تأكيد حفظ الطلب #'+r.data.number);
}catch(e){toast(String(e.message||'').indexOf('OPEN_TILL_REQUIRED')>=0?'افتح عهدة ثم أكمل نفس الطلب المعلّق':'لم نتأكد من الحفظ؛ أعد التحقق من نفس الطلب بعد رجوع الاتصال');}
finally{S.busy=false;renderAll();renderCust(true);}
}
async function checkout(state){
if(S.role==='admin')return toast('إنشاء الطلبات من حساب الكاشير');if(!S.pendingOrder){try{if(localStorage.getItem(pendingOrderKey()))restorePendingOrder();}catch(e){return toast('تعذر قراءة مرجع الطلب من تخزين الجهاز');}}if(S.pendingOrder)return submitPendingOrder();
state=state||'completed';var items=cartItems();if(!items.length||S.busy)return;if(window.Till&&!Till.requireOpen())return;
var cu=S.otype==='delivery'?S.customers.find(function(x){return x.id===S.cust;}):null;
if(S.otype==='delivery'&&!cu)return toast('اختر العميل أو أضف عميل جديد للدليفري');if(S.otype==='delivery'&&!$('#delivery-fee').checkValidity())return toast('اكتب رسوم دليفري صحيحة');
var total=cartTotal(),paid;try{paid=state==='completed'&&S.method==='cash'?paidValue(S.paid):null;}catch(e){return toast('اكتب المبلغ المدفوع بالأرقام فقط، وبحد أقصى منزلتين عشريتين');}
if(!Number.isFinite(total)||total<0)return toast('راجع أسعار المنتجات والإجمالي');
if(state==='completed'&&S.method==='cash'&&paid!==null&&paid<total)return toast('المبلغ المدفوع أقل من الإجمالي');
var payload={items:items.map(function(i){return {b:i.b,n:i.n,z:i.z,q:i.q,p:i.price,note:i.note||''};}).concat(adjustmentItems()),total:total,method:state==='active'?'cash':S.method,paid:state==='completed'&&S.method==='cash'?paid:null,order_type:S.otype,state:state,customer:cu?{id:cu.id,name:cu.name,phone:cu.phone,address:cu.address}:null};
if(payload.items.length&&(S.orderTag||S.orderNote)){var extra=[S.orderTag,S.orderNote].filter(Boolean).join(' · ');payload.items[0].note=extra+(payload.items[0].note?' · '+payload.items[0].note:'');}
var request={id:crypto.randomUUID(),storageKey:pendingOrderKey(),payload:payload,snapshot:{cart:Object.assign({},S.cart),discount:S.discount,deliveryFee:S.deliveryFee,method:S.method,otype:S.otype,paid:S.paid,cust:S.cust,orderNote:S.orderNote,orderTag:S.orderTag}};
try{localStorage.setItem(pendingOrderKey(),JSON.stringify(request));}catch(e){return toast('تعذر حفظ مرجع الطلب على الجهاز؛ تأكد من توفر مساحة التخزين قبل البيع');}
S.pendingOrder=request;return submitPendingOrder();
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
var meta='<span>'+esc(TYPE[x.type]||'صالة')+'</span><span class="num">'+timeFmt(x.cts)+'</span>'+(x.state==='active'?'<span class="order-age">'+minsSince(x.cts)+'</span>':x.state==='completed'?'<span>'+(x.method==='card'?'فيزا':'كاش')+'</span>':'');
var staff='<span>بواسطة <b>'+esc(x.createdByName||'موظف')+'</b></span>'+(x.paidByName?'<span>التحصيل: <b>'+esc(x.paidByName)+'</b></span>':'');
var itemRows=(x.items||[]).map(function(i){var name=String(i.n||'').split(' · ').slice(-1)[0];return '<div class="order-item"><span class="order-qty num">'+esc(i.q||1)+'×</span><div><span>'+esc(name)+'</span>'+(i.note?'<p class="order-item-note">ملاحظة: '+esc(i.note)+'</p>':'')+'</div></div>';}).join('');
var cust = x.customer ? '<small>' + esc(x.customer.name) + ' · <span class="num">' + esc(x.customer.phone) + '</span>' + (x.customer.address ? ' · ' + esc(x.customer.address) : '') + '</small>' : '';
var info = '';
if (x.state === 'refunded') info = '<small class="neg-v">مرتجع ' + dateFmt(x.refundedAt || x.cts) + ' ' + timeFmt(x.refundedAt || x.cts) + (x.refundedBy ? ' · ' + esc(x.refundedBy) : '') + (x.reason ? ' · ' + esc(x.reason) : '') + '</small>';
if(x.state==='cancelled'&&S.role==='admin')info+='<small>ألغاه: '+esc(x.cancelledBy)+(x.cancelledAt?' · '+dateFmt(Date.parse(x.cancelledAt))+' '+timeFmt(Date.parse(x.cancelledAt)):'')+(x.cancelReason?' · السبب: '+esc(x.cancelReason):'')+'</small>';
var adjustmentSummary=(x.adjustments||[]).map(function(a){return '<small>'+esc(a.n)+': '+money(a.amount)+'</small>';}).join('');
var acts = '';
if (x.state === 'active' && S.role==='admin') acts=delBtn('ocancel',x.id,'إلغاء');
else if (x.state === 'active') acts = '<button class="btn sm" data-pay="' + esc(x.id) + '">قفل التذكرة</button>' + delBtn('ocancel', x.id, 'إلغاء');
else if (x.state === 'completed' && S.role === 'admin') acts = delBtn('orefund', x.id, 'مرتجع');
if (window.JuicePrint && JuicePrint.available && (x.state === 'active' || x.state === 'completed')) {
acts += '<button class="btn sm" data-print="' + esc(x.id) + '" data-role="kitchen">طباعة المطبخ</button>';
if (x.state === 'completed') acts += '<button class="btn sm" data-print="' + esc(x.id) + '" data-role="cashier">طباعة الإيصال</button>';
}
return '<article class="ord"><header class="order-head"><div class="order-id"><b>طلب <span class="num">#'+(nums[x.id]||x.number)+'</span></b><span class="pill st-'+x.state+'">'+STATE_AR[x.state]+'</span></div><strong class="order-amount num">'+money(Number(x.total))+'</strong></header><div class="order-meta">'+meta+'</div><div class="order-items">'+itemRows+'</div><div class="order-staff">'+staff+'</div>'+(cust?'<div class="order-customer">'+cust+'</div>':'')+((adjustmentSummary||info)?'<div class="order-extra">'+adjustmentSummary+info+'</div>':'')+(acts?'<footer class="acts">'+acts+'</footer>':'')+'</article>';

}
function renderOrders() {
if(S.role!=='admin'&&S.ofilter==='cancelled')S.ofilter='active';
var st = startOfDay(0), nums = todayNums();
var by = { active: [], completed: [], refunded: [], cancelled: [] };
S.orders.forEach(function (x) {
if(x.state==='cancelled'&&S.role!=='admin')return;
if (x.state === 'active') by.active.push(x);
else if(x.state==='cancelled'&&S.role==='admin')by.cancelled.push(x);
else if(x.state==='completed'&&S.role==='admin')by.completed.push(x);
else if (x.state === 'refunded') { if (S.role === 'admin' || x.cts >= st) by.refunded.push(x); }
else if (by[x.state] && (x.businessDayId ? x.businessDayId===S.businessDayId : x.cts >= st || x.ts >= st)) by[x.state].push(x);
});
by.active.sort(function (a, b) { return a.cts - b.cts; });
by.completed.sort(function (a, b) { return b.ts - a.ts; });
by.refunded.sort(function (a, b) { return (b.refundedAt || b.cts) - (a.refundedAt || a.cts); });
by.cancelled.sort(function (a, b) { return b.cts - a.cts; });
var f = S.ofilter, query=S.orderQ.toLowerCase(), list=(by[f]||[]).filter(function(x){return !query || [String(nums[x.id]||x.number),x.customer&&x.customer.name,x.customer&&x.customer.phone,x.createdByName,(x.items||[]).map(function(i){return i.n;}).join(' ')].join(' ').toLowerCase().indexOf(query)>=0;});
var selected=list.find(function(x){return x.id===S.selectedOrderId;})||list[0];S.selectedOrderId=selected?selected.id:null;
var tabs=[['active','نشطة'],['completed','مغلقة'],['refunded','مرتجعة']];if(S.role==='admin')tabs.push(['cancelled','ملغية']);
$('#view-orders').innerHTML='<div class="actbar" role="toolbar" aria-label="إجراءات الطلب المحدد"><button class="actbtn" id="oa-more"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>المزيد</button><button class="actbtn" id="oa-tags"><svg viewBox="0 0 24 24"><path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.8"/></svg>وسوم</button><button class="actbtn" id="oa-notes"><svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>ملاحظات</button><button class="actbtn" id="oa-discount"><svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/><path d="M18 5L6 19"/></svg>خصم</button><button class="actbtn" id="oa-cancel"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>إلغاء</button><button class="actbtn" id="oa-kitchen"><svg viewBox="0 0 24 24"><path d="M7 14.5A3.8 3.8 0 1 1 8.2 7.1a5.2 5.2 0 0 1 7.6 0A3.8 3.8 0 1 1 17 14.5z"/><path d="M7 14.5h10v3H7z"/><path d="M4.5 20.5h15"/></svg>مطبخ</button></div><div class="ticket-workspace"><section class="ticket-list"><div class="bar"><h2>الطلبات</h2><span class="note num">'+list.length+' طلب'+'</span></div><label class="ticket-search">بحث في الطلبات<input class="in" id="order-search" value="'+esc(S.orderQ)+'" placeholder="رقم التذكرة، الصنف أو اسم العميل" autocomplete="off"></label><div class="chips">'+tabs.map(function(t){return '<button class="chip" data-of="'+t[0]+'" aria-pressed="'+(f===t[0])+'">'+t[1]+' <span class="num">'+by[t[0]].length+'</span></button>';}).join('')+'</div><div class="ticket-rows">'+(list.length?list.map(function(x){return '<button class="ticket-row" data-select-order="'+esc(x.id)+'" aria-pressed="'+(selected.id===x.id)+'"><span><span class="ticket-number num">#'+esc(nums[x.id]||x.number)+'</span><small>'+esc(x.createdByName||'موظف')+'</small></span><span>'+esc(TYPE[x.type]||'صالة')+'<small class="num">'+(S.role==='admin'?dateFmt(x.cts)+' · ':'')+timeFmt(x.cts)+(x.state==='active'?' · '+minsSince(x.cts):'')+'</small></span><span><span class="pill st-'+x.state+'">'+STATE_AR[x.state]+'</span><small class="num">'+money(x.total)+'</small></span></button>';}).join(''):'<div class="empty">'+(query?'لا توجد نتائج مطابقة':'لا توجد طلبات في هذا القسم')+'</div>')+'</div></section><aside class="ticket-detail"><div class="ticket-detail-title">تفاصيل التذكرة</div>'+(selected?orderRow(selected,nums):'<div class="empty">اختر طلباً لعرض تفاصيله</div>')+'</aside></div>';

}
function niceMax(m) {
if (m <= 0) return 4;
var mag = Math.pow(10, Math.floor(Math.log10(m))), st = [1, 2, 2.5, 4, 5, 8, 10];
for (var i = 0; i < st.length; i++) if (st[i] * mag >= m) return st[i] * mag;
return 10 * mag;
}
function reportPayments(){return S.orders.filter(function(x){return x.state==='completed'||x.state==='refunded';});}
function chartSvg() {
var payments=reportPayments();
var days=[],bounds=rangeBounds(), first=bounds.start || Math.min.apply(null,payments.map(function(x){return x.ts;}).concat(S.expenses.map(function(x){return x.ts;}),[Date.now()])), firstKey=dateKey(first), lastKey=dateKey(bounds.end-1), count=Math.round((Date.parse(lastKey)-Date.parse(firstKey))/86400000)+1, groups=Math.min(7,count);
for(var i=0;i<groups;i++){var k=shiftDate(firstKey,Math.floor(i*count/groups)), next=shiftDate(firstKey,Math.floor((i+1)*count/groups));days.push({s:dayBoundary(k),e:dayBoundary(next),sales:0,exp:0,returns:0});}
payments.forEach(function (x) { days.forEach(function (d) { if (x.ts >= d.s && x.ts < d.e) d.sales += Number(x.total) || 0; }); });
S.orders.filter(function(x){return x.state==='refunded';}).forEach(function(x){days.forEach(function(d){if(x.refundedAt>=d.s&&x.refundedAt<d.e)d.returns+=Number(x.total)||0;});});
S.expenses.forEach(function (x) { days.forEach(function (d) { if (x.ts >= d.s && x.ts < d.e) d.exp += Number(x.amount) || 0; }); });
var max = niceMax(Math.max.apply(null, days.map(function (d) { return Math.max(d.sales,d.exp,d.returns); }).concat([0])));
var W = 640, H = 240, pl = 52, pr = 8, pt = 12, pb = 30, iw = W - pl - pr, ih = H - pt - pb, gw = iw / days.length, bw = gw * 0.22;
var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="المبيعات والمرتجعات والمصروفات خلال الفترة المحددة" font-family="inherit">';
for (var t = 0; t <= 4; t++) {
var v = max / 4 * t, y = pt + ih - (v / max) * ih;
out += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"' + (t === 0 ? '' : ' stroke-dasharray="3 4"') + '/>';
out += '<text x="' + (pl - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + fmt(v) + '</text>';
}
days.forEach(function (d, idx) {
var cx = pl + gw * idx + gw / 2, hs = (d.sales / max) * ih, he = (d.exp / max) * ih, hr=(d.returns/max)*ih;
var label = new Date(d.s).toLocaleDateString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',day:'numeric',month:'short'});
out += '<rect x="' + (cx - 1.5*bw - 3) + '" y="' + (pt + ih - hs) + '" width="' + bw + '" height="' + Math.max(hs, 0) + '" rx="3" fill="var(--accent)"><title>مبيعات: ' + money(d.sales) + '</title></rect>';
out += '<rect x="' + (cx + 0.5*bw + 3) + '" y="' + (pt + ih - he) + '" width="' + bw + '" height="' + Math.max(he, 0) + '" rx="3" fill="var(--bad)"><title>مصروفات: ' + money(d.exp) + '</title></rect>';
out += '<rect x="'+(cx-bw/2)+'" y="'+(pt+ih-hr)+'" width="'+bw+'" height="'+Math.max(hr,0)+'" rx="3" fill="#c58c21"><title>مرتجعات: '+money(d.returns)+'</title></rect>';
out += '<text x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle" font-size="12" fill="var(--muted)"' + (idx === 6 ? ' font-weight="600"' : '') + '>' + label + '</text>';
});
return out + '</svg>';
}
var myEmail = '';
var ADMIN_IDS = ['s-name', 's-email', 'e-title', 'e-amt', 'p-name', 'p-cat', 'p-price', 'p-lprice', 'cu-q', 'cu-name', 'cu-phone', 'cu-addr', 'report-from', 'report-to'];
function renderProducts() {
var cats=catList();
$('#view-products').innerHTML='<div class="bar"><div><h2>المنتجات والتصنيفات</h2><p class="note">المنيو والأسعار والأحجام في مكان واحد</p></div><button class="btn sm" id="product-new">+ منتج جديد</button><button class="chip" id="prod-import">استيراد أصناف من إكسل</button><input type="file" id="prod-file" accept=".xlsx,.xls,.csv" hidden></div>'+ '<div class="product-layout"><aside class="card"><h3>التصنيفات <small>'+cats.length+'</small></h3><div class="category-create"><input class="in" id="category-name" placeholder="تصنيف جديد" aria-label="اسم التصنيف"><button class="btn sm" id="cat-add">إضافة</button></div><button class="category-button" data-manage-cat="">كل المنتجات <span class="num">'+S.products.length+'</span></button>'+cats.map(function(c){var count=S.products.filter(function(p){return p.cat===c;}).length;return '<div class="category-manage"><button class="category-button '+(S.productCat===c?'selected':'')+'" data-manage-cat="'+esc(c)+'">'+esc(c)+' <span class="num">'+count+'</span></button><div class="category-actions"><button data-cat-rename="'+esc(c)+'">تعديل</button><button data-cat-delete="'+esc(c)+'">حذف</button></div></div>';}).join('')+'</aside><section class="card"><div class="bar"><h3>'+(S.productCat?esc(S.productCat):'كل المنتجات')+'</h3><span class="pill">M / L</span></div><input class="in" id="product-search" type="search" placeholder="بحث باسم المنتج" value="'+esc(S.productQ)+'"><div id="product-rows"></div></section></div>';
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
var sales = reportPayments().filter(function (x) { return inRange(x.ts); }), exps = S.expenses.filter(function (x) { return inRange(x.ts); });
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
var tR = sum(refR, function (x) { return x.total; });net=tS-tR-tE;
var months = {}, mkeys = [];
refs.forEach(function (x) { var t = x.refundedAt || x.cts, k = dateKey(t).slice(0,7); if (!months[k]) { months[k] = { n: 0, t: 0, ts: t }; mkeys.push(k); } months[k].n++; months[k].t += x.total; });
var refCard = '<section class="card"><h3>المرتجعات الشهرية <small>' + refs.length + ' مرتجع</small></h3>' +
(mkeys.length ? '<div class="rows">' + mkeys.map(function (k) { var m = months[k]; return '<div class="row"><div class="t"><b>' + new Date(m.ts).toLocaleDateString('ar-EG-u-nu-latn', {timeZone:'Africa/Cairo', month:'long',year:'numeric'}) + '</b><small class="num">' + m.n + ' طلب مرتجع</small></div><div class="a num neg-v">' + money(m.t) + '</div></div>'; }).join('') + '</div>' +
'<h3>آخر المرتجعات</h3><div class="rows scroll">' + refs.slice(0, 30).map(function (x) { var t = x.refundedAt || x.cts; return '<div class="row"><div class="t">' + itemsHtml(x) + '<small class="num">' + dateFmt(t) + ' · ' + timeFmt(t) + (x.refundedBy ? ' · ' + esc(x.refundedBy) : '') + '</small>' + (x.reason ? '<small>السبب: ' + esc(x.reason) + '</small>' : '') + '</div><div class="a num neg-v">' + money(x.total) + '</div><span></span></div>'; }).join('') + '</div>' : '<div class="empty">لا توجد مرتجعات</div>') + '</section>';
$('#view-admin').innerHTML =
'<div class="bar"><h2>ملخص ' + names[S.range] + '</h2><div class="chips">' +
['today', '7', '30', 'all', 'custom'].map(function (r) { return '<button class="chip" data-range="' + r + '" aria-pressed="' + (S.range === r) + '">' + names[r] + '</button>'; }).join('') + '</div></div>' +
'<section class="card"><div class="date-range"><label>من تاريخ<input class="in" type="date" id="report-from" value="'+esc(S.dateFrom||dateKey(Date.now()))+'"></label><label>إلى تاريخ<input class="in" type="date" id="report-to" value="'+esc(S.dateTo||dateKey(Date.now()))+'"></label><button class="btn sm" id="apply-dates">عرض التقرير</button></div><small class="note">التواريخ بتوقيت القاهرة، وتشمل اليومين بالكامل.</small></section>' +
'<div class="kpis">' +
'<div class="kpi main"><span class="kl">إجمالي المبيعات</span><span class="kv num">' + money(tS) + '</span><span class="ks">' + sales.length + ' طلب · متوسط ' + money(avg) + '</span></div>' +
'<div class="kpi"><span class="kl">إجمالي المصروفات</span><span class="kv num neg-v">' + money(tE) + '</span><span class="ks">' + exps.length + ' بند</span></div>' +
'<div class="kpi"><span class="kl">الصافي بعد المرتجعات والمصروفات</span><span class="kv num ' + (net >= 0 ? 'pos-v' : 'neg-v') + '">' + (net < 0 ? '−' : '') + money(Math.abs(net)) + '</span><span class="ks">المبيعات − المرتجعات − المصروفات</span></div>' +
'<div class="kpi"><span class="kl">المرتجعات</span><span class="kv num neg-v">' + money(tR) + '</span><span class="ks">' + refR.length + ' طلب مرتجع</span></div>' +
'<div class="kpi"><span class="kl">طرق الدفع قبل المرتجعات</span><span class="kv num" style="font-size:1.25rem">كاش ' + fmt(cash) + '</span><span class="ks num">فيزا ' + fmt(card) + ' ج.م</span></div></div>' +
'<div class="cols">' +
'<section class="card"><h3>الفترة المحددة <small>المبيعات والمرتجعات والمصروفات</small></h3><div class="legend"><span><i style="background:var(--accent)"></i>مبيعات قبل المرتجعات</span><span><i style="background:#c58c21"></i>مرتجعات</span><span><i style="background:var(--bad)"></i>مصروفات</span></div><div class="chartbox">' + chartSvg() + '</div></section>' +
'<section class="card top5"><h3>الأكثر مبيعًا قبل المرتجعات <small>' + names[S.range] + '</small></h3><div class="rows">' +
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
$('#view-customers').innerHTML = '<div class="bar"><h2>العملاء</h2>' + (S.role === 'admin' ? '<button class="chip" id="cu-import">استيراد عملاء من إكسل</button><input type="file" id="cu-file" accept=".xlsx,.xls,.csv" hidden>' : '') + '<span class="note num">' + S.customers.length + ' عميل</span></div>' +
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
async function openRefund(id){
if(S.role!=='admin'||S.refundBusy)return;var o=S.orders.find(function(x){return x.id===id;});if(!o||o.state!=='completed')return toast('الطلب غير مكتمل أو تم إرجاعه');
S.refundBusy=true;try{var r=await sb.from('till_sessions').select('id,drawer,cashier_name').eq('state','open').order('opened_at');if(r.error)throw r.error;if(!r.data||!r.data.length)return toast('افتح عهدة كاشير أولاً لتسجيل قيمة المرتجع عليها');S.refundId=id;$('#refund-title').textContent='مرتجع طلب #'+(todayNums()[id]||o.number);$('#refund-amount').textContent=money(o.total);$('#refund-reason').value='';$('#refund-till').innerHTML=r.data.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.drawer)+' — '+esc(t.cashier_name||'كاشير')+'</option>';}).join('');$('#refundscrim').hidden=false;}catch(e){toast('تعذر تحميل العهد المفتوحة');}finally{S.refundBusy=false;}
}
async function confirmRefund(){
if(S.role!=='admin'||S.refundBusy||!S.refundId)return;var id=S.refundId,session=$('#refund-till').value;if(!session)return toast('اختر عهدة لتسجيل المرتجع');S.refundBusy=true;$('#refund-confirm').disabled=true;
try{var r=await sb.rpc('admin_refund_order',{p_order_id:id,p_reason:$('#refund-reason').value.trim(),p_session_id:session});if(r.error)throw r.error;if(!r.data||!r.data.refunded)throw new Error('REFUND_FAILED');$('#refundscrim').hidden=true;S.refundId=null;await reload();toast('تم تسجيل المرتجع على العهدة المحددة');}catch(e){toast(String(e.message||'').indexOf('OPEN_TILL_REQUIRED')>=0?'العهدة اتقفلت؛ اختر عهدة مفتوحة':String(e.message||'').indexOf('ORDER_NOT_COMPLETED')>=0?'الطلب اتغير أو تم إرجاعه بالفعل':'تعذر تسجيل المرتجع، حاول مرة أخرى');}finally{S.refundBusy=false;$('#refund-confirm').disabled=false;}
}
function payOrder() { return S.orders.find(function (x) { return x.id === S.payId; }); }
function openPay(id) {
if(S.payBusy)return;
var selected=S.orders.find(function(x){return x.id===id;});if(!selected||selected.state!=='active')return toast('الطلب مغلق أو غير متاح');
S.payId = id; S.payM = 'cash'; S.payPaid = '';
var o = payOrder(); if (!o) return;
$('#pay-order-summary').innerHTML=orderRow(o,todayNums()).replace(/<footer class="acts">[\s\S]*?<\/footer>/,'');
$('#pay-t').textContent = 'قفل التذكرة #' + (todayNums()[o.id] || o.number);
$('#pay-total').textContent = money(o.total);
$('#pay-paid').value = '';
updatePay();
$('#payscrim').hidden = false;
}
function updatePay() {
var o = payOrder(); if (!o) return;
document.querySelectorAll('#pay-method button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pm === S.payM)); });
$('#pay-paid-row').hidden = S.payM !== 'cash';
var paid = paidPreview(S.payPaid), ch = $('#pay-change');
if (S.payM === 'cash' && !isNaN(paid)) {
ch.hidden = false;
if (paid >= o.total) { ch.style.color = 'var(--good)'; $('#pay-change-v').textContent = money(paid - o.total); $('#pay-change-l').textContent = 'الباقي للعميل'; }
else { ch.style.color = 'var(--bad)'; $('#pay-change-v').textContent = money(o.total - paid); $('#pay-change-l').textContent = 'ناقص'; }
} else ch.hidden = true;
}
async function confirmPay() {
if(S.payBusy)return;
if(S.role==='admin')return toast('التحصيل من حساب الكاشير');
var o = payOrder(); if (!o||o.state!=='active')return toast('الطلب مغلق أو غير متاح');
if(window.Till&&!Till.requireOpen())return;
var paid;try{paid=S.payM==='cash'?paidValue(S.payPaid):null;}catch(e){return toast('اكتب المبلغ المدفوع بالأرقام فقط، وبحد أقصى منزلتين عشريتين');}
if (S.payM === 'cash' && paid!==null && paid < o.total) return toast('المبلغ المدفوع أقل من الإجمالي');
var btn = $('#pay-ok'); S.payBusy=true;btn.disabled = true;
try {
await orderUpdate(o.id, { state: 'completed', method: S.payM, paid: S.payM === 'cash' && paid!==null ? paid : null });
$('#payscrim').hidden = true; S.payId = null; toast('تم تحصيل الطلب ' + money(o.total));
} catch (e) { toast('تعذر التحصيل، ربما الطلب اتغيّر. حدّث الصفحة'); }
S.payBusy=false;btn.disabled = false;
}
function setView(v) {
if(S.role==='admin'&&v==='pos')v='admin';
if ((v==='admin'||v==='products') && S.role!=='admin') v='pos';
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
if(t.id==='pending-order-retry')return submitPendingOrder();
if(basketLocked()&&(t.dataset.p||t.dataset.size||t.dataset.inc||t.dataset.dec||t.dataset.note||t.dataset.m||t.dataset.t||t.dataset.cust||['clear','discount-open','discount-apply','discount-remove','delivery-remove','note-ok','c-clear','c-save','ab-kitchen','ab-cancel','ab-discount','ab-notes','ab-tags','onote-ok','nav-new'].includes(t.id)))return toast('أكّد نتيجة الطلب المعلّق أولاً');
if(S.payBusy&&(t.dataset.pm||t.id==='pay-x'))return;
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
if (t.id === 'logout') { if(S.busy||S.payBusy||S.refundBusy)return toast('استنى تأكيد العملية قبل تسجيل الخروج');await sb.auth.signOut(); return; }
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
if (!Object.keys(S.cart).length && !S.typePicked) { pendingTypePid = p.id; openTypeSheet(); return; }
return p.sizes ? openSheet(p) : addToCart(p.id + '|');
}
if (t.dataset.typepick) { S.otype = t.dataset.typepick; S.typePicked = true; if (S.otype !== 'delivery') { S.deliveryFee = 0; $('#delivery-fee').value = ''; } $('#scrim').hidden = true; renderCart(); renderCust(true); if (S.otype === 'delivery') { var cv = $('#cust'); if (cv) setTimeout(function () { cv.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); } var pp = S.products.find(function (x) { return x.id === pendingTypePid; }); pendingTypePid = null; if (pp) { if (pp.sizes) openSheet(pp); else addToCart(pp.id + '|'); } return; }
if (t.dataset.size) { $('#scrim').hidden = true; return addToCart(t.dataset.pid + '|' + t.dataset.size); }
if (t.id === 'sheet-x') { $('#scrim').hidden = true; return; }
if (t.dataset.inc) { S.cart[t.dataset.inc]++; return renderPos(); }
if (t.dataset.dec) { var k = t.dataset.dec; S.cart[k]--; if (S.cart[k] <= 0) delete S.cart[k]; if (!Object.keys(S.cart).length) S.typePicked = false; return renderPos(); }
if (t.dataset.m) { S.method = t.dataset.m; return renderCart(); }
if (t.dataset.t) { S.otype = t.dataset.t; S.typePicked = true; if(S.otype!=='delivery'){S.deliveryFee=0;$('#delivery-fee').value='';} renderCart(); renderCust(true); if (S.otype === 'delivery') { var cv2 = $('#cust'); if (cv2) setTimeout(function () { cv2.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); } return; }
if(t.id==='clear'&&S.role!=='admin'&&Object.keys(S.cart).length){return CancelSecurity.open(null,function(){S.cart={};S.typePicked=false;clearAdjustments();S.paid='';$('#paid').value='';S.orderNote='';S.orderTag='';renderPos();});}
if (t.id === 'clear') { S.cart = {}; S.typePicked = false; clearAdjustments(); S.paid = ''; $('#paid').value = ''; S.orderNote = ''; S.orderTag = ''; return renderPos(); }
if (t.id === 'cu-import') { var cf = $('#cu-file'); if (cf) cf.click(); return; }
if (t.id === 'prod-import') { var pf = $('#prod-file'); if (pf) pf.click(); return; }
if (t.id === 'checkout') { openCartPay(); return; }
if (t.dataset.cpm) { S.method = t.dataset.cpm; return renderCart(); }
if (t.id === 'cpay-ok') { $('#cartpayscrim').hidden = true; return checkout(); }
if (t.id === 'cpay-x') { $('#cartpayscrim').hidden = true; return; }
if (t.id === 'cpay-discount') { $('#discountscrim').hidden = false; return; }
if (t.id === 'ab-kitchen') return checkout('active');
if (t.id === 'ab-cancel') { $('#clear').click(); return; }
if (t.id === 'ab-discount') { $('#discount-input').value = S.discount || ''; $('#discountscrim').hidden = false; return; }
if (t.id === 'ab-print') { reprintLatest(); return; }
if (t.id === 'ab-notes') { $('#onote-in').value = S.orderNote; $('#onotescrim').hidden = false; return; }
if (t.id === 'onote-ok') { S.orderNote = $('#onote-in').value.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); $('#onotescrim').hidden = true; return renderCart(); }
if (t.id === 'onote-x') { $('#onotescrim').hidden = true; return; }
if (t.id === 'ab-tags') { $('#tag-chips').innerHTML = TAGS.map(function (c) { return '<button class="chip" data-otag="' + esc(c) + '" aria-pressed="' + String(S.orderTag === c) + '">' + esc(c) + '</button>'; }).join(''); $('#tagscrim').hidden = false; return; }
if (t.dataset.otag) { S.orderTag = S.orderTag === t.dataset.otag ? '' : t.dataset.otag; $('#tagscrim').hidden = true; return renderCart(); }
if (t.id === 'tag-x') { $('#tagscrim').hidden = true; return; }
if (t.id === 'ab-more') { $('#morescrim').hidden = false; return; }
if (t.id === 'more-x') { $('#morescrim').hidden = true; return; }
if (t.id === 'more-print') { $('#morescrim').hidden = true; reprintLatest(); return; }
if (t.id === 'more-printing') { $('#morescrim').hidden = true; return setView('printing'); }
if (t.id === 'more-customers') { $('#morescrim').hidden = true; return setView('customers'); }
if (t.id === 'more-till') { $('#morescrim').hidden = true; return setView('till'); }
if (t.id === 'oa-kitchen') { var bk = document.querySelector('#view-orders [data-print="' + S.selectedOrderId + '"][data-role="kitchen"]'); if (bk) { bk.click(); } else toast('طباعة المطبخ مش متاحة للطلب المحدد'); return; }
if (t.id === 'oa-cancel') { var bc = document.querySelector('#view-orders [data-del="ocancel:' + S.selectedOrderId + '"]'); if (bc) { bc.click(); } else toast('الطلب المحدد مينفعش يتلغي'); return; }
if (t.id === 'oa-discount') { return toast('الخصم بيتحط وقت إنشاء الطلب، مش بعد حفظه'); }
if (t.id === 'oa-tags') { return toast('الوسوم بتتحط وقت إنشاء الطلب، مش بعد حفظه'); }
if (t.id === 'oa-notes') { var on = S.orders.find(function (x) { return x.id === S.selectedOrderId; }); if (!on) return toast('اختر طلب الأول'); var onotes = (on.items || []).filter(function (i) { return i.note; }); $('#ordnotes-body').innerHTML = onotes.length ? onotes.map(function (i) { return '<p><b>' + esc(String(i.n || '').split(' · ').slice(-1)[0]) + ':</b> ' + esc(i.note) + '</p>'; }).join('') : '<p class="note">الطلب ده ملوش ملاحظات على الأصناف</p>'; $('#ordnotescrim').hidden = false; return; }
if (t.id === 'ordnote-x') { $('#ordnotescrim').hidden = true; return; }
if (t.id === 'oa-more') { $('#omorescrim').hidden = false; return; }
if (t.id === 'omore-x') { $('#omorescrim').hidden = true; return; }
if (t.id === 'om-pay') { $('#omorescrim').hidden = true; var bp = document.querySelector('#view-orders [data-pay="' + S.selectedOrderId + '"]'); if (bp) { bp.click(); } else toast('الطلب المحدد مش نشط'); return; }
if (t.id === 'om-receipt') { $('#omorescrim').hidden = true; var br = document.querySelector('#view-orders [data-print="' + S.selectedOrderId + '"][data-role="cashier"]'); if (br) { br.click(); } else toast('الإيصال بيطبع للطلبات المغلقة بس'); return; }
if (t.id === 'om-refund') { $('#omorescrim').hidden = true; var bf = document.querySelector('#view-orders [data-del="orefund:' + S.selectedOrderId + '"]'); if (bf) { bf.click(); } else toast('المرتجع للأدمن على الطلبات المغلقة بس'); return; }
if (t.id === 'more-orders') { $('#morescrim').hidden = true; return setView('orders'); }
if (t.id === 'om-tag') { S.orderTag = ''; return renderCart(); }
if (t.id === 'om-note') { S.orderNote = ''; return renderCart(); }
if (t.id === 'nav-new') { S.cat = null; S.q = ''; $('#q').value = ''; setView('pos'); if (Object.keys(S.cart).length) { checkout('active'); } else renderPos(); return; }
if (t.dataset.range) { S.range = t.dataset.range; return renderAdmin(); }
if(t.dataset.del&&t.dataset.del.startsWith('ocancel:')&&S.role!=='admin'){return CancelSecurity.open(t.dataset.del.slice(8));}
if(t.id==='refund-confirm')return confirmRefund();
if(t.id==='refund-close'){if(!S.refundBusy){S.refundId=null;$('#refundscrim').hidden=true;}return;}
if(t.dataset.del&&t.dataset.del.startsWith('orefund:'))return openRefund(t.dataset.del.slice(8));
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
if(t.dataset.selectOrder){S.selectedOrderId=t.dataset.selectOrder;return renderOrders();}
if (t.dataset.of) { S.ofilter = t.dataset.of; return renderOrders(); }
if (t.dataset.pay) return openPay(t.dataset.pay);
if (t.dataset.pm) { S.payM = t.dataset.pm; return updatePay(); }
if (t.id === 'pay-ok') return confirmPay();
if (t.id === 'pay-x') { if(S.payBusy)return; $('#payscrim').hidden = true; S.payId = null; return; }
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
$('#payscrim').addEventListener('click', function (e) { if (e.target.id === 'payscrim'&&!S.payBusy) { $('#payscrim').hidden = true; S.payId = null; } });
setInterval(function () { if (S.view === 'orders' && !S.payId) renderOrders(); }, 60000);
$('#q').addEventListener('input', function (e) { S.q = e.target.value.trim(); renderPos(); });
document.addEventListener('input', function (e) {
if(e.target.id==='order-search'){var cursor=e.target.selectionStart;S.orderQ=e.target.value;renderOrders();var input=$('#order-search');input.focus();if(input.setSelectionRange)input.setSelectionRange(cursor,cursor);return;}
if(e.target.id==='delivery-fee'){if(basketLocked()){e.target.value=S.deliveryFee||'';return;}var fee=Number(e.target.value);S.deliveryFee=Number.isFinite(fee)&&fee>=0?Math.round(fee*100)/100:0;e.target.setCustomValidity(fee<0?'الرسوم لا يمكن تكون سالبة':'');renderCart();}
else if(e.target.id==='product-search'){S.productQ=e.target.value;renderProductRows();}
else if (e.target.id === 'note-in') { if (S.note) { S.note.text = e.target.value; syncChips(); } }
else if (e.target.id === 'pay-paid') { S.payPaid = e.target.value; updatePay(); }
else if (e.target.id === 'c-q') { S.custQ = e.target.value; renderCustList(); }
else if (e.target.id === 'cu-q') { S.cuQ = e.target.value; var el = e.target, pos = el.selectionStart; renderCustomers(); var n2 = document.getElementById('cu-q'); if (n2) { n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (x) {} } }
});
$('#paid').addEventListener('input', function (e) { if(basketLocked()){e.target.value=S.paid;return;}S.paid = e.target.value; renderCart(); });
$('#cpay-paid').addEventListener('input', function (e) { if(basketLocked()){e.target.value=S.paid;return;} S.paid = e.target.value; renderCart(); });
async function boot() {
var v = 'pos';
try { v = localStorage.getItem(LS + 'view') || 'pos'; } catch (e) {}
setView(v === 'admin' || v === 'orders' || v === 'customers' || v === 'products' || v === 'till' || v === 'printing' ? v : 'pos');
sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') { S.products = []; S.sales = []; S.expenses = []; S.staff = []; S.customers = []; S.orders = []; S.cust = null; S.newCust = false; S.role = 'cashier';S.pendingOrder=null;S.refundId=null;$('#refundscrim').hidden=true;S.cart = {}; clearAdjustments(); S.discount=0; if(window.CancelSecurity)CancelSecurity.reset();if(window.PrintSettings)PrintSettings.reset();if(window.Till)Till.reset();myEmail='';showLogin(); } });
var r = await sb.auth.getSession();
if (r.data.session) enter(r.data.session); else showLogin();
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){['discountscrim','productscrim'].forEach(function(id){$('#'+id).hidden=true;});}});
if(window.Till)Till.init({client:sb,role:function(){return S.role;},email:function(){return myEmail;},onChange:reload,hasPendingOrder:function(){return !!S.pendingOrder||S.busy;},showMessage:toast,changeView:setView,amount:money,escape:esc});
if(window.PrintSettings)PrintSettings.init({client:sb,categories:function(){return S.categories;},role:function(){return S.role;},toast:toast});
if(window.CancelSecurity)CancelSecurity.init({client:sb,role:function(){return S.role;},reload:reload,toast:toast});
async function recoveryScreen(){
 document.body.classList.remove('authed');
 const form=document.getElementById('login-form');
 form.innerHTML='<h1>تغيير كلمة المرور</h1><input class="in" type="password" autocomplete="new-password" minlength="6" required placeholder="كلمة المرور الجديدة"><input class="in" type="password" autocomplete="new-password" required placeholder="تأكيد كلمة المرور"><button class="btn" disabled>حفظ كلمة المرور</button><p role="status"></p>';
 const msg=form.querySelector('p'),button=form.querySelector('button');
 form.addEventListener('submit',async function(event){
  event.preventDefault();event.stopImmediatePropagation();
  if(button.disabled)return;
  const fields=form.querySelectorAll('input');
  if(fields[0].value!==fields[1].value){msg.textContent='كلمتا المرور مختلفتان';return;}
  button.disabled=true;
  try{const result=await sb.auth.updateUser({password:fields[0].value});if(result.error)throw result.error;
   await sb.auth.signOut({scope:'local'});location.replace('/');
  }catch(err){msg.textContent='تعذّر الحفظ. راجع قوة كلمة المرور أو اطلب رابطاً جديداً.';button.disabled=false;}
 },true);
 const session=await sb.auth.getSession();
 if(session.error||!session.data.session){msg.textContent='انتهت صلاحية الرابط. اطلب رابطاً جديداً من شاشة الدخول.';return;}
 button.disabled=false;
}
if(recoveryReturn){recoveryScreen();}else{
 const forgot=document.createElement('button');
 forgot.type='button';forgot.className='linkbtn';forgot.textContent='نسيت كلمة المرور؟';
 document.getElementById('login-toggle').after(forgot);
 forgot.onclick=async function(){
 const input=document.getElementById('l-email'),message=document.getElementById('login-msg');
 if(!input.value.trim()||!input.checkValidity()){message.textContent='اكتب إيميل الموظف أولاً';input.focus();return;}
 forgot.disabled=true;
 try{const result=await sb.auth.resetPasswordForEmail(input.value.trim(),{redirectTo:location.origin+'/'});if(result.error)throw result.error;message.textContent='راجع بريدك لفتح رابط استعادة كلمة المرور.';}
 catch(err){message.textContent='تعذّر إرسال الرابط. حاول مرة أخرى لاحقاً.';}finally{forgot.disabled=false;}
 };
 boot();
}
})();


