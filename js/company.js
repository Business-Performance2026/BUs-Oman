// بوابة الشركات
let company = null, myTrips = [], calCursor = new Date(), selDate = null;
let isEmployee = false, perms = null, editTripId = null, currentUser = null;

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
      show('s-pending', false); return;
    }
    if(!companyValid(company)){
      qs('pendIcon').textContent='⌛'; qs('pendTitle').textContent='انتهت الفترة التجريبية / الاشتراك';
      qs('pendMsg').innerHTML='لتجديد الاشتراك ومواصلة استقبال الحجوزات، تواصل مع إدارة المنصة.';
      show('s-pending', false); return;
    }
    await enterDashboard();
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

  // إعلان الإدارة للشركة: يظهر كل مرة يُفتح التطبيق ما دام مفعّلًا
  if(company.announcement?.active && company.announcement?.text){
    setTimeout(()=> infoBox({ icon:'📢', title:'تنبيه من إدارة المنصة', msg: esc(company.announcement.text) }), 600);
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
  qs('stRevenue').textContent = bookings.reduce((s,x)=>s+(x.price||0)*(x.seats||1),0).toLocaleString();
  renderUpcoming();
  show('s-dash', false);
}

function renderUpcoming(){
  const today = new Date().toISOString().slice(0,10);
  const upcoming = myTrips.filter(x=>x.active && (x.recurring || x.date>=today)).slice(0,3);
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
  }
  if(dirty) await batch.commit();
}

const TYPE_ICON = { 'جامعات وكليات':'🎓', 'حج وعمرة':'🕋', 'رحلة يومية':'🚌' };
const icon = t => TYPE_ICON[t] || '🚌';

function tripRow(x){
  const left = (x.seats||0)-(x.booked||0);
  const ownerBtns = isEmployee ? '' : `
    <button class="icon-btn" onclick="openEditTrip('${x.id}')">✏️</button>
    <button class="icon-btn" onclick="toggleTrip('${x.id}',${!x.active})">${x.active?'⏸️':'▶️'}</button>
    <button class="icon-btn" onclick="delTrip('${x.id}')">🗑️</button>`;
  return `<div class="card trip">
    <div class="thumb">${icon(x.type)}</div>
    <div style="flex:1">
      <h3>${esc(x.name)}</h3>
      <div class="meta">${x.recurring?'يوميًا':esc(x.date)} • ${esc(x.time)}${x.busNumber?' • 🚌 '+esc(x.busNumber):''} • متبقي ${left}/${x.seats}</div>
    </div>
    <span class="badge ${x.active?'b-green':'b-red'}">${x.active?'متاحة':'موقوفة'}</span>
    ${ownerBtns}
  </div>`;
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
  fillBusList();
  show('s-addtrip');
}

