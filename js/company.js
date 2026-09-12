// بوابة الشركات
let company = null, myTrips = [], calCursor = new Date(), selDate = null;
let isEmployee = false, perms = null, editTripId = null, currentUser = null, myLink = '';

const FULL_PERMS = { qr:true, trips:true, cal:true, bookings:true };

const AR_ERR = {
  'auth/email-already-in-use':'هذا البريد مسجل مسبقًا',
  'auth/invalid-email':'البريد الإلكتروني غير صحيح',
  'auth/weak-password':'كلمة المرور ضعيفة (6 أحرف فأكثر)',
  'auth/user-not-found':'لا يوجد حساب بهذا البريد',
  'auth/wrong-password':'كلمة المرور غير صحيحة',
  'auth/invalid-credential':'بيانات الدخول غير صحيحة',
  'auth/too-many-requests':'محاولات كثيرة، حاول لاحقًا'
};
const aerr = e => AR_ERR[e.code] || 'حدث خطأ: ' + e.code;
function err(id,msg){ const el=qs(id); el.textContent=msg; el.classList.add('show'); }

/* ===== شريط سفلي ثابت + استعادة الجلسة بعد التحديث ===== */
const AUTH_SCREENS = ['s-loading','s-login','s-register','s-forgot','s-pending'];
// تُقرأ عند تحميل الصفحة قبل أن يغيّرها الدخول التلقائي
const SAVED_SCREEN = sessionStorage.getItem('coScreen');
const SAVED_DRAFT = sessionStorage.getItem('coDraft');
const NAVMAP = {'s-dash':0,'s-cal':1,'s-bookings':2,'s-emps':3,'s-settings':4};
function _syncNav(id){
  const nav = qs('dashNav'); if(!nav) return;
  nav.style.display = AUTH_SCREENS.includes(id) ? 'none' : 'flex';
  nav.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('on', NAVMAP[id]===i));
  sessionStorage.setItem('coScreen', id);
}
window._afterNav = _syncNav;
const _show0 = show;
show = function(id, push){ _show0(id, push); _syncNav(id); };

// حفظ البيانات المعبّأة قبل التحديث حتى لا تضيع
window.addEventListener('beforeunload', ()=>{
  const active = document.querySelector('.screen.active');
  if(!active) return;
  const vals = {};
  active.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{
    vals[el.id] = el.type==='checkbox' ? el.checked : el.value;
  });
  sessionStorage.setItem('coDraft', JSON.stringify({screen: active.id, values: vals}));
});

// استعادة البيانات المعبّأة في الصفحة المحفوظة
function _restoreCoDraft(id){
  try{
    const d = JSON.parse(SAVED_DRAFT||'null');
    if(d && d.screen===id){
      Object.entries(d.values).forEach(([k,v])=>{
        const el = qs(k); if(!el) return;
        if(el.type==='checkbox') el.checked = v; else el.value = v;
      });
    }
  }catch(e){}
}

// بعد تسجيل الدخول: ارجع لنفس الصفحة التي كنت عليها قبل التحديث
function restoreSession(){
  const saved = SAVED_SCREEN;
  if(!saved || saved==='s-dash' || AUTH_SCREENS.includes(saved)) return;
  if(isEmployee && (saved==='s-emps' || saved==='s-settings')) return;
  const needPerm = { 's-cal':'cal', 's-bookings':'bookings', 's-qr':'qr' };
  if(isEmployee && needPerm[saved] && !perms[needPerm[saved]]) return;
  const openers = { 's-cal':openCal, 's-bookings':openBookings, 's-emps':openEmps, 's-settings':openSettings, 's-qr':openQR };
  if(openers[saved]){ openers[saved](); _restoreCoDraft(saved); return; }
  if(saved==='s-addtrip'){
    show('s-addtrip');
    try{
      const draft = JSON.parse(SAVED_DRAFT||'null');
      if(draft && draft.screen==='s-addtrip'){
        Object.entries(draft.values).forEach(([id,v])=>{
          const el = qs(id); if(!el) return;
          if(el.type==='checkbox') el.checked = v; else el.value = v;
        });
      }
    }catch(e){}
  }
}

/* ===== المصادقة: مالك أو موظف ===== */
auth.onAuthStateChanged(async user => {
  if(!user){ currentUser=null; history.replaceState({s:'s-login'},''); _navStack=['s-login']; show('s-login', false); return; }
  currentUser = user;
  try{
    let snap = await db.collection('companies').where('ownerUid','==',user.uid).limit(1).get();
    if(!snap.empty){
      company = { id: snap.docs[0].id, ...snap.docs[0].data() };
      isEmployee = false; perms = FULL_PERMS;
    } else {
      const u = await myRole(user.uid);
      if(u && u.role==='employee' && u.companyId){
        const cDoc = await db.collection('companies').doc(u.companyId).get();
        if(cDoc.exists){
          company = { id: cDoc.id, ...cDoc.data() };
          isEmployee = true;
          perms = u.perms || FULL_PERMS;
        }
      }
    }
    if(!company){ show('s-login', false); return; }

    if(company.status === 'pending'){
      qs('pendIcon').textContent='⏳'; qs('pendTitle').textContent='حسابك قيد المراجعة';
      qs('pendMsg').innerHTML='تم استلام طلب تسجيل شركتك بنجاح.<br>سيتم تفعيل حسابك من إدارة المنصة قريبًا.';
      show('s-pending', false); return;
    }
    if(company.status === 'suspended'){
      qs('pendIcon').textContent='⛔'; qs('pendTitle').textContent='الحساب موقوف';
      qs('pendMsg').innerHTML='تم إيقاف حساب شركتك من الإدارة.'
        + (company.suspensionReason ? '<br><b>السبب:</b> '+esc(company.suspensionReason) : '')
        + '<br>تواصل مع الدعم لإعادة التفعيل.';
      show('s-pending', false);
      // بوب أب ثابت — لا يختفي حتى يضغط صاحب الشركة "حسنًا"
      setTimeout(()=> infoBox({ icon:'⛔', title:'الحساب موقوف',
        msg: 'تم إيقاف حساب شركتك من الإدارة.'
          + (company.suspensionReason ? '<br><b>السبب:</b> '+esc(company.suspensionReason) : '')
          + '<br>تواصل مع الدعم لإعادة التفعيل.', ok:'حسنًا' }), 400);
      return;
    }
    if(!companyValid(company)){
      qs('pendIcon').textContent='⌛'; qs('pendTitle').textContent='انتهت الفترة التجريبية / الاشتراك';
      qs('pendMsg').innerHTML='لتجديد الاشتراك ومواصلة استقبال الحجوزات، تواصل مع إدارة المنصة.';
      show('s-pending', false); return;
    }
    await enterDashboard();
    restoreSession();
  }catch(e){ console.error(e); toast('خطأ: ' + (e.message||e.code||e)); show('s-login', false); }
});

