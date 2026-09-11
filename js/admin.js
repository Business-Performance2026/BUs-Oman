// لوحة الأدمن
let allCompanies = [], statusFilter = '';

auth.onAuthStateChanged(async user => {
  if(!user){ history.replaceState({s:'s-login'},''); _navStack=['s-login']; show('s-login', false); return; }
  const u = await myRole(user.uid);
  if(u && u.role === 'admin') loadAdmin();
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
  active:   ['b-green','مفعّلة'],
  pending:  ['b-gold','بانتظار التفعيل'],
  suspended:['b-red','موقوفة']
};

async function loadAdmin(){
  history.replaceState({s:'s-dash'},''); _navStack=['s-dash'];
  const [co, bk, tr] = await Promise.all([
    db.collection('companies').get(),
    db.collection('bookings').get(),
    db.collection('trips').get()
  ]);
  allCompanies = co.docs.map(d=>({id:d.id,...d.data()}));
  qs('stCo').textContent = allCompanies.length;
  qs('stBk').textContent = bk.size;
  qs('stTr').textContent = tr.size;
  qs('stRev').textContent = bk.docs.reduce((s,d)=>{ const x=d.data(); return s+(x.price||0)*(x.seats||1); },0).toLocaleString();
  qs('stAct').textContent = allCompanies.filter(c=>c.status==='active').length;
  const pending = allCompanies.filter(c=>c.status==='pending');
  qs('stPd').textContent = pending.length;
  qs('pendingList').innerHTML = pending.length ? pending.map(coRow).join('')
    : '<div class="empty">لا توجد طلبات جديدة ✔</div>';
  show('s-dash', false);
}

function coRow(c){
  const [cls,label] = STATUS[c.status] || STATUS.pending;
  const dl = daysLeft(c);
  return `<div class="lrow">
    <div class="ava">🚌</div>
    <div class="grow" onclick="openCompany('${c.id}')" style="cursor:pointer">
      <h4>${esc(c.name)}</h4>
      <p dir="ltr" style="text-align:right">${esc(c.email)}</p>
      <a href="${waLink(c.whatsapp)}" target="_blank" style="text-decoration:none"><p dir="ltr" style="text-align:right;color:var(--green);font-weight:800">📱 واتساب: ${esc(c.whatsapp)}</p></a>
      ${dl!==null && c.status==='active' ? `<p class="muted">${c.subscriptionEnd?.seconds?'الاشتراك':'التجريبي'}: متبقي ${dl} يوم</p>` : ''}
    </div>
    <span class="badge ${cls}">${label}</span>
    ${c.status!=='active' ? `<button class="icon-btn" style="background:#dff3e9" title="تفعيل" onclick="setStatus('${c.id}','active')">✔️</button>` : ''}
    ${c.status!=='suspended' ? `<button class="icon-btn" style="background:#fdeaea" title="إيقاف" onclick="setStatus('${c.id}','suspended')">⛔</button>` : ''}
  </div>`;
}

/* ===== صفحة الشركات مع الفلاتر ===== */
function openCompanies(){ renderCompanies(); show('s-companies'); }
function showOnly(s){
  statusFilter = s;
  document.querySelectorAll('#statusChips .chip').forEach(c=>c.classList.toggle('on', c.dataset.s===s));
  renderCompanies(); show('s-companies');
}
qs('statusChips').addEventListener('click', e=>{
  const b = e.target.closest('.chip'); if(!b) return;
  showOnly(b.dataset.s);
});
function renderCompanies(){
  const list = statusFilter ? allCompanies.filter(c=>c.status===statusFilter) : allCompanies;
  qs('companiesList').innerHTML = list.length ? list.map(coRow).join('')
    : '<div class="empty">لا توجد شركات في هذه الحالة</div>';
}

async function setStatus(id, status){
  if(status === 'suspended'){
    promptBox({ icon:'⛔', title:'إيقاف الشركة', msg:'اكتب سبب الإيقاف — سيظهر لصاحب الشركة عند دخوله.', placeholder:'مثال: تأخر سداد الاشتراك...', ok:'إيقاف الشركة', danger:true },
    async (reason)=>{
      await db.collection('companies').doc(id).update({
        status:'suspended', suspensionReason: reason || 'لم يُذكر سبب' });
      toast('تم إيقاف الشركة');
      await loadAdmin();
    });
    return;
  }
  const data = { status };
  if(status === 'active') data.suspensionReason = firebase.firestore.FieldValue.delete();
  await db.collection('companies').doc(id).update(data);
  toast('تم تفعيل الشركة ✔ — رابطها وباركودها يعملان الآن');
  await loadAdmin();
}

/* ===== تفاصيل شركة ===== */
async function openCompany(id){
  const c = allCompanies.find(x=>x.id===id);
  const link = companyLink(c.slug);
  const [t, b, e] = await Promise.all([
    db.collection('trips').where('companyId','==',id).get(),
    db.collection('bookings').where('companyId','==',id).get(),
    db.collection('employees').where('companyId','==',id).get()
  ]);
  const [cls,label] = STATUS[c.status] || STATUS.pending;
  const dl = daysLeft(c);
  qs('coDetail').innerHTML = `
    <div class="card center">
      <div class="ava" style="width:60px;height:60px;border-radius:18px;background:var(--teal-l);display:inline-flex;align-items:center;justify-content:center;font-size:28px">🚌</div>
      <h3 style="font-weight:900;margin-top:8px">${esc(c.name)}</h3>
      <span class="badge ${cls}" style="margin-top:6px">${label}</span>
      <div class="tline" style="margin-top:12px"><span class="muted">📧 البريد</span><b dir="ltr">${esc(c.email)}</b></div>
      <div class="tline"><span class="muted">📱 واتساب</span><a href="${waLink(c.whatsapp)}" target="_blank" style="color:var(--green);font-weight:900;text-decoration:none" dir="ltr">${esc(c.whatsapp)} 💬</a></div>
      <div class="tline"><span class="muted">🏦 رقم التحويل</span><b dir="ltr">${esc(c.transferPhone||'—')}</b></div>
      <div class="tline"><span class="muted">🗓️ الرحلات</span><b>${t.size}</b></div>
      <div class="tline"><span class="muted">🎫 الحجوزات</span><b>${b.size}</b></div>
      <div class="tline"><span class="muted">👥 الموظفون</span><b>${e.size}</b></div>
      <div class="tline" style="border:none"><span class="muted">⏳ ${c.subscriptionEnd?.seconds?'الاشتراك':'التجريبي'}</span><b>${dl!==null ? 'متبقي '+dl+' يوم' : '—'}</b></div>
    </div>
    <div class="qr-box">
      <div class="qr-holder" id="admQr"></div>
      <p dir="ltr" style="font-size:12.5px;font-weight:700;color:var(--teal);margin:10px 0;word-break:break-all">${link}</p>
      <div class="row">
        <button class="btn btn-teal" onclick="navigator.clipboard.writeText('${link}').then(()=>toast('تم نسخ الرابط'))">📋 نسخ الرابط</button>
        <button class="btn btn-ghost" onclick="downloadQR('admQr','${c.slug}.png')">⬇️ تحميل الباركود</button>
      </div>
    </div>
    <h2 class="sec">الاشتراك</h2>
    <div class="card" style="display:flex;gap:10px;align-items:center">
      <input type="number" id="subDays" min="1" placeholder="عدد الأيام" style="flex:1;border:1.5px solid var(--line);border-radius:12px;padding:12px;font-family:inherit;font-size:15px;outline:none" inputmode="numeric">
      <button class="btn btn-teal" style="width:auto;padding:12px 22px" onclick="extendSubInput('${c.id}')">تمديد ✔</button>
    </div>
    <h2 class="sec">📢 إعلان للشركة</h2>
    <div class="card">
      <div class="field"><textarea id="annText" rows="3" placeholder="اكتب إعلانًا يظهر للشركة في كل مرة تفتح التطبيق..." style="width:100%;border:1.5px solid var(--line);border-radius:12px;padding:12px;font-family:inherit;font-size:14px;outline:none;resize:vertical">${esc(c.announcement?.text||'')}</textarea></div>
      <div class="row">
        <button class="btn btn-teal" onclick="setAnnouncement('${c.id}', true)">📢 تفعيل الإعلان</button>
        <button class="btn btn-ghost" onclick="setAnnouncement('${c.id}', false)">إيقاف الإعلان</button>
      </div>
      ${c.announcement?.active ? '<p class="muted center" style="margin-top:8px;font-size:12px">الإعلان مفعّل حاليًا ✔</p>' : ''}
    </div>
    <div style="height:12px"></div>
    <button class="btn btn-ghost" onclick="resetPass('${esc(c.email)}')">🔑 إرسال رابط إعادة تعيين كلمة المرور</button>
    <div style="height:12px"></div>
    ${c.status!=='active' ? `<button class="btn btn-green" onclick="setStatus('${c.id}','active');openCompany('${c.id}')">✔️ تفعيل الشركة</button><div style="height:10px"></div>` : ''}
    ${c.status!=='suspended' ? `<button class="btn btn-danger" onclick="setStatus('${c.id}','suspended')">⛔ إيقاف الشركة</button>` : ''}`;
  makeQR(qs('admQr'), link, 170);
  show('s-co');
}

async function extendSubInput(id){
  const days = +qs('subDays').value;
  if(!days || days < 1){ toast('اكتب عدد الأيام أولًا'); return; }
  await extendSub(id, days);
}

async function extendSub(id, days){
  const c = allCompanies.find(x=>x.id===id);
  const now = Date.now();
  const base = (c.subscriptionEnd?.seconds||0)*1000 > now ? c.subscriptionEnd.seconds*1000 : now;
  const end = new Date(base + days*86400000);
  await db.collection('companies').doc(id).update({
    subscriptionEnd: firebase.firestore.Timestamp.fromDate(end)
  });
  c.subscriptionEnd = firebase.firestore.Timestamp.fromDate(end);
  toast(`تم تمديد الاشتراك ${days} يوم ✔`);
  openCompany(id);
}

async function setAnnouncement(id, active){
  const text = qs('annText').value.trim();
  if(active && !text){ toast('اكتب نص الإعلان أولًا'); return; }
  await db.collection('companies').doc(id).update({
    announcement: { text, active }
  });
  const c = allCompanies.find(x=>x.id===id);
  c.announcement = { text, active };
  toast(active ? 'الإعلان مفعّل — سيظهر للشركة عند كل فتح للتطبيق' : 'تم إيقاف الإعلان');
  openCompany(id);
}

async function resetPass(email){
  try{
    await auth.sendPasswordResetEmail(email);
    toast('أُرسل رابط إعادة التعيين إلى ' + email);
  }catch(e){ toast('تعذر الإرسال: ' + e.code); }
}
