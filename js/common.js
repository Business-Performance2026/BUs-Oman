// أدوات مشتركة
function qs(id){ return document.getElementById(id); }
function param(name){ return new URLSearchParams(location.search).get(name); }

function toast(msg){
  let t = qs('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2500);
}

/* ===== التنقل مع دعم زر الرجوع في الجوال ===== */
let _navStack = [];
function show(id, push){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  qs(id).classList.add('active');
  window.scrollTo(0,0);
  if(push !== false){
    _navStack.push(id);
    history.pushState({s:id}, '');
  }
}
window.addEventListener('popstate', ()=>{
  if(_navStack.length > 1){
    _navStack.pop();
    const prev = _navStack[_navStack.length-1];
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    qs(prev).classList.add('active');
    window.scrollTo(0,0);
  } else {
    history.pushState({s:_navStack[0]}, '');
  }
});
function goBack(){ history.back(); }

function makeQR(el, text, size){
  el.innerHTML = '';
  new QRCode(el, { text, width: size||150, height: size||150, colorDark:'#0d2440' });
}

// تحميل الباركود كصورة PNG
function downloadQR(holderId, filename){
  const canvas = qs(holderId).querySelector('canvas');
  const img = qs(holderId).querySelector('img');
  const url = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if(!url){ toast('تعذر تحميل الباركود'); return; }
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'qrcode.png';
  document.body.appendChild(a); a.click(); a.remove();
  toast('تم تحميل الباركود ✔');
}

function slugify(name){
  return name.trim().toLowerCase()
    .replace(/[\s\u0600-\u06FF]+/g,'-')
    .replace(/[^a-z0-9-]/g,'')
    .replace(/-+/g,'-') || 'company-' + Math.random().toString(36).slice(2,8);
}

// رابط العميل — مسار مطلق يعمل على Firebase Hosting والمعاينة
function companyLink(slug){
  return location.origin + location.pathname.replace(/[^/]*$/, '') + 'customer.html?c=' + slug;
}

function fmtDate(d){
  return d.toLocaleDateString('ar', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function myRole(uid){
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? doc.data() : null;
}

function logout(){
  auth.signOut().then(()=> location.href='index.html');
}

// تطبيع رقم الواتساب وفتح المحادثة
function waLink(num){ return 'https://wa.me/' + String(num||'').replace(/\D/g,'').replace(/^0/,'966'); }

// صلاحية الشركة: مفعّلة + الاشتراك/التجريبي سارٍ
function companyValid(c){
  if(!c || c.status !== 'active') return false;
  const now = Date.now()/1000;
  if(c.subscriptionEnd?.seconds) return c.subscriptionEnd.seconds > now;
  if(c.trialEndsAt?.seconds) return c.trialEndsAt.seconds > now;
  return true;
}

function daysLeft(c){
  const now = Date.now()/1000;
  const end = c.subscriptionEnd?.seconds || c.trialEndsAt?.seconds;
  if(!end) return null;
  return Math.max(0, Math.ceil((end - now)/86400));
}
