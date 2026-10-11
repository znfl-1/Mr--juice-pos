(function () {
'use strict';
var defaults = {shop_name:'Mr Juice',subtitle:'Mr.Juice - الرفاعي',invoice_title:'Simplified Tax Invoice',footer:'',delivery_phone:'0402232302',show_logo:true,show_printed_at:true,show_check_number:true,show_customer:true,show_product_count:true,font_size:26,logo_width_percent:75,order_font_size:40,bottom_space:12,logo_data:''};
var cfg = Object.assign({}, defaults), defaultLogo = '', form = document.getElementById('settings'), preview = document.getElementById('preview'), message = document.getElementById('message');
var ranges = {font_size:[18,36],logo_width_percent:[30,90],order_font_size:[28,54],bottom_space:[0,80]};
function normalize(raw) {
 var out = Object.assign({},defaults);
 Object.keys(defaults).forEach(function(key) {
  if (typeof raw[key] === typeof defaults[key]) out[key] = raw[key];
  if (ranges[key]) out[key] = Math.round(Math.max(ranges[key][0],Math.min(ranges[key][1],Number(out[key]) || defaults[key])));
  else if (typeof out[key] === 'string' && key !== 'logo_data') out[key] = out[key].slice(0,200);
 });
 if (out.logo_data && (!out.logo_data.startsWith('data:image/png;base64,') || out.logo_data.length > 4000000)) throw new Error('اللوجو غير صالح أو حجمه كبير');
 return out;
}
function setFields() {
 Object.keys(defaults).forEach(function(key) {var el=form.elements.namedItem(key);if(el){if(el.type==='checkbox')el.checked=cfg[key];else el.value=cfg[key];}});
 render();
}
function save() {try{localStorage.setItem('mrjuice_receipt_design',JSON.stringify(cfg));}catch(e){message.textContent='المعاينة شغالة، لكن حفظ الإعدادات على المتصفح غير متاح. نزّل الملف لحفظها.';}}
function node(tag,text,cls) {var el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
function render() {
 preview.replaceChildren();preview.style.fontSize=(cfg.font_size*0.56)+'px';
 function add(tag,text,cls){var el=node(tag,text,cls);preview.appendChild(el);return el;}
 function line(){add('div',null,'rule');}
 if(cfg.show_logo){var logo=add('img');logo.src=cfg.logo_data || 'receipt-logo.png';logo.alt=cfg.shop_name;logo.style.width=cfg.logo_width_percent+'%';}else add('p',cfg.shop_name,'center');
 if(cfg.subtitle)add('p',cfg.subtitle,'center');
 if(cfg.invoice_title)add('p',cfg.invoice_title,'center');
 add('div','Order# 4','order').style.fontSize=(cfg.order_font_size*0.56)+'px';
 if(cfg.show_printed_at)add('p','Printed At: 2026/10/11 05:47:04 PM','center');
 line();var meta=add('div',null,'meta');meta.append(node('span','Delivery'),node('span',cfg.show_check_number?'Check# 146709':''));
 add('p','2026/10/11 05:18:29 PM').style.textAlign='right';
 if(cfg.show_customer){line();var customer=add('div');customer.dir='rtl';customer.append(node('p','العميل: أحمد محمد'),node('p','الموبايل: 01012345678'),node('p','العنوان: شارع التحرير'));}
 line();var table=add('table');var head=node('tr');['Qty','Item','Price'].forEach(function(t){head.appendChild(node('th',t));});table.appendChild(head);
 var row=node('tr');row.appendChild(node('td','2'));var item=node('td','قهوة تركي سادة سنجل');item.dir='rtl';row.appendChild(item);row.appendChild(node('td','EGP 50.00'));table.appendChild(row);
 line();[['Total','EGP 50.00'],['Payment - Cash','EGP 50.00']].forEach(function(pair){var r=add('div',null,'money-row');r.append(node('span',pair[0]),node('span',pair[1]));});
 if(cfg.show_product_count){line();add('p','Products Count 2','center');}
 if(cfg.footer){line();add('p',cfg.footer,'center');}
 if(cfg.delivery_phone){var tel=add('p','For delivery: '+cfg.delivery_phone,'center');tel.style.marginTop='14px';}
 preview.style.paddingBottom=(cfg.bottom_space*0.56+14)+'px';
}
form.addEventListener('submit',function(e){e.preventDefault();});
form.addEventListener('input',function(e){var key=e.target.name;if(!(key in defaults))return;cfg[key]=e.target.type==='checkbox'?e.target.checked:(ranges[key]?Number(e.target.value):e.target.value);cfg=normalize(cfg);save();render();});
document.getElementById('logo-upload').addEventListener('change',async function(e){
 var file=e.target.files[0];if(!file)return;
 try{
  if(file.size>4000000)throw new Error('اختار صورة أصغر من 4 ميجابايت');
  var url=URL.createObjectURL(file),img=new Image();
  try{await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=reject;img.src=url;});
   if(img.width*img.height>16000000)throw new Error('أبعاد الصورة كبيرة جدًا');
   var scale=Math.min(1,1200/img.width,600/img.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
   var ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);cfg.logo_data=canvas.toDataURL('image/png');cfg=normalize(cfg);save();render();message.textContent='تم تغيير اللوجو؛ نزّل الإعدادات لتطبيقه على الطابعة.';
  }finally{URL.revokeObjectURL(url);}
 }catch(err){message.textContent=err.message || 'تعذر فتح الصورة';}
});
document.getElementById('export').addEventListener('click',async function(){
 try{
  var out=Object.assign({},cfg);
  if(out.show_logo && !out.logo_data){if(!defaultLogo)throw new Error('اللوجو لسه بيتحمّل؛ جرّب بعد لحظات');out.logo_data=defaultLogo;}
  var url=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));var a=node('a');a.href=url;a.download='receipt_settings.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);message.textContent='انسخ receipt_settings.json إلى مجلد برنامج الطباعة لتطبيق التصميم.';
 }catch(err){message.textContent=err.message;}
});
document.getElementById('reset').addEventListener('click',function(){cfg=Object.assign({},defaults);save();setFields();message.textContent='تم استرجاع الشكل الافتراضي';});
document.getElementById('import').addEventListener('change',async function(e){try{var file=e.target.files[0];if(!file)return;if(file.size>4000000)throw new Error('الملف كبير جدًا');cfg=normalize(JSON.parse(await file.text()));save();setFields();message.textContent='تم فتح التصميم';}catch(err){message.textContent='تعذر فتح ملف الإعدادات';}});
try{var saved=localStorage.getItem('mrjuice_receipt_design');if(saved)cfg=normalize(JSON.parse(saved));}catch(e){}
setFields();
fetch('receipt-logo.png').then(function(r){if(!r.ok)throw new Error('logo');return r.blob();}).then(function(blob){var reader=new FileReader();reader.onload=function(){defaultLogo=reader.result;};reader.readAsDataURL(blob);}).catch(function(){message.textContent='تعذر تحميل اللوجو الافتراضي؛ ارفع صورة اللوجو قبل تنزيل الإعدادات.';});
})();