async function saveTrip(){
  const name=qs('tName').value.trim(), from=qs('tFrom').value.trim(), to=qs('tTo').value.trim(),
        bus=qs('tBus').value.trim(),
        type=qs('tType').value, date=qs('tDate').value, time=qs('tTime').value,
        seats=+qs('tSeats').value, price=+qs('tPrice').value, recurring=qs('tRecurring').checked;
  if(!name||!from||!to||!bus||!date||!time||!seats||isNaN(price)){
    err('tripErr','يرجى تعبئة جميع الحقول المطلوبة'); return; }
  const btn=qs('tripBtn'); btn.disabled=true; btn.textContent='جارِ الحفظ...';
  try{
    // حفظ رقم الباص في قائمة الشركة لاستخدامه لاحقًا
    const buses = company.buses||[];
    if(bus && !buses.includes(bus)){
      buses.push(bus);
      await db.collection('companies').doc(company.id).update({buses});
      company.buses = buses;
    }
    if(editTripId){
      await db.collection('trips').doc(editTripId).update({
        name, from, to, busNumber: bus, type, date, time, seats, price, recurring });
      toast('تم تعديل الرحلة ✔');
    } else {
      await db.collection('trips').add({
        companyId: company.id, name, from, to, busNumber: bus, type, date, time,
        seats, price, recurring, booked: 0, active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('تمت إضافة الرحلة ✔');
    }
    await refreshTrips(); openCal();
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
  return encodeURIComponent(
`مرحبًا ${b.name} 👋
تفاصيل حجزك مع ${company.name}:
🚌 الرحلة: ${b.tripName}
📅 التاريخ: ${b.date}
🕖 الوقت: ${b.time}
💺 عدد المقاعد: ${b.seats}
🔖 رمز التذكرة: ${b.code}
نتشرف بخدمتك 🌹`);
}

async function openBookings(){
  show('s-bookings');
  qs('bookingsList').innerHTML = '<div class="empty"><span class="spin"></span> جارِ التحميل...</div>';
  // تحديث لحظي: أي تغيير يظهر فورًا بدون تحديث الصفحة
  db.collection('bookings').where('companyId','==',company.id)
    .onSnapshot(snap=>{
      const rows = snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      qs('bookingsList').innerHTML = rows.length ? rows.map(b=>`
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="ava" style="width:44px;height:44px;border-radius:14px;background:var(--teal-l);color:var(--teal);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:900;flex-shrink:0">${esc(b.name).charAt(0)}</div>
            <div style="flex:1;min-width:0">
              <h4 style="font-weight:800">${esc(b.name)} <span class="badge b-teal">${b.seats} مقعد</span></h4>
              <p class="muted" style="font-size:12.5px">${esc(b.tripName)} • ${esc(b.date)} ${esc(b.time)}</p>
              <p dir="ltr" style="text-align:right;font-size:12px;color:var(--muted)">${esc(b.whatsapp)} • ${esc(b.code)}</p>
              <p style="font-size:12.5px">${PAY_LABEL[b.paymentMethod]||''}
                ${b.status==='confirmed'
                  ? '<span class="badge b-green">مؤكد</span>'
                  : '<span class="badge b-gold">بانتظار تأكيد الدفع</span>'}
              </p>
            </div>
          </div>
          <div class="bk-actions">
            <button class="icon-btn" style="background:#dff3e9;color:var(--green)" onclick="window.open('${waLink(b.whatsapp)}?text=${waMessage(b)}','_blank')">💬 واتساب</button>
            ${b.status!=='confirmed' ? `<button class="icon-btn" style="background:var(--teal-l);color:var(--teal)" onclick="confirmPay('${b.id}')">✔️ تأكيد الدفع</button>` : ''}
            ${b.receiptUrl ? `<a class="icon-btn" style="background:#e8ecf8;color:var(--navy2);text-decoration:none;display:flex;align-items:center;justify-content:center" href="${b.receiptUrl}" target="_blank">📎 الوصل</a>` : ''}
            <button class="icon-btn" style="background:#fdeaea;color:var(--red)" onclick="cancelBooking('${b.id}','${b.tripId}',${b.seats}')">✖️ إلغاء</button>
          </div>
        </div>`).join('') : '<div class="empty">لا توجد حجوزات واردة بعد</div>';
    });
}

async function confirmPay(id){
  await db.collection('bookings').doc(id).update({ status:'confirmed', paymentStatus:'confirmed' });
  toast('تم تأكيد الدفع ✔'); // القائمة تتحدث لحظيًا تلقائيًا
}

function cancelBooking(id, tripId, seats){
  confirmBox({ icon:'⚠️', title:'إلغاء الحجز', msg:'سيتم حذف الحجز وإرجاع المقاعد للرحلة فورًا.', ok:'نعم، إلغاء الحجز', danger:true },
  async ()=>{
    await db.collection('bookings').doc(id).delete();
    await db.collection('trips').doc(tripId).update({
      booked: firebase.firestore.FieldValue.increment(-seats) });
    toast('تم إلغاء الحجز وأُرجعت المقاعد ✔');
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
    <div class="lrow" style="${e.active?'':'opacity:.55'}">
      <div class="ava">${esc(e.name).charAt(0)}</div>
      <div class="grow"><h4>${esc(e.name)}</h4>
        <p dir="ltr" style="text-align:right">${esc(e.email)}</p>
        <p dir="ltr" style="text-align:right">📱 ${esc(e.whatsapp||'—')}</p>
        <p>${e.active?'نشط':'موقوف'}</p></div>
      <button class="icon-btn" title="تعديل" onclick='editEmp("${d.id}", ${JSON.stringify(e).replace(/'/g,"&#39;")})'>✏️</button>
      <button class="icon-btn" title="إعادة تعيين كلمة المرور" onclick="empResetPass('${esc(e.email)}')">🔑</button>
      <button class="icon-btn" onclick="toggleEmp('${d.id}',${!e.active})">${e.active?'⏸️':'▶️'}</button>
      <button class="icon-btn" onclick="delEmp('${d.id}')">🗑️</button>
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
  const link = companyLink(company.slug);
  qs('coLink').textContent = link;
  makeQR(qs('coQr'), link, 200);
  show('s-qr');
}

function copyLink(){
  navigator.clipboard.writeText(qs('coLink').textContent)
    .then(()=>toast('تم نسخ الرابط')).catch(()=>toast('انسخ الرابط يدويًا'));
}