async function doLogin(){
  const email=qs('lEmail').value.trim(), pass=qs('lPass').value;
  if(!email||!pass){ err('loginErr','أدخل البريد وكلمة المرور'); return; }
  try{ await auth.signInWithEmailAndPassword(email,pass); }
  catch(e){ err('loginErr', aerr(e)); }
}

async function doRegister(){
  const name=qs('rName').value.trim(), email=qs('rEmail').value.trim(),
        wa=qs('rWa').value.trim(), pass=qs('rPass').value, desc=qs('rDesc').value.trim();
  if(!name||!email||!wa||!pass){ err('regErr','يرجى تعبئة جميع الحقول المطلوبة'); return; }
  if(!/^\d{8,15}$/.test(wa.replace(/\D/g,''))){ err('regErr','رقم الواتساب غير صحيح'); return; }
  const btn=qs('regBtn'); btn.disabled=true; btn.textContent='جارِ إنشاء الحساب...';
  try{
    const slug = slugify(name);
    const dup = await db.collection('companies').where('slug','==',slug).get();
    const finalSlug = dup.empty ? slug : slug + '-' + Math.random().toString(36).slice(2,6);

    const cred = await auth.createUserWithEmailAndPassword(email,pass);
    await cred.user.sendEmailVerification();

    const trialEnd = new Date(Date.now() + 7*86400000);
    const cRef = await db.collection('companies').add({
      name, email, whatsapp: wa, desc, slug: finalSlug,
      ownerUid: cred.user.uid, status: 'pending',
      transferPhone: '', logoUrl: '', coverUrl: '', buses: [],
      paymentMethods: { cash:true, visa:false, transfer:false },
      trialEndsAt: firebase.firestore.Timestamp.fromDate(trialEnd),
      subscriptionEnd: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(cred.user.uid).set({
      role:'company', companyId: cRef.id, name, email, whatsapp: wa
    });
    toast('تم إرسال إيميل التفعيل إلى بريدك ✔');
    show('s-pending');
  }catch(e){ err('regErr', aerr(e)); }
  btn.disabled=false; btn.textContent='إنشاء الحساب';
}

async function doForgot(){
  const email=qs('fgEmail').value.trim();
  if(!email){ err('fgErr','أدخل بريدك الإلكتروني'); return; }
  try{
    await auth.sendPasswordResetEmail(email);
    toast('تم إرسال رابط الاستعادة إلى بريدك'); show('s-login');
  }catch(e){ err('fgErr', aerr(e)); }
}

/* ===== لوحة التحكم ===== */
async function enterDashboard(){
  history.replaceState({s:'s-dash'},''); _navStack=['s-dash'];

  // الغلاف والشعار
  if(company.coverUrl) qs('coCover').style.backgroundImage = `url('${company.coverUrl}')`;
  qs('coLogo').innerHTML = company.logoUrl
    ? `<img src="${company.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:19px">` : '🚌';
  qs('dName').textContent = company.name;
  qs('dCr').textContent = company.crNumber ? ('سجل تجاري: ' + company.crNumber) : '';
  // يظهر إيميل الحساب المسجّل دخوله فعليًا (مالك أو موظف)
  qs('dEmail').textContent = (currentUser?.email || company.email) + (isEmployee ? ' — موظف' : '');

  // إعلان الإدارة: يظهر مرة واحدة عند تسجيل الدخول — تحديث الصفحة لا يعيده
  if(company.announcement?.active && company.announcement?.text){
    const annKey = 'ann:'+company.id+':'+company.announcement.text.length+':'+company.announcement.text.slice(0,12);
    if(!sessionStorage.getItem(annKey)){
      sessionStorage.setItem(annKey,'1');
      setTimeout(()=> infoBox({ icon:'📢', title:'تنبيه من إدارة المنصة', msg: esc(company.announcement.text), ok:'حسنًا' }), 600);
    }
  }

  // تنبيه الاشتراك: يظهر فقط عند بقاء 7 أيام أو أقل
  const dl = daysLeft(company);
  qs('trialNote').innerHTML = (dl!==null && dl<=7)
    ? `<div class="notice" style="margin-bottom:14px">${company.subscriptionEnd?.seconds?'ينتهي اشتراكك':'تنتهي فترتك التجريبية'} خلال <b>${dl}</b> يوم — جدّد الآن لتجنب التوقف</div>` : '';

  // واجهة الموظف حسب الصلاحيات
  qs('dashStats').style.display = isEmployee ? 'none' : '';
  qs('ownerActions').style.display = isEmployee ? 'none' : '';
  qs('calAddBtn').style.display = isEmployee ? 'none' : '';
  qs('dashNav').querySelectorAll('[data-owner]').forEach(b=> b.style.display = isEmployee ? 'none' : '');
  qs('dashNav').querySelectorAll('[data-perm]').forEach(b=>{
    b.style.display = (isEmployee && !perms[b.dataset.perm]) ? 'none' : '';
  });

  await purgeExpiredTrips();

  const [t,b,e] = await Promise.all([
    db.collection('trips').where('companyId','==',company.id).get(),
    db.collection('bookings').where('companyId','==',company.id).get(),
    db.collection('employees').where('companyId','==',company.id).get()
  ]);
  myTrips = t.docs.map(d=>({id:d.id,...d.data()}));
  const bookings = b.docs.map(d=>d.data());
  qs('stTrips').textContent = myTrips.length;
  qs('stBookings').textContent = bookings.length;
  qs('stEmps').textContent = e.size;
  qs('stRevenue').textContent = bookings.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+(x.price||0)*(x.seats||1),0).toLocaleString();
  renderUpcoming();
  show('s-dash', false);
}

function renderUpcoming(){
  const today = new Date().toISOString().slice(0,10);
  // الرحلات الموقوفة تبقى ظاهرة مع شارة حمراء "موقوفة"
  const upcoming = myTrips.filter(x=>x.recurring || x.date>=today)
    .sort((a,b)=> (b.active-a.active) || (a.date+a.time).localeCompare(b.date+b.time)).slice(0,5);
  qs('dashTrips').innerHTML = upcoming.length ? upcoming.map(tripRow).join('')
    : '<div class="empty">لا توجد رحلات بعد — أضف أول رحلة</div>';
}

async function purgeExpiredTrips(){
  const today = new Date().toISOString().slice(0,10);
  const snap = await db.collection('trips').where('companyId','==',company.id).get();
  const batch = db.batch();
  let dirty = false;
  for(const d of snap.docs){
    const t = d.data();
    if(!t.recurring && t.date && t.date < today){
      batch.delete(d.ref); dirty = true;
      const bs = await db.collection('bookings').where('tripId','==',d.id).get();
      bs.docs.forEach(x=>batch.delete(x.ref));
    }
    // الرحلة اليومية: مقاعدها ترجع كاملة كل يوم جديد
    if(t.recurring && t.lastReset !== today){
      batch.update(d.ref, { booked: 0, lastReset: today, currentStop: -1 }); dirty = true;
    }
  }
  if(dirty) await batch.commit();
}

const TYPE_ICON = { 'جامعات وكليات':'🎓', 'حج وعمرة':'🕋', 'رحلة يومية':'🚌' };
const icon = t => TYPE_ICON[t] || '🚌';

function tripRow(x){
  const left = (x.seats||0)-(x.booked||0);
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <h3 style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">${icon(x.type)} ${esc(x.name)}</h3>
      <span class="badge ${x.active?'b-green':'b-red'}" style="flex-shrink:0">${x.active?'متاحة':'موقوفة'}</span>
    </div>
    <div class="meta" style="margin-top:8px">📅 ${x.recurring?'يوميًا':esc(x.date)} • 🕖 ${esc(x.time)}</div>
    <div class="meta">${x.busNumber?'🚌 '+esc(x.busNumber)+' • ':''}💺 متبقي ${left}/${x.seats}</div>
    ${isEmployee ? '' : `<div class="bk-actions">
      <button class="icon-btn" style="background:var(--teal-l);color:var(--teal)" onclick="openEditTrip('${x.id}')">✏️ تعديل</button>
      <button class="icon-btn" style="background:#f7ecd4;color:#8a6d1a" onclick="toggleTrip('${x.id}',${!x.active})">${x.active?'⏸️ إيقاف':'▶️ تفعيل'}</button>
      <button class="icon-btn" style="background:#fdeaea;color:var(--red)" onclick="delTrip('${x.id}')">🗑️ حذف</button>
      <button class="icon-btn" style="background:#e0f2fe;color:#0369a1" onclick="shareTripCo('${x.id}')">📤 مشاركة</button>
    </div>`}
    <div class="bk-actions" style="margin-top:8px">
      <button class="icon-btn" style="background:#e0f2fe;color:#0369a1;flex:1" onclick="openTracker('${x.id}')">📍 ${x.currentStop==null||x.currentStop<0?'لم تنطلق — حدّد الموقع':'الحافلة الآن في: '+esc(tripStops(x)[x.currentStop]||'')}</button>
    </div>
  </div>`;
}

function tripStops(x){ return (x.routeGo&&x.routeGo.length)?x.routeGo:[x.from,x.to].filter(Boolean); }

/* تتبع الرحلة: الشركة/الموظف يحددان موقع الحافلة ويظهر للعميل مباشرة */
function openTracker(id){
  const x = myTrips.find(t=>t.id===id); if(!x) return;
  const stops = tripStops(x), cur = (x.currentStop==null)?-1:x.currentStop;
  closeModal();
  const m = document.createElement('div');
  m.className = 'mback';
  m.innerHTML = `<div class="modal">
    <div class="m-ic">📍</div>
    <h3>تتبع الرحلة</h3>
    <p>${esc(x.name)} — أين وصلت الحافلة الآن؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin:12px 0">
      <button class="btn ${cur===-1?'btn-primary':'btn-ghost'}" data-i="-1">🚏 لم تنطلق بعد</button>
      ${stops.map((s2,i)=>`<button class="btn ${cur===i?'btn-primary':'btn-ghost'}" data-i="${i}">${i===stops.length-1?'🏁':'🟢'} ${esc(s2)}</button>`).join('')}
    </div>
    ${!isEmployee && stops.length>=2 ? `<iframe src="${'https://maps.google.com/maps?saddr='+encodeURIComponent(stops[0]+'، عمان')+'&daddr='+stops.slice(1).map(s3=>encodeURIComponent(s3+'، عمان')).join('+to:')+'&hl=ar&output=embed'}" style="width:100%;height:210px;border:0;border-radius:12px;margin-bottom:10px" loading="lazy"></iframe>` : ''}
    <button class="btn btn-ghost" id="mNo">إغلاق</button>
  </div>`;
  document.body.appendChild(m);
  m.querySelector('#mNo').onclick = closeModal;
  m.onclick = e=>{ if(e.target===m) closeModal(); };
  m.querySelectorAll('[data-i]').forEach(b=> b.onclick = async ()=>{
    const idx = +b.dataset.i;
    closeModal();
    try{
      await db.collection('trips').doc(id).update({ currentStop: idx });
      x.currentStop = idx;
      renderDay(); renderUpcoming();
    }catch(e){ console.error(e); }
  });
}

/* ===== الرحلات: إضافة وتعديل ===== */
function fillBusList(){
  qs('busList').innerHTML = (company.buses||[]).map(b=>`<option value="${esc(b)}">`).join('');
}

function openAddTrip(){
  editTripId = null;
  qs('tripFormTitle').textContent = 'إضافة رحلة';
  qs('tripErr').classList.remove('show');
  ['tName','tFrom','tTo','tBus','tDate','tTime','tSeats','tPrice'].forEach(i=>qs(i).value='');
  ['go1','go2','go3','go4','go5','back1','back2','back3','back4','back5'].forEach(i=>qs(i).value='');
  ['gt1','gt2','gt3','gt4','gt5','bt1','bt2','bt3','bt4','bt5'].forEach(i=>qs(i).value='');
  qs('tRecurring').checked = false;
  fillBusList();
  show('s-addtrip');
}

function openEditTrip(id){
  const x = myTrips.find(t=>t.id===id); if(!x) return;
  editTripId = id;
  qs('tripFormTitle').textContent = 'تعديل الرحلة';
  qs('tripErr').classList.remove('show');
  qs('tName').value=x.name||''; qs('tFrom').value=x.from||''; qs('tTo').value=x.to||'';
  qs('tBus').value=x.busNumber||''; qs('tType').value=x.type||'جامعات وكليات';
  qs('tDate').value=x.date||''; qs('tTime').value=x.time||'';
  qs('tSeats').value=x.seats||''; qs('tPrice').value=x.price??'';
  qs('tRecurring').checked=!!x.recurring;
  for(let i=1;i<=5;i++){
    qs('go'+i).value = (x.routeGo||[])[i-1]||'';
    qs('back'+i).value = (x.routeBack||[])[i-1]||'';
    qs('gt'+i).value = (x.routeGoTimes||[])[i-1]||'';
    qs('bt'+i).value = (x.routeBackTimes||[])[i-1]||'';
  }
  fillBusList();
  show('s-addtrip');
}

async function saveTrip(){
  const name=qs('tName').value.trim(), from=qs('tFrom').value.trim(), to=qs('tTo').value.trim(),
        bus=qs('tBus').value.trim(),
        type=qs('tType').value, date=qs('tDate').value, time=qs('tTime').value,
        seats=+qs('tSeats').value, price=+qs('tPrice').value, recurring=qs('tRecurring').checked;
  const _rg = [1,2,3,4,5].map(i=>({s:qs('go'+i).value.trim(), t:qs('gt'+i).value})).filter(x=>x.s);
  const _rb = [1,2,3,4,5].map(i=>({s:qs('back'+i).value.trim(), t:qs('bt'+i).value})).filter(x=>x.s);
  const routeGo = _rg.map(x=>x.s), routeGoTimes = _rg.map(x=>x.t||'');
  const routeBack = _rb.map(x=>x.s), routeBackTimes = _rb.map(x=>x.t||'');
  if(!name||!from||!to||!bus||!date||!time||!seats||isNaN(price)){
    err('tripErr','يرجى تعبئة جميع الحقول المطلوبة'); return; }
  const btn=qs('tripBtn'); btn.disabled=true; btn.textContent='جارِ الحفظ...';
  try{
    // حفظ رقم الحافلة في قائمة الشركة لاستخدامه لاحقًا
    const buses = company.buses||[];
    if(bus && !buses.includes(bus)){
      buses.push(bus);
      await db.collection('companies').doc(company.id).update({buses});
      company.buses = buses;
    }
    if(editTripId){
      await db.collection('trips').doc(editTripId).update({
        name, from, to, busNumber: bus, type, date, time, seats, price, recurring, routeGo, routeBack, routeGoTimes, routeBackTimes });
      toast('تم تعديل الرحلة ✔');
    } else {
      await db.collection('trips').add({
        companyId: company.id, name, from, to, busNumber: bus, type, date, time,
        seats, price, recurring, routeGo, routeBack, routeGoTimes, routeBackTimes, booked: 0, active: true, lastReset: new Date().toISOString().slice(0,10),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('تمت إضافة الرحلة ✔');
    }
    await refreshTrips();
    qs('stTrips').textContent = myTrips.length;
    renderUpcoming();
    sessionStorage.removeItem('coDraft');
    openCal();
  }catch(e){ console.error(e); err('tripErr','تعذر الحفظ — حاول مجددًا'); }
  btn.disabled=false; btn.textContent='حفظ الرحلة';
}

async function refreshTrips(){
  const t = await db.collection('trips').where('companyId','==',company.id).get();
  myTrips = t.docs.map(d=>({id:d.id,...d.data()}));
}

async function toggleTrip(id, val){
  await db.collection('trips').doc(id).update({active: val});
  toast(val?'تم تفعيل الرحلة':'تم إيقاف الرحلة');
  await refreshTrips(); renderDay(); renderUpcoming(); qs('stTrips').textContent = myTrips.length;
}

function delTrip(id){
  confirmBox({ icon:'🗑️', title:'حذف الرحلة', msg:'سيتم حذف الرحلة نهائيًا ولا يمكن التراجع.', ok:'نعم، حذف', danger:true },
  async ()=>{
    await db.collection('trips').doc(id).delete();
    toast('تم حذف الرحلة');
    await refreshTrips(); renderDay(); renderUpcoming(); qs('stTrips').textContent = myTrips.length;
  });
}

/* ===== الكالندر ===== */
const AR_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const AR_DAYS=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];

function openCal(){ if(!selDate) selDate = new Date().toISOString().slice(0,10); renderCal(); show('s-cal'); }
function shiftMonth(n){ calCursor.setMonth(calCursor.getMonth()+n); renderCal(); }

function renderCal(){
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  qs('calTitle').textContent = AR_MONTHS[m] + ' ' + y;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m+1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const tripDates = new Set(myTrips.map(t=>t.date));
  let html = AR_DAYS.map(d=>`<div class="h">${d}</div>`).join('');
  for(let i=0;i<first;i++) html += '<div class="d off"></div>';
  for(let d=1; d<=days; d++){
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['d', ds===todayStr?'today':'', tripDates.has(ds)?'has':'', ds===selDate?'sel':''].join(' ');
    html += `<button class="${cls}" onclick="pickDate('${ds}')">${d}</button>`;
  }
  qs('calGrid').innerHTML = html;
  renderDay();
}

function pickDate(ds){ selDate = ds; renderCal(); }

function renderDay(){
  const list = myTrips.filter(t => t.recurring || t.date === selDate);
  qs('dayTitle').textContent = selDate ? 'رحلات ' + fmtDate(new Date(selDate+'T00:00')) : 'الرحلات';
  qs('dayTrips').innerHTML = list.length ? list.map(tripRow).join('')
    : '<div class="empty">لا توجد رحلات في هذا اليوم</div>';
}

/* ===== الحجوزات الواردة + مراسلة واتساب ===== */
const PAY_LABEL = { cash:'💵 كاش', visa:'💳 فيزا', transfer:'🏦 تحويل' };

function waMessage(b){
  const pm = (PAY_LABEL[b.paymentMethod]||'').replace(/[^\u0600-\u06FF\w\s]/g,'').trim();
  const cashNote = b.paymentMethod==='cash' ? ' (يُدفع عند الصعود في الحافلة)' : '';
  const board = b.boardingStop ? ('محطة الصعود: ' + b.boardingStop + '\n') : '';
  const callLine = company.contactCall ? ('\nاتصال مباشر: ' + company.contactCall) : '';
  return encodeURIComponent(
'تفاصيل حجزك\n'
+ company.name + '\n'
+ '-------------------------\n'
+ 'المسافر: ' + b.name + '\n'
+ 'الرحلة: ' + b.tripName + '\n'
+ board
+ 'التاريخ: ' + b.date + '\n'
+ 'وقت الانطلاق: ' + b.time + '\n'
+ 'عدد المقاعد: ' + b.seats + '\n'
+ 'رقم التذكرة: ' + b.code + '\n'
+ 'طريقة الدفع: ' + pm + cashNote + '\n'
+ '-------------------------\n'
+ 'تواصل معنا واتساب: ' + (company.whatsapp||'') + callLine + '\n'
+ 'حجوزاتك ورحلاتنا:\n' + companyLink(company.slug) + '\n'
+ '-------------------------\n'
+ 'نتشرف بخدمتك');
}
/* رسالة واتساب جاهزة لإشعار العميل بالإلغاء */
function waCancelMessage(b){
  return encodeURIComponent(
'إشعار إلغاء حجز\n'
+ company.name + '\n'
+ '-------------------------\n'
+ 'عزيزنا ' + b.name + '\n'
+ 'نعتذر منك بكل صدق، تم إلغاء حجزك في الرحلة التالية:\n'
+ '-------------------------\n'
+ 'الرحلة: ' + b.tripName + '\n'
+ 'التاريخ: ' + b.date + '\n'
+ 'الوقت: ' + b.time + '\n'
+ 'المقاعد: ' + b.seats + '\n'
+ 'رقم التذكرة: ' + b.code + '\n'
+ 'سبب الإلغاء: ' + (b.cancelReason||'—') + '\n'
+ '-------------------------\n'
+ 'نسعد بخدمتك في رحلة قادمة\n'
+ 'احجز رحلة أخرى بسهولة من هنا:\n' + companyLink(company.slug) + '\n'
+ '-------------------------\n'
+ 'شاكرين تفهمك وتعاونك');
}
/* 4) تصدير الحجوزات إلى Excel (CSV يدعم العربية) */
async function exportBookings(){
  const rows = window._bkRows || [];
  if(!rows.length){ toast('لا توجد حجوزات للتصدير'); return; }
  const stMap = { confirmed:'مؤكد ✔', cancelled:'ملغي ⛔', pending_payment:'بانتظار الدفع ⏳' };
  const pmMap = { cash:'كاش 💵', visa:'فيزا 💳', transfer:'تحويل 🏦' };
  const stColor = { confirmed:'FFD9EDD9', cancelled:'FFF9DDDD', pending_payment:'FFFBF0D9' };
  if(typeof ExcelJS === 'undefined'){ toast('مكتبة Excel لم تُحمّل — تحقق من الإنترنت'); return; }
  try{
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الحجوزات', { views:[{ rightToLeft:true }] });
    ws.columns = [
      { width:6 },{ width:20 },{ width:16 },{ width:24 },{ width:13 },{ width:9 },
      { width:9 },{ width:16 },{ width:14 },{ width:18 },{ width:13 }
    ];
    // صف العنوان
    ws.mergeCells('A1:K1');
    const t = ws.getCell('A1');
    t.value = '🎫 حجوزات ' + (company.name||'') + ' — ' + new Date().toLocaleDateString('ar-OM');
    t.font = { bold:true, size:14, color:{argb:'FFFFFFFF'} };
    t.alignment = { horizontal:'center', vertical:'middle' };
    t.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0D2440'} };
    ws.getRow(1).height = 30;
    // صف الترويسة
    const heads = ['#','الاسم','الواتساب','الرحلة','التاريخ','الوقت','مقاعد','محطة الصعود','طريقة الدفع','الحالة','رقم التذكرة'];
    const hr = ws.addRow(heads);
    hr.height = 24;
    hr.eachCell(c=>{
      c.font = { bold:true, color:{argb:'FFFFFFFF'} };
      c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0E7C7B'} };
      c.alignment = { horizontal:'center', vertical:'middle' };
      c.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });
    // صفوف البيانات
    rows.forEach((b,i)=>{
      const r = ws.addRow([ i+1, b.name, b.whatsapp, b.tripName, b.date, b.time, b.seats,
        b.boardingStop||'—', pmMap[b.paymentMethod]||b.paymentMethod||'—', stMap[b.status]||b.status||'—', b.code ]);
      const bg = stColor[b.status] || (i%2 ? 'FFF4F7FB' : 'FFFFFFFF');
      r.eachCell(c=>{
        c.alignment = { horizontal:'center', vertical:'middle' };
        c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:bg} };
        c.border = { top:{style:'thin',color:{argb:'FFD5DEE8'}}, bottom:{style:'thin',color:{argb:'FFD5DEE8'}}, left:{style:'thin',color:{argb:'FFD5DEE8'}}, right:{style:'thin',color:{argb:'FFD5DEE8'}} };
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    a.download = 'حجوزات-' + (company.name||'الشركة') + '.xlsx';
    a.click();
    toast('تم تصدير ' + rows.length + ' حجز 📊');
  }catch(e){ console.error(e); toast('تعذر التصدير، حاول مجددًا'); }
}
/* 7) مشاركة الرحلة برابط مباشر يفتحها للعميل */
function shareTripCo(id){
  const t = myTrips.find(x=>x.id===id); if(!t) return;
  const url = companyLink(company.slug) + '&trip=' + id;
  const stops = (t.routeGo&&t.routeGo.length) ? ('المسار: ' + t.routeGo.join(' - ') + '\n') : '';
  window.open('https://wa.me/?text=' + encodeURIComponent(
'رحلة متاحة للحجز\n'
+ company.name + '\n'
+ '-------------------------\n'
+ 'الرحلة: ' + t.name + '\n'
+ 'من: ' + t.from + '  إلى: ' + t.to + '\n'
+ stops
+ 'التاريخ: ' + (t.recurring?'رحلة يومية':t.date) + '\n'
+ 'وقت الانطلاق: ' + t.time + '\n'
+ 'المقاعد المتاحة: ' + ((t.seats||0)-(t.booked||0)) + ' مقعد\n'
+ 'السعر: ' + t.price + ' ر.ع\n'
+ '-------------------------\n'
+ 'احجز مقعدك الآن بضغطة زر:\n' + url + '\n'
+ '-------------------------\n'
+ 'نتشرف بخدمتكم'), '_blank');
}
async function openBookings(){
  show('s-bookings');
  qs('bookingsList').innerHTML = '<div class="empty"><span class="spin"></span> جارِ التحميل...</div>';
  // تحديث لحظي: أي تغيير يظهر فورًا بدون تحديث الصفحة
  db.collection('bookings').where('companyId','==',company.id)
    .onSnapshot(snap=>{
      const rows = snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      window._bkRows = rows;
      qs('bookingsList').innerHTML = rows.length ? rows.map(b=>`
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="ava" style="width:44px;height:44px;border-radius:14px;background:var(--teal-l);color:var(--teal);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:900;flex-shrink:0">${esc(b.name).charAt(0)}</div>
            <div style="flex:1;min-width:0">
              <h4 style="font-weight:800">${esc(b.name)} <span class="badge b-teal">💺 ${b.seats}</span></h4>
              <p class="meta" style="margin-top:4px">🚌 ${esc(b.tripName)}</p>
              <p class="meta">📅 ${esc(b.date)} • 🕖 ${esc(b.time)}</p>
              ${b.boardingStop ? `<p class="meta">🚏 صعود: ${esc(b.boardingStop)}</p>` : ''}
              <p class="meta" dir="ltr" style="text-align:right">📱 ${esc(b.whatsapp)} • 🔖 ${esc(b.code)}</p>
              <p style="font-size:12.5px;margin-top:4px">${PAY_LABEL[b.paymentMethod]||''}
                ${b.status==='confirmed' ? '<span class="badge b-green">مؤكد ✔</span>'
                  : b.status==='cancelled' ? '<span class="badge b-red">ملغي ⛔</span>'
                  : '<span class="badge b-gold">بانتظار تأكيد الدفع</span>'}
              </p>
              ${b.status==='cancelled' ? `<p style="font-size:12px;color:var(--red)">سبب الإلغاء: ${esc(b.cancelReason||'')}</p>` : ''}
            </div>
          </div>
          <div class="bk-actions">
            <button class="icon-btn" style="background:#dff3e9;color:var(--green)" onclick="window.open('${waLink(b.whatsapp)}?text=${waMessage(b)}','_blank')">💬 واتساب</button>
            ${b.status!=='confirmed' && b.status!=='cancelled' ? `<button class="icon-btn" style="background:var(--teal-l);color:var(--teal)" onclick="confirmPay('${b.id}')">✔️ تأكيد الدفع</button>` : ''}
            ${b.receiptUrl ? `<a class="icon-btn" style="background:#e8ecf8;color:var(--navy2);text-decoration:none;display:flex;align-items:center;justify-content:center" href="${b.receiptUrl}" target="_blank">📎 الوصل</a>` : ''}
            ${b.status!=='cancelled' ? `<button class="icon-btn" style="background:#fdeaea;color:var(--red)" onclick="cancelBooking('${b.id}','${b.tripId}',${b.seats})">✖️ إلغاء</button>` : `<button class="icon-btn" style="background:#f7ecd4;color:#8a6d1a" onclick="window.open('${waLink(b.whatsapp)}?text=${waCancelMessage(b)}','_blank')">📩 إشعار العميل</button>`}
          </div>
        </div>`).join('') : '<div class="empty">لا توجد حجوزات واردة بعد</div>';
    }, e=>{
      console.error(e);
      qs('bookingsList').innerHTML = '<div class="empty">تعذر تحميل الحجوزات — حدّث الصفحة</div>';
    });
}

async function confirmPay(id){
  await db.collection('bookings').doc(id).update({ status:'confirmed', paymentStatus:'confirmed' });
  toast('تم تأكيد الدفع ✔'); // القائمة تتحدث لحظيًا تلقائيًا
}

function cancelBooking(id, tripId, seats){
  promptBox({ icon:'✖️', title:'إلغاء الحجز', msg:'اكتب سبب الإلغاء — سيظهر للعميل في صفحة حجوزاته، وستُرجع المقاعد للرحلة فورًا.', placeholder:'مثال: تغيير موعد الرحلة، ظرف طارئ...', ok:'تأكيد الإلغاء', danger:true },
  async (reason)=>{
    try{
      await db.collection('bookings').doc(id).update({
        status:'cancelled', cancelReason: reason || 'بدون سبب محدد',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp() });
      // استرجاع المقاعد خطوة مستقلة — لا يفشل الإلغاء لو الرحلة حُذفت
      if(tripId && tripId!=='undefined' && seats>0){
        try{
          await db.collection('trips').doc(tripId).update({
            booked: firebase.firestore.FieldValue.increment(-seats) });
        }catch(e2){ console.warn('استرجاع المقاعد:', e2); }
      }
      toast('تم إلغاء الحجز ✔'); // القائمة تتحدث لحظيًا
    }catch(e){ console.error(e); toast('تعذر الإلغاء: ' + (e.code||e.message)); }
  });
}

/* ===== الموظفون: إضافة + تعديل + صلاحيات ===== */
function readPerms(){
  return { qr:qs('pQr').checked, trips:qs('pTrips').checked,
           cal:qs('pCal').checked, bookings:qs('pBookings').checked };
}
function resetEmpForm(){
  qs('eId').value=''; qs('empFormTitle').textContent='إضافة موظف';
  qs('empBtn').textContent='＋ إضافة'; qs('empCancelBtn').style.display='none';
  qs('eEmailWrap').style.display=''; qs('ePassWrap').style.display='';
  qs('eName').value=qs('eEmail').value=qs('eWa').value=qs('ePass').value='';
  ['pQr','pTrips','pCal','pBookings'].forEach(i=>qs(i).checked=true);
  qs('empErr').classList.remove('show');
}

async function openEmps(){
  show('s-emps'); resetEmpForm();
  const snap = await db.collection('employees').where('companyId','==',company.id).get();
  qs('empsList').innerHTML = snap.empty ? '<div class="empty">لا يوجد موظفون بعد</div>'
    : snap.docs.map(d=>{ const e=d.data(); return `
    <div class="lrow" style="flex-direction:column;align-items:stretch;${e.active?'':'opacity:.55'}">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="ava">${esc(e.name).charAt(0)}</div>
        <div class="grow">
          <h4>${esc(e.name)}</h4>
          <p style="font-size:12px">${e.active?'🟢 نشط':'🔴 موقوف'}</p>
        </div>
      </div>
      <p dir="ltr" style="text-align:right;font-size:12.5px;color:var(--muted);margin-top:8px">${esc(e.email)}</p>
      <p dir="ltr" style="text-align:right;font-size:12.5px;color:var(--muted)">📱 ${esc(e.whatsapp||'—')}</p>
      <div class="bk-actions">
        <button class="icon-btn" style="background:var(--teal-l);color:var(--teal)" onclick='editEmp("${d.id}", ${JSON.stringify(e).replace(/'/g,"&#39;")})'>✏️ تعديل</button>
        <button class="icon-btn" style="background:#e8ecf8;color:var(--navy2)" onclick="empResetPass('${esc(e.email)}')">🔑 كلمة المرور</button>
        <button class="icon-btn" style="background:#f7ecd4;color:#8a6d1a" onclick="toggleEmp('${d.id}',${!e.active})">${e.active?'⏸️ إيقاف':'▶️ تفعيل'}</button>
        <button class="icon-btn" style="background:#fdeaea;color:var(--red)" onclick="delEmp('${d.id}')">🗑️ حذف</button>
      </div>
    </div>`; }).join('');
}

function editEmp(id, e){
  qs('eId').value=id; qs('empFormTitle').textContent='تعديل الموظف';
  qs('empBtn').textContent='حفظ التعديل'; qs('empCancelBtn').style.display='';
  qs('eEmailWrap').style.display='none'; qs('ePassWrap').style.display='none';
  qs('eName').value=e.name||''; qs('eWa').value=e.whatsapp||'';
  const p = e.perms || FULL_PERMS;
  qs('pQr').checked=!!p.qr; qs('pTrips').checked=!!p.trips;
  qs('pCal').checked=!!p.cal; qs('pBookings').checked=!!p.bookings;
  window.scrollTo(0,0);
}

async function saveEmployee(){
  const id = qs('eId').value;
  const name=qs('eName').value.trim(), wa=qs('eWa').value.trim();
  const p = readPerms();
  if(!name||!wa){ err('empErr','يرجى تعبئة الاسم ورقم الواتساب'); return; }
  const btn=qs('empBtn'); btn.disabled=true; btn.textContent='جارِ الحفظ...';
  try{
    if(id){
      // تعديل موظف موجود
      const doc = await db.collection('employees').doc(id).get();
      const emp = doc.data();
      await db.collection('employees').doc(id).update({ name, whatsapp: wa, perms: p });
      if(emp.uid) await db.collection('users').doc(emp.uid).update({ name, whatsapp: wa, perms: p });
      toast('تم تعديل الموظف ✔');
    } else {
      // إضافة موظف جديد
      const email=qs('eEmail').value.trim(), pass=qs('ePass').value;
      if(!email||!pass){ err('empErr','أدخل البريد وكلمة المرور'); btn.disabled=false; btn.textContent='＋ إضافة'; return; }
      const sec = firebase.initializeApp(firebaseConfig, 'sec' + Date.now());
      const cred = await sec.auth().createUserWithEmailAndPassword(email, pass);
      await sec.firestore().collection('users').doc(cred.user.uid).set({
        role:'employee', companyId: company.id, name, email, whatsapp: wa, perms: p });
      await sec.auth().signOut(); await sec.delete();
      await db.collection('employees').add({
        companyId: company.id, uid: cred.user.uid, name, email, whatsapp: wa,
        perms: p, active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('تمت إضافة الموظف ✔');
    }
    openEmps();
  }catch(e){ console.error(e); err('empErr', aerr(e)); }
  btn.disabled=false; btn.textContent = qs('eId').value ? 'حفظ التعديل' : '＋ إضافة';
}

async function empResetPass(email){
  try{
    await auth.sendPasswordResetEmail(email);
    toast('أُرسل رابط إعادة التعيين إلى ' + email);
  }catch(e){ toast('تعذر الإرسال: ' + e.code); }
}

async function toggleEmp(id, val){
  await db.collection('employees').doc(id).update({active: val});
  toast(val?'تم تفعيل الموظف':'تم إيقاف الموظف'); openEmps();
}

async function delEmp(id){
  confirmBox({ icon:'🗑️', title:'حذف الموظف', msg:'سيتم حذف هذا الموظف نهائيًا ولن يستطيع الدخول للوحة.', ok:'نعم، حذف', danger:true },
  async ()=>{
    await db.collection('employees').doc(id).delete();
    toast('تم حذف الموظف'); openEmps();
  });
}

/* ===== الإعدادات ===== */
function openSettings(){
  qs('sName').value = company.name || '';
  qs('sCr').value = company.crNumber || '';
  qs('sDesc').value = company.desc || '';
  qs('sTransfer').value = company.transferPhone || '';
  qs('sBankName').value = company.bankName || '';
  qs('sCall').value = company.contactCall || '';
  qs('sInsta').value = company.instagram || '';
  const pm = company.paymentMethods || {};
  qs('pmCash').checked = !!pm.cash;
  qs('pmVisa').checked = !!pm.visa;
  qs('pmTransfer').checked = !!pm.transfer;
  qs('sLogo').value = ''; qs('sCover').value = '';
  show('s-settings');
}

async function deleteOldImage(url){
  if(!url) return;
  try{ await firebase.storage().refFromURL(url).delete(); }catch(e){ /* قد تكون محذوفة */ }
}

async function uploadImage(fileInput, kind){
  const file = qs(fileInput).files[0];
  if(!file) return null;
  const snap = await firebase.storage().ref(`branding/${company.id}/${kind}-${Date.now()}.jpg`).put(file);
  return await snap.ref.getDownloadURL();
}

async function saveSettings(){
  const btn = qs('setBtn'); btn.disabled=true; btn.textContent='جارِ الحفظ...';
  try{
    const data = {
      name: qs('sName').value.trim() || company.name,
      crNumber: qs('sCr').value.trim(),
      desc: qs('sDesc').value.trim(),
      transferPhone: qs('sTransfer').value.trim(),
      bankName: qs('sBankName').value.trim(),
      contactCall: qs('sCall').value.trim(),
      instagram: qs('sInsta').value.trim(),
      paymentMethods: {
        cash: qs('pmCash').checked,
        visa: qs('pmVisa').checked,
        transfer: qs('pmTransfer').checked
      }
    };
    const logoUrl = await uploadImage('sLogo','logo');
    const coverUrl = await uploadImage('sCover','cover');
    if(logoUrl){ data.logoUrl = logoUrl; await deleteOldImage(company.logoUrl); } // حذف القديمة من Storage
    if(coverUrl){ data.coverUrl = coverUrl; await deleteOldImage(company.coverUrl); }

    await db.collection('companies').doc(company.id).update(data);
    Object.assign(company, data);
    qs('dName').textContent = company.name;
    qs('dCr').textContent = company.crNumber ? ('سجل تجاري: ' + company.crNumber) : '';
    if(data.logoUrl) qs('coLogo').innerHTML = `<img src="${data.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:19px">`;
    if(data.coverUrl) qs('coCover').style.backgroundImage = `url('${data.coverUrl}')`;
    toast('تم حفظ الإعدادات ✔');
    goBack();
  }catch(e){
    console.error(e);
    toast('تعذر الحفظ: ' + (e.code||e.message||'خطأ'));
  }
  btn.disabled=false; btn.textContent='حفظ الإعدادات';
}

/* ===== الرابط والباركود ===== */
function openQR(){
  myLink = companyLink(company.slug);
  makeQR(qs('coQr'), myLink, 200);
  show('s-qr');
}

function copyLink(){
  navigator.clipboard.writeText(myLink)
    .then(()=>toast('تم نسخ الرابط')).catch(()=>toast('انسخ الرابط يدويًا'));
}
