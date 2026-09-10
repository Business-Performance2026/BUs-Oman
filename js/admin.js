// لوحة الأدمن
let allCompanies = [];

auth.onAuthStateChanged(async user => {
  if(!user) return;
  if(await myRole(user.uid) === 'admin') loadAdmin();
  else { toast('هذا الحساب ليس حساب إدارة'); auth.signOut(); }
});

async function adminLogin(){
  const email=qs('aEmail').value.trim(), pass=qs('aPass').value;
  if(!email||!pass){ err('loginErr','أدخل البريد وكلمة المرور'); return; }
  try{ await auth.signInWithEmailAndPassword(email,pass); }
  catch(e){ err('loginErr', e.code==='auth/invalid-credential'?'بيانات الدخول غير صحيحة':e.code); }
}
function err(id,msg){ const el=qs(id); el.textContent=msg; el.classList.add('show'); }

const STATUS = {
  active:   ['b-green','ساري'],
  pending:  ['b-gold','بانتظار التفعيل'],
  suspended:['b-red','موقوف']
};

async function loadAdmin(){
  show('s-dash');
  const [co, bk, tr] = await Promise.all([
    db.collection('companies').get(),
    db.collection('bookings').get(),
    db.collection('trips').get()
  ]);
  allCompanies = co.docs.map(d=>({id:d.id,...d.data()}));
  qs('stCo').textContent = allCompanies.length;
  qs('stBk').textContent = bk.size;
  qs('stTr').textContent = tr.size;
  const pending = allCompanies.filter(c=>c.status==='pending');
  qs('stPd').textContent = pending.length;
  qs('pendingList').innerHTML = pending.length ? pending.map(coRow).join('')
    : '<div class="empty">لا توجد طلبات جديدة ✔</div>';
  renderCompanies(allCompanies);
}

function coRow(c){
  const [cls,label] = STATUS[c.status] || STATUS.pending;
  return `<div class="lrow">
    <div class="ava">🚌</div>
    <div class="grow" onclick="openCompany('${c.id}')" style="cursor:pointer">
      <h4>${esc(c.name)}</h4>
      <p dir="ltr" style="text-align:right">${esc(c.email)}</p>
      <p dir="ltr" style="text-align:right">واتساب: ${esc(c.whatsapp)}</p>
    </div>
    <span class="badge ${cls}">${label}</span>
    ${c.status!=='active' ? `<button class="icon-btn" style="background:#dff3e9" title="تفعيل" onclick="setStatus('${c.id}','active')">✔️</button>` : ''}
    ${c.status!=='suspended' ? `<button class="icon-btn" style="background:#fdeaea" title="إيقاف" onclick="setStatus('${c.id}','suspended')">⛔</button>` : ''}
  </div>`;
}

function renderCompanies(list){
  qs('companiesList').innerHTML = list.length ? list.map(coRow).join('')
    : '<div class="empty">لا توجد شركات</div>';
}

function showOnly(status){
  show('s-dash');
  renderCompanies(allCompanies.filter(c=>c.status===status));
}

async function setStatus(id, status){
  await db.collection('companies').doc(id).update({status});
  toast(status==='active'?'تم تفعيل الشركة ✔ — رابطها وباركودها يعملان الآن':'تم إيقاف الشركة');
  loadAdmin();
}

async function openCompany(id){
  const c = allCompanies.find(x=>x.id===id);
  const link = companyLink(c.slug);
  const [t, b, e] = await Promise.all([
    db.collection('trips').where('companyId','==',id).get(),
    db.collection('bookings').where('companyId','==',id).get(),
    db.collection('employees').where('companyId','==',id).get()
  ]);
  const [cls,label] = STATUS[c.status] || STATUS.pending;
  qs('coDetail').innerHTML = `
    <div class="card center">
      <div class="ava" style="width:60px;height:60px;border-radius:18px;background:var(--teal-l);display:inline-flex;align-items:center;justify-content:center;font-size:28px">🚌</div>
      <h3 style="font-weight:900;margin-top:8px">${esc(c.name)}</h3>
      <span class="badge ${cls}" style="margin-top:6px">${label}</span>
      <div class="tline" style="margin-top:12px"><span class="muted">📧 البريد</span><b dir="ltr">${esc(c.email)}</b></div>
      <div class="tline"><span class="muted">📱 واتساب</span><b dir="ltr">${esc(c.whatsapp)}</b></div>
      <div class="tline"><span class="muted">🗓️ الرحلات</span><b>${t.size}</b></div>
      <div class="tline"><span class="muted">🎫 الحجوزات</span><b>${b.size}</b></div>
      <div class="tline" style="border:none"><span class="muted">👥 الموظفون</span><b>${e.size}</b></div>
    </div>
    <div class="qr-box">
      <div class="qr-holder" id="admQr"></div>
      <p dir="ltr" style="font-size:12.5px;font-weight:700;color:var(--teal);margin-top:10px;word-break:break-all">${link}</p>
    </div>
    <div style="height:12px"></div>
    ${c.status!=='active' ? `<button class="btn btn-green" onclick="setStatus('${c.id}','active');show('s-dash')">✔️ تفعيل الشركة</button><div style="height:10px"></div>` : ''}
    ${c.status!=='suspended' ? `<button class="btn btn-danger" onclick="setStatus('${c.id}','suspended');show('s-dash')">⛔ إيقاف الشركة</button>` : ''}`;
  makeQR(qs('admQr'), link, 170);
  show('s-co');
}
