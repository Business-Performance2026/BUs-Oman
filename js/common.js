// أدوات مشتركة
function qs(id){ return document.getElementById(id); }
function param(name){ return new URLSearchParams(location.search).get(name); }

function toast(msg){
  let t = qs('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2500);
}

function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  qs(id).classList.add('active');
  window.scrollTo(0,0);
}

function makeQR(el, text, size){
  el.innerHTML = '';
  new QRCode(el, { text, width: size||150, height: size||150, colorDark:'#0d2440' });
}

function slugify(name){
  return name.trim().toLowerCase()
    .replace(/[\s\u0600-\u06FF]+/g,'-')
    .replace(/[^a-z0-9-]/g,'')
    .replace(/-+/g,'-') || 'company-' + Math.random().toString(36).slice(2,8);
}

function companyLink(slug){
  return location.origin + '/customer.html?c=' + slug;
}

function fmtDate(d){ // d: Date
  return d.toLocaleDateString('ar', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function myRole(uid){
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? doc.data().role : null;
}

function logout(){
  auth.signOut().then(()=> location.href='index.html');
}
