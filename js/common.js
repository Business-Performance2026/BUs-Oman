// أدوات مشتركة
function qs(id){ return document.getElementById(id); }
function param(name){ return new URLSearchParams(location.search).get(name); }

function toast(msg){
  let t = qs('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2500);
}

/* مؤشر التحديث اللحظي — يظهر للجميع عند وصول بيانات جديدة */
let _updT1, _updT2;
function flashUpdate(){
  let el = document.getElementById('updPill');
  if(!el){
    el = document.createElement('div');
    el.id = 'updPill'; el.className = 'upd-pill';
    document.body.appendChild(el);
  }
  el.textContent = '🔄 جارِ التحديث...';
  el.classList.add('show');
  clearTimeout(_updT1); clearTimeout(_updT2);
  _updT1 = setTimeout(()=>{ el.textContent = '✔ تم التحديث'; }, 600);
  _updT2 = setTimeout(()=>{ el.classList.remove('show'); }, 1800);
}

/* تسجيل Service Worker لتفعيل "إضافة إلى الشاشة الرئيسية" */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

/* ===== استمرارية الجلسة: الصفحة والبيانات تبقى بعد تحديث الصفحة ===== */
const _pgKey = location.pathname.split('/').pop() || 'index.html';
const SAVED_AT_LOAD = {
  screen: sessionStorage.getItem(_pgKey+':screen'),
  draft:  sessionStorage.getItem(_pgKey+':draft'),
  state:  sessionStorage.getItem(_pgKey+':state')
};
function saveNavState(obj){ sessionStorage.setItem(_pgKey+':state', JSON.stringify(obj||{})); }
function restoreDraft(id){
  try{
    const d = JSON.parse(SAVED_AT_LOAD.draft||'null');
    if(d && d.screen===id){
      Object.entries(d.values).forEach(([k,v])=>{
        const el = qs(k); if(!el) return;
        if(el.type==='checkbox') el.checked = v; else el.value = v;
      });
    }
  }catch(e){}
}
window.addEventListener('beforeunload', ()=>{
  const active = document.querySelector('.screen.active');
  if(!active) return;
  const vals = {};
  active.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{
    vals[el.id] = el.type==='checkbox' ? el.checked : el.value;
  });
  sessionStorage.setItem(_pgKey+':draft', JSON.stringify({screen: active.id, values: vals}));
});

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
  sessionStorage.setItem(_pgKey+':screen', id);
}
window.addEventListener('popstate', ()=>{
  if(_navStack.length > 1){
    _navStack.pop();
    const prev = _navStack[_navStack.length-1];
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    qs(prev).classList.add('active');
    window.scrollTo(0,0);
    sessionStorage.setItem(_pgKey+':screen', prev);
    if(window._afterNav) window._afterNav(prev);
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
  // مسح علامات الإعلانات المقروءة — الدخول الجديد يعرضها مرة واحدة
  Object.keys(sessionStorage).filter(k=>k.startsWith('ann:')).forEach(k=>sessionStorage.removeItem(k));
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

/* ===== نوافذ منبثقة أنيقة ===== */
function closeModal(){ document.querySelectorAll('.mback').forEach(m=>m.remove()); }

function confirmBox({icon='❓', title, msg, ok='تأكيد', danger=false}, onOk){
  closeModal();
  const m = document.createElement('div');
  m.className = 'mback';
  m.innerHTML = `<div class="modal">
    <div class="m-ic">${icon}</div>
    <h3>${title}</h3>
    <p>${msg}</p>
    <div class="row">
      <button class="btn btn-ghost" id="mNo">إلغاء</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'}" id="mOk">${ok}</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.querySelector('#mNo').onclick = closeModal;
  m.querySelector('#mOk').onclick = ()=>{ closeModal(); onOk(); };
  m.onclick = e => { if(e.target===m) closeModal(); };
}

function promptBox({icon='✏️', title, msg='', placeholder='', ok='حفظ', danger=false}, onOk){
  closeModal();
  const m = document.createElement('div');
  m.className = 'mback';
  m.innerHTML = `<div class="modal">
    <div class="m-ic">${icon}</div>
    <h3>${title}</h3>
    ${msg?`<p>${msg}</p>`:''}
    <textarea id="mText" placeholder="${placeholder}"></textarea>
    <div class="row">
      <button class="btn btn-ghost" id="mNo">إلغاء</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'}" id="mOk">${ok}</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.querySelector('#mNo').onclick = closeModal;
  m.querySelector('#mOk').onclick = ()=>{
    const v = m.querySelector('#mText').value.trim();
    closeModal(); onOk(v);
  };
  m.onclick = e => { if(e.target===m) closeModal(); };
}

function infoBox({icon='📢', title, msg, ok='حسنًا'}){
  closeModal();
  const m = document.createElement('div');
  m.className = 'mback';
  m.innerHTML = `<div class="modal">
    <div class="m-ic">${icon}</div>
    <h3>${title}</h3>
    <p>${msg}</p>
    <button class="btn btn-primary" id="mOk">${ok}</button>
  </div>`;
  document.body.appendChild(m);
  m.querySelector('#mOk').onclick = closeModal;
}

// زر خروج مربع يظهر في كل صفحات الشركة
const LOGOUT_BTN = '<button class="side" onclick="logout()" style="font-weight:800">⎋ خروج</button>';
