// بوابة الشركات
let company = null, myTrips = [], calCursor = new Date(), selDate = null;

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

/* ===== المصادقة ===== */
auth.onAuthStateChanged(async user => {
  if(!user) return;
  const snap = await db.collection('companies').where('ownerUid','==',user.uid).limit(1).get();
  if(snap.empty){ show('s-login'); return; }
  company = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if(company.status !== 'active'){ show('s-pending'); return; }
  enterDashboard();
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
  const btn=qs('regBtn'); btn.disabled=true; btn.textContent='جارِ إنشاء الحساب...';
  try{
    // التأكد من عدم تكرار الرابط
    const slug = slugify(name);
    const dup = await db.collection('companies').where('slug','==',slug).get();
    const finalSlug = dup.empty ? slug : slug + '-' + Math.random().toString(36).slice(2,6);

    const cred = await auth.createUserWithEmailAndPassword(email,pass);
    await cred.user.sendEmailVerification(); // إيميل التفعيل/التحقق
    const cRef = await db.collection('companies').add({
      name, email, whatsapp: wa, desc, slug: finalSlug,
      ownerUid: cred.user.uid, status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      subscriptionEnd: null
    });
    await db.collection('users').doc(cred.user.uid).set({
      role:'company', companyId: cRef.id, name, email, whatsapp: wa
    });
    toast('تم إرسال إيميل التحقق إلى بريدك ✔');
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
  qs('dName').textContent = company.name;
  qs('dEmail').textContent = company.email;
  show('s-dash');
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
}

const TYPE_ICON = { 'جامعات وكليات':'🎓', 'حج وعمرة':'🕋', 'رحلة يومية':'🚌' };
const icon = t => TYPE_ICON[t] || '🚌';

function tripRow(x){
  return `<div class="card trip">
    <div class="thumb">${icon(x.type)}</div>
    <div style="flex:1">
      <h3>${esc(x.name)}</h3>
      <div class="meta">${x.recurring?'يوميًا':esc(x.date)} • ${esc(x.time)} • ${x.booked||0}/${x.seats} مقعد</div>
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
      </div>
      <button class="icon-btn" onclick="cancelBooking('${b.id}','${b.tripId}',${b.seats})">✖️</button>
    </div>`).join('') : '<div class="empty">لا توجد حجوزات واردة بعد</div>';
}

async function cancelBooking(id, tripId, seats){
  if(!confirm('إلغاء هذا الحجز؟')) return;
  await db.collection('bookings').doc(id).delete();
  await db.collection('trips').doc(tripId).update({
    booked: firebase.firestore.FieldValue.increment(-seats) });
  toast('تم إلغاء الحجز'); openBookings();
}

/* ===== الموظفون ===== */
async function openEmps(){
  show('s-emps'); qs('empErr').classList.remove('show');
  const snap = await db.collection('employees').where('companyId','==',company.id).get();
  qs('empsList').innerHTML = snap.empty ? '<div class="empty">لا يوجد موظفون بعد</div>'
    : snap.docs.map(d=>{ const e=d.data(); return `
    <div class="lrow" style="${e.active?'':'opacity:.55'}">
      <div class="ava">${esc(e.name).charAt(0)}</div>
      <div class="grow"><h4>${esc(e.name)}</h4><p dir="ltr" style="text-align:right">${esc(e.email)}</p>
        <p>${e.active?'نشط':'موقوف'}</p></div>
      <button class="icon-btn" onclick="toggleEmp('${d.id}',${!e.active})">${e.active?'⏸️':'▶️'}</button>
      <button class="icon-btn" onclick="delEmp('${d.id}')">🗑️</button>
    </div>`; }).join('');
}

async function addEmployee(){
  const name=qs('eName').value.trim(), email=qs('eEmail').value.trim(), pass=qs('ePass').value;
  if(!name||!email||!pass){ err('empErr','يرجى تعبئة جميع الحقول'); return; }
  const btn=qs('empBtn'); btn.disabled=true; btn.textContent='جارِ الإضافة...';
  try{
    // إنشاء حساب للموظف عبر نسخة ثانوية حتى لا يُسجَّل خروج المالك
    const sec = firebase.initializeApp(firebaseConfig, 'sec' + Date.now());
    const cred = await sec.auth().createUserWithEmailAndPassword(email, pass);
    await db.collection('employees').add({
      companyId: company.id, uid: cred.user.uid, name, email, active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(cred.user.uid).set({
      role:'employee', companyId: company.id, name, email });
    await sec.auth().signOut(); await sec.delete();
    toast('تمت إضافة الموظف ✔');
    qs('eName').value=qs('eEmail').value=qs('ePass').value='';
    openEmps();
  }catch(e){ err('empErr', aerr(e)); }
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

/* ===== الرابط والباركود ===== */
function openQR(){
  const link = companyLink(company.slug);
  qs('coLink').textContent = link;
  makeQR(qs('coQr'), link, 180);
  show('s-qr');
}

function copyLink(){
  navigator.clipboard.writeText(qs('coLink').textContent)
    .then(()=>toast('تم نسخ الرابط')).catch(()=>toast('انسخ الرابط يدويًا'));
}

function shareLink(){
  const link = qs('coLink').textContent;
  if(navigator.share) navigator.share({ title: company.name, url: link });
  else copyLink();
}
