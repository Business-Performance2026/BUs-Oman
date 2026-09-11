// بوابة الشركات
let company = null, myTrips = [], calCursor = new Date(), selDate = null, isEmployee = false;

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

/* ===== المصادقة: مالك أو موظف ===== */
auth.onAuthStateChanged(async user => {
  if(!user){ history.replaceState({s:'s-login'},''); _navStack=['s-login']; show('s-login', false); return; }
  try{
    // 1) هل هو مالك شركة؟
    let snap = await db.collection('companies').where('ownerUid','==',user.uid).limit(1).get();
    if(!snap.empty){
      company = { id: snap.docs[0].id, ...snap.docs[0].data() };
      isEmployee = false;
    } else {
      // 2) هل هو موظف؟
      const u = await myRole(user.uid);
      if(u && (u.role==='employee' || u.role==='company') && u.companyId){
        const cDoc = await db.collection('companies').doc(u.companyId).get();
        if(cDoc.exists){ company = { id: cDoc.id, ...cDoc.data() }; isEmployee = (u.role==='employee'); }
      }
    }
    if(!company){ show('s-login', false); return; }

    // التحقق من التفعيل والاشتراك
    if(company.status === 'pending'){
      qs('pendIcon').textContent='⏳'; qs('pendTitle').textContent='حسابك قيد المراجعة';
      qs('pendMsg').innerHTML='تم استلام طلب تسجيل شركتك بنجاح.<br>سيتم تفعيل حسابك من إدارة المنصة قريبًا.';
      show('s-pending', false); return;
    }
    if(company.status === 'suspended'){
      qs('pendIcon').textContent='⛔'; qs('pendTitle').textContent='الحساب موقوف';
      qs('pendMsg').innerHTML='تم إيقاف حساب شركتك من الإدارة.<br>تواصل مع الدعم لإعادة التفعيل.';
      show('s-pending', false); return;
    }
    if(!companyValid(company)){
      qs('pendIcon').textContent='⌛'; qs('pendTitle').textContent='انتهت الفترة التجريبية / الاشتراك';
      qs('pendMsg').innerHTML='لتجديد الاشتراك ومواصلة استقبال الحجوزات، تواصل مع إدارة المنصة.';
      show('s-pending', false); return;
    }
    enterDashboard();
  }catch(e){ console.error(e); show('s-login', false); }
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
    await cred.user.sendEmailVerification(); // إيميل التفعيل يصل للمالك

    const trialEnd = new Date(Date.now() + 7*86400000); // 7 أيام تجريبي
    const cRef = await db.collection('companies').add({
      name, email, whatsapp: wa, desc, slug: finalSlug,
      ownerUid: cred.user.uid, status: 'pending',
      transferPhone: '',
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
  qs('dName').textContent = company.name;
  qs('dEmail').textContent = company.email;
  // شارة الاشتراك / التجريبي
  const dl = daysLeft(company);
  const badge = qs('dSubBadge');
  if(company.subscriptionEnd?.seconds){ badge.textContent='اشتراك ساري'; badge.className='badge b-green'; }
  else { badge.textContent='تجريبي'; badge.className='badge b-gold'; }
  qs('trialNote').innerHTML = dl!==null
    ? `<div class="notice" style="margin-bottom:14px">${company.subscriptionEnd?.seconds?'اشتراكك ينتهي':'فترتك التجريبية تنتهي'} خلال <b>${dl}</b> يوم</div>` : '';

  // حذف الرحلات المنتهية تلقائيًا (وحجوزاتها)
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
  qs('stRevenue').textContent = bookings.reduce((s,x)=>s+(x.price||0)*(x.seats||1),0).toLocaleString();
  const today = new Date().toISOString().slice(0,10);
  const upcoming = myTrips.filter(x=>x.active && (x.recurring || x.date>=today)).slice(0,3);
  qs('dashTrips').innerHTML = upcoming.length ? upcoming.map(tripRow).join('')
    : '<div class="empty">لا توجد رحلات بعد — أضف أول رحلة</div>';
  show('s-dash', false);
}

// حذف الرحلات غير المتكررة التي انتهى تاريخها — بلا أثر
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
  }
  if(dirty) await batch.commit();
}

const TYPE_ICON = { 'جامعات وكليات':'🎓', 'حج وعمرة':'🕋', 'رحلة يومية':'🚌' };
const icon = t => TYPE_ICON[t] || '🚌';

function tripRow(x){
  const left = (x.seats||0)-(x.booked||0);
  return `<div class="card trip">
    <div class="thumb">${icon(x.type)}</div>
    <div style="flex:1">
      <h3>${esc(x.name)}</h3>
      <div class="meta">${x.recurring?'يوميًا':esc(x.date)} • ${esc(x.time)} • متبقي ${left}/${x.seats}</div>
    </div>
    <span class="badge ${x.active?'b-green':'b-red'}">${x.active?'متاحة':'موقوفة'}</span>
    <button class="icon-btn" onclick="toggleTrip('${x.id}',${!x.active})">${x.active?'⏸️':'▶️'}</button>
    <button class="icon-btn" onclick="delTrip('${x.id}')">🗑️</button>
  </div>`;
}

/* ===== الرحلات ===== */
function openAddTrip(){ qs('tripErr').classList.remove('show'); show('s-addtrip'); }

async function saveTrip(){
  const name=qs('tName').value.trim(), from=qs('tFrom').value.trim(), to=qs('tTo').value.trim(),
        type=qs('tType').value, date=qs('tDate').value, time=qs('tTime').value,
        seats=+qs('tSeats').value, price=+qs('tPrice').value, recurring=qs('tRecurring').checked;
  if(!name||!from||!to||!date||!time||!seats||isNaN(price)){
    err('tripErr','يرجى تعبئة جميع الحقول المطلوبة'); return; }
  const btn=qs('tripBtn'); btn.disabled=true; btn.textContent='جارِ الحفظ...';
  try{
    await db.collection('trips').add({
      companyId: company.id, name, from, to, type, date, time,
      seats, price, recurring, booked: 0, active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('تمت إضافة الرحلة ✔');
    ['tName','tFrom','tTo','tSeats','tPrice'].forEach(i=>qs(i).value='');
    await refreshTrips(); openCal();
  }catch(e){ console.error(e); toast('حدث خطأ'); }
  btn.disabled=false; btn.textContent='حفظ الرحلة';
}

async function refreshTrips(){
  const t = await db.collection('trips').where('companyId','==',company.id).get();
  myTrips = t.docs.map(d=>({id:d.id,...d.data()}));
}

async function toggleTrip(id, val){
  await db.collection('trips').doc(id).update({active: val});
  toast(val?'تم تفعيل الرحلة':'تم إيقاف الرحلة');
  await refreshTrips(); renderDay(); enterDashboardSilent();
}

async function delTrip(id){
  if(!confirm('حذف هذه الرحلة نهائيًا؟')) return;
  await db.collection('trips').doc(id).delete();
  toast('تم حذف الرحلة');
  await refreshTrips(); renderDay(); enterDashboardSilent();
}

async function enterDashboardSilent(){
  qs('stTrips').textContent = myTrips.length;
  const today = new Date().toISOString().slice(0,10);
  const upcoming = myTrips.filter(x=>x.active && (x.recurring || x.date>=today)).slice(0,3);
  qs('dashTrips').innerHTML = upcoming.length ? upcoming.map(tripRow).join('')
    : '<div class="empty">لا توجد رحلات بعد — أضف أول رحلة</div>';
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

/* ===== الحجوزات الواردة ===== */
const PAY_LABEL = { cash:'💵 كاش', visa:'💳 فيزا', transfer:'🏦 تحويل' };
async function openBookings(){
  show('s-bookings');
  qs('bookingsList').innerHTML = '<div class="empty"><span class="spin"></span> جارِ التحميل...</div>';
  const snap = await db.collection('bookings').where('companyId','==',company.id).get();
  const rows = snap.docs.map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  qs('bookingsList').innerHTML = rows.length ? rows.map(b=>`
    <div class="lrow">
      <div class="ava">${esc(b.name).charAt(0)}</div>
      <div class="grow">
        <h4>${esc(b.name)} <span class="badge b-teal">${b.seats} مقعد</span></h4>
        <p>${esc(b.tripName)} • ${esc(b.date)} ${esc(b.time)}</p>
        <p dir="ltr" style="text-align:right">${esc(b.whatsapp)} • ${esc(b.code)}</p>
        <p>${PAY_LABEL[b.paymentMethod]||''}
          ${b.status==='confirmed'
            ? '<span class="badge b-green">مؤكد</span>'
            : '<span class="badge b-gold">بانتظار تأكيد الدفع</span>'}
          ${b.receiptUrl ? `<a href="${b.receiptUrl}" target="_blank" class="badge b-teal" style="text-decoration:none">📎 عرض الوصل</a>` : ''}
        </p>
      </div>
      ${b.status!=='confirmed' ? `<button class="icon-btn" style="background:#dff3e9" title="تأكيد الدفع" onclick="confirmPay('${b.id}')">✔️</button>` : ''}
      <button class="icon-btn" onclick="cancelBooking('${b.id}','${b.tripId}',${b.seats})">✖️</button>
    </div>`).join('') : '<div class="empty">لا توجد حجوزات واردة بعد</div>';
}

async function confirmPay(id){
  await db.collection('bookings').doc(id).update({ status:'confirmed', paymentStatus:'confirmed' });
  toast('تم تأكيد الدفع ✔'); openBookings();
}

async function cancelBooking(id, tripId, seats){
  if(!confirm('إلغاء هذا الحجز وإرجاع المقاعد؟')) return;
  await db.collection('bookings').doc(id).delete();
  await db.collection('trips').doc(tripId).update({
    booked: firebase.firestore.FieldValue.increment(-seats) });
  toast('تم إلغاء الحجز وأُرجعت المقاعد ✔'); openBookings();
}

/* ===== الموظفون ===== */
async function openEmps(){
  show('s-emps'); qs('empErr').classList.remove('show');
  const snap = await db.collection('employees').where('companyId','==',company.id).get();
  qs('empsList').innerHTML = snap.empty ? '<div class="empty">لا يوجد موظفون بعد</div>'
    : snap.docs.map(d=>{ const e=d.data(); return `
    <div class="lrow" style="${e.active?'':'opacity:.55'}">
      <div class="ava">${esc(e.name).charAt(0)}</div>
      <div class="grow"><h4>${esc(e.name)}</h4>
        <p dir="ltr" style="text-align:right">${esc(e.email)}</p>
        <p dir="ltr" style="text-align:right">📱 ${esc(e.whatsapp||'—')}</p>
        <p>${e.active?'نشط':'موقوف'}</p></div>
      <button class="icon-btn" onclick="toggleEmp('${d.id}',${!e.active})">${e.active?'⏸️':'▶️'}</button>
      <button class="icon-btn" onclick="delEmp('${d.id}')">🗑️</button>
    </div>`; }).join('');
}

async function addEmployee(){
  const name=qs('eName').value.trim(), email=qs('eEmail').value.trim(),
        wa=qs('eWa').value.trim(), pass=qs('ePass').value;
  if(!name||!email||!wa||!pass){ err('empErr','يرجى تعبئة جميع الحقول'); return; }
  const btn=qs('empBtn'); btn.disabled=true; btn.textContent='جارِ الإضافة...';
  try{
    // إنشاء حساب الموظف عبر نسخة ثانوية حتى لا يُسجَّل خروج المالك
    const secName = 'sec' + Date.now();
    const sec = firebase.initializeApp(firebaseConfig, secName);
    const cred = await sec.auth().createUserWithEmailAndPassword(email, pass);
    // كتابة وثيقة المستخدم من حساب الموظف نفسه (يتوافق مع قواعد الأمان)
    await sec.firestore().collection('users').doc(cred.user.uid).set({
      role:'employee', companyId: company.id, name, email, whatsapp: wa
    });
    await sec.auth().signOut(); await sec.delete();
    await db.collection('employees').add({
      companyId: company.id, uid: cred.user.uid, name, email, whatsapp: wa, active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('تمت إضافة الموظف ✔');
    qs('eName').value=qs('eEmail').value=qs('eWa').value=qs('ePass').value='';
    openEmps();
  }catch(e){ console.error(e); err('empErr', aerr(e)); }
  btn.disabled=false; btn.textContent='＋ إضافة';
}

async function toggleEmp(id, val){
  await db.collection('employees').doc(id).update({active: val});
  toast(val?'تم تفعيل الموظف':'تم إيقاف الموظف'); openEmps();
}

async function delEmp(id){
  if(!confirm('حذف هذا الموظف؟')) return;
  await db.collection('employees').doc(id).delete();
  toast('تم حذف الموظف'); openEmps();
}

/* ===== الإعدادات ===== */
function openSettings(){
  qs('sName').value = company.name || '';
  qs('sDesc').value = company.desc || '';
  qs('sTransfer').value = company.transferPhone || '';
  const pm = company.paymentMethods || {};
  qs('pmCash').checked = !!pm.cash;
  qs('pmVisa').checked = !!pm.visa;
  qs('pmTransfer').checked = !!pm.transfer;
  show('s-settings');
}

async function saveSettings(){
  const data = {
    name: qs('sName').value.trim() || company.name,
    desc: qs('sDesc').value.trim(),
    transferPhone: qs('sTransfer').value.trim(),
    paymentMethods: {
      cash: qs('pmCash').checked,
      visa: qs('pmVisa').checked,
      transfer: qs('pmTransfer').checked
    }
  };
  await db.collection('companies').doc(company.id).update(data);
  Object.assign(company, data);
  qs('dName').textContent = company.name;
  toast('تم حفظ الإعدادات ✔');
  goBack();
}

/* ===== الرابط والباركود ===== */
function openQR(){
  const link = companyLink(company.slug);
  qs('coLink').textContent = link;
  makeQR(qs('coQr'), link, 200);
  show('s-qr');
}

function copyLink(){
  navigator.clipboard.writeText(qs('coLink').textContent)
    .then(()=>toast('تم نسخ الرابط')).catch(()=>toast('انسخ الرابط يدويًا'));
}
