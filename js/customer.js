// صفحة العميل — تُفتح برابط الشركة ?c=slug
let company = null, trips = [], currentTrip = null, currentType = '', pendingBooking = null;

const TYPE_ICON = { 'جامعات وكليات':'🎓', 'حج وعمرة':'🕋', 'رحلة يومية':'🚌' };
const icon = t => TYPE_ICON[t] || '🚌';

init();
async function init(){
  history.replaceState({s:'s-home'}, '');
  _navStack = ['s-home'];
  const slug = param('c');
  if(!slug){ location.replace('index.html'); return; }
  try{
    const snap = await db.collection('companies').where('slug','==',slug).limit(1).get();
    if(snap.empty){ qs('errMsg').textContent='الرابط غير صحيح — تأكد من الرابط أو الباركود'; show('s-404', false); return; }
    company = { id: snap.docs[0].id, ...snap.docs[0].data() };
    if(!companyValid(company)){
      qs('errMsg').textContent = company.status!=='active'
        ? 'هذه الشركة غير مفعّلة بعد'
        : 'انتهت فترة اشتراك هذه الشركة — ستعود قريبًا';
      show('s-404', false); return;
    }
    document.title = company.name + ' — رحلاتك';
    qs('coName').textContent = company.name;
    qs('coSub').textContent = company.desc || 'حجوزات النقل عبر منصة رحلاتك';
    loadTrips();
  }catch(e){ console.error(e); qs('errMsg').textContent='تعذر الاتصال، تحقق من الإنترنت'; show('s-404', false); }
}

async function loadTrips(){
  const today = new Date().toISOString().slice(0,10);
  const snap = await db.collection('trips')
    .where('companyId','==',company.id)
    .where('active','==',true).get();
  trips = snap.docs.map(d=>({id:d.id,...d.data()}))
    .filter(t => t.recurring || t.date >= today)
    .sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  renderTrips();
}

function seatsLeft(t){ return (t.seats||0) - (t.booked||0); }

function renderTrips(){
  const list = trips.filter(t => !currentType || t.type===currentType);
  qs('tripsList').innerHTML = list.length ? list.map(t=>{
    const left = seatsLeft(t);
    return `<div class="card trip" onclick="openTrip('${t.id}')">
      <div class="thumb">${icon(t.type)}</div>
      <div style="flex:1">
        <h3>${esc(t.name)}</h3>
        <div class="route">${esc(t.from)} ← ${esc(t.to)}</div>
        <div class="meta">${t.recurring?'يوميًا':esc(t.date)} ${esc(t.time)}${t.busNumber?' • 🚌 '+esc(t.busNumber):''}</div>
        <span class="badge ${left>5?'b-green':left>0?'b-gold':'b-red'}" style="margin-top:5px">
          ${left>0 ? left+' مقعد متاح' : 'مكتملة'}</span>
      </div>
      <div class="price">${t.price} ر.ع</div>
    </div>`;
  }).join('') : '<div class="empty">لا توجد رحلات متاحة حاليًا</div>';
}

qs('typeChips').addEventListener('click', e=>{
  const b = e.target.closest('.chip'); if(!b) return;
  document.querySelectorAll('#typeChips .chip').forEach(c=>c.classList.remove('on'));
  b.classList.add('on'); currentType = b.dataset.t; renderTrips();
});

function openTrip(id){
  currentTrip = trips.find(t=>t.id===id);
  const t = currentTrip, left = seatsLeft(t);
  qs('tripDetail').innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="height:140px;background:linear-gradient(140deg,var(--teal),var(--navy2));display:flex;align-items:center;justify-content:center;font-size:60px">${icon(t.type)}</div>
      <div style="padding:16px">
        <h3 style="font-weight:900;font-size:18px">${esc(t.name)}</h3>
        <p class="route" style="font-size:15px">${esc(t.from)} ← ${esc(t.to)}</p>
        ${t.busNumber?`<p class="muted">🚌 رقم الباص: <b>${esc(t.busNumber)}</b></p>`:''}
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${t.recurring?'رحلة يومية':fmtDate(new Date(t.date+'T00:00'))}</b></div>
        <div class="tline"><span class="muted">🕖 وقت الانطلاق</span><b>${esc(t.time)}</b></div>
        <div class="tline"><span class="muted">💺 المقاعد المتاحة</span><b>${left} مقعد</b></div>
        <div class="tline" style="border:none"><span class="muted">💰 السعر</span><b class="price">${t.price} ر.ع</b></div>
      </div>
    </div>
    <button class="btn btn-primary" ${left<=0?'disabled':''} onclick="show('s-book')">${left>0?'احجز الآن':'اكتملت المقاعد'}</button>`;
  show('s-trip');
}

/* ===== خطوة 1: بيانات المسافر ثم اختيار الدفع ===== */
function submitBooking(){
  const name=qs('bName').value.trim(), nid=qs('bId').value.trim(),
        wa=qs('bWa').value.trim(), seats=+qs('bSeats').value;
  const err = qs('bookErr');
  err.classList.remove('show');
  if(!name || !nid || !wa){ err.textContent='يرجى تعبئة جميع الحقول المطلوبة'; err.classList.add('show'); return; }
  if(!/^\d{8,15}$/.test(wa.replace(/\D/g,''))){ err.textContent='رقم الواتساب غير صحيح'; err.classList.add('show'); return; }
  const t = currentTrip, left = seatsLeft(t);
  if(seats > left){ err.textContent='عدد المقاعد المطلوب أكبر من المتاح ('+left+')'; err.classList.add('show'); return; }
  pendingBooking = { name, nationalId: nid, whatsapp: wa, seats };
  renderPayment();
}

function renderPayment(){
  const t = currentTrip;
  // تعرض فقط طرق الدفع التي فعّلتها الشركة من إعداداتها
  const pm = company.paymentMethods || {};
  const total = t.price * pendingBooking.seats;
  let opts = '';
  if(pm.cash)     opts += payBtn('cash', '💵', 'كاش', 'ادفع عند الصعود للحافلة');
  if(pm.visa)     opts += payBtn('visa', '💳', 'فيزا / بطاقة', 'ادفع إلكترونيًا الآن');
  if(pm.transfer) opts += payBtn('transfer', '🏦', 'تحويل بنكي', 'حوّل وأرفق صورة الوصل');
  if(!opts) opts = `<div class="notice" style="margin-bottom:12px">لم تفعّل الشركة طرق دفع إلكترونية — الدفع عند الصعود</div>
    <button class="btn btn-primary" onclick="finalizeBooking('cash','confirmed')">تأكيد الحجز</button>`;
  qs('payBox').innerHTML = `
    <div class="card center">
      <h3 style="font-weight:900">${esc(t.name)}</h3>
      <p class="muted">${pendingBooking.seats} مقعد × ${t.price} ر.ع</p>
      <div class="price" style="font-size:26px;margin-top:6px">${total} ر.ع</div>
    </div>
    <h2 class="sec">اختر طريقة الدفع</h2>
    ${opts}`;
  show('s-pay');
}

function payBtn(m, ic, title, sub){
  return `<div class="lrow" style="cursor:pointer" onclick="choosePay('${m}')">
    <div class="ava">${ic}</div>
    <div class="grow"><h4>${title}</h4><p>${sub}</p></div>
    <span style="color:var(--muted)">‹</span>
  </div>`;
}

async function choosePay(method){
  if(method === 'visa'){ toast('الدفع الإلكتروني قيد التفعيل — أكمل الحجز وادفع عند الصعود'); }
  if(method === 'transfer'){ renderTransfer(); return; }
  finalizeBooking(method, method==='visa' ? 'pending_payment' : 'confirmed');
}

/* ===== التحويل البنكي ===== */
function renderTransfer(){
  const phone = company.transferPhone || company.whatsapp || '';
  qs('payBox').innerHTML = `
    <div class="card center">
      <div style="font-size:40px">🏦</div>
      <h3 style="font-weight:900;margin:8px 0">حوّل إلى الرقم التالي</h3>
      <div style="background:#f4f7f9;border-radius:14px;padding:14px;font-size:22px;font-weight:900;letter-spacing:2px" dir="ltr">${esc(phone)}</div>
      <p class="muted" style="margin-top:8px;font-size:12.5px">الرقم مربوط بالحساب البنكي لشركة ${esc(company.name)}</p>
    </div>
    <div class="card">
      <h3 style="font-weight:900;margin-bottom:10px">أرفق صورة الوصل *</h3>
      <input type="file" id="receiptFile" accept="image/*" style="font-family:inherit">
    </div>
    <button class="btn btn-primary" id="payBtn" onclick="submitTransfer()">تأكيد الحجز وإرسال الوصل</button>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" onclick="renderPayment()">← تغيير طريقة الدفع</button>`;
}

async function submitTransfer(){
  const file = qs('receiptFile').files[0];
  if(!file){ toast('أرفق صورة الوصل أولًا'); return; }
  const btn = qs('payBtn'); btn.disabled=true; btn.textContent='جارِ رفع الوصل...';
  try{
    const path = 'receipts/' + company.id + '/' + Date.now() + '.jpg';
    const snap = await firebase.storage().ref(path).put(file);
    const url = await snap.ref.getDownloadURL();
    finalizeBooking('transfer', 'pending_payment', url);
  }catch(e){ console.error(e); toast('فشل رفع الوصل، حاول مجددًا'); btn.disabled=false; btn.textContent='تأكيد الحجز وإرسال الوصل'; }
}

/* ===== حفظ الحجز ===== */
async function finalizeBooking(paymentMethod, status, receiptUrl){
  const t = currentTrip, p = pendingBooking;
  try{
    const code = 'TKT-' + Date.now().toString(36).toUpperCase();
    await db.collection('bookings').add({
      tripId: t.id, companyId: company.id, tripName: t.name,
      from: t.from, to: t.to,
      name: p.name, nationalId: p.nationalId, whatsapp: p.whatsapp, seats: p.seats,
      date: t.recurring ? 'يوميًا' : t.date, time: t.time, price: t.price,
      paymentMethod, paymentStatus: status==='confirmed'?'confirmed':'pending',
      receiptUrl: receiptUrl || null,
      code, status, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('trips').doc(t.id).update({
      booked: firebase.firestore.FieldValue.increment(p.seats)
    });
    t.booked = (t.booked||0) + p.seats;
    renderTrips();
    showTicket({ tripName:t.name, from:t.from, to:t.to, name:p.name, seats:p.seats,
      date: t.recurring?'يوميًا':t.date, time:t.time, code,
      status });
  }catch(e){ console.error(e); toast('حدث خطأ، حاول مجددًا'); }
}

function statusLabel(s){ return s==='confirmed' ? ['b-green','مؤكد ✔'] : ['b-gold','بانتظار تأكيد الدفع']; }

function showTicket(b, bookingId, tripId){
  const [cls,label] = statusLabel(b.status);
  qs('ticketBox').innerHTML = `
    <div class="ticket">
      <div class="tp"><div id="qrT"></div></div>
      <div class="tb">
        <h3 style="font-weight:900;text-align:center">${esc(b.tripName)}</h3>
        <p class="muted center" style="margin-bottom:10px">${esc(b.from||'')} ${b.from?'←':''} ${esc(b.to||'')}</p>
        <div class="tline"><span class="muted">👤 المسافر</span><b>${esc(b.name)}</b></div>
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${esc(b.date)}</b></div>
        <div class="tline"><span class="muted">🕖 الوقت</span><b>${esc(b.time)}</b></div>
        <div class="tline"><span class="muted">💺 المقاعد</span><b>${b.seats}</b></div>
        <div class="tline"><span class="muted">الحالة</span><span class="badge ${cls}">${label}</span></div>
        <div class="tline" style="border:none"><span class="muted">🔖 رمز التذكرة</span><b dir="ltr">${esc(b.code)}</b></div>
      </div>
    </div>
    <div class="notice" style="margin-top:14px">يرجى إبراز هذا الرمز عند الصعود إلى الحافلة</div>
    <div style="height:12px"></div>
    ${bookingId ? `<button class="btn btn-danger" onclick="cancelMyBooking('${bookingId}','${tripId}',${b.seats})">إلغاء الحجز</button><div style="height:12px"></div>` : ''}
    <button class="btn btn-ghost" onclick="goHome()">العودة للرحلات</button>`;
  makeQR(qs('qrT'), b.code, 140);
  show('s-ticket');
}

function goHome(){
  _navStack = ['s-home'];
  show('s-home', false);
}

/* ===== حجوزاتي + الإلغاء ===== */
let lastFindWa = '';
async function findBookings(){
  const wa = qs('findWa').value.trim();
  if(!wa){ toast('أدخل رقم الواتساب'); return; }
  lastFindWa = wa;
  const box = qs('myBookings');
  box.innerHTML = '<div class="empty"><span class="spin"></span> جارِ البحث...</div>';
  const snap = await db.collection('bookings').where('whatsapp','==',wa).get();
  const rows = snap.docs.map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  box.innerHTML = rows.length ? rows.map(b=>{
    const [cls,label] = statusLabel(b.status);
    return `<div class="card trip" onclick='showTicket(${JSON.stringify({...b, createdAt:null})}, "${b.id}", "${b.tripId}")'>
      <div class="thumb">🎫</div>
      <div style="flex:1">
        <h3>${esc(b.tripName)}</h3>
        <div class="meta">${esc(b.date)} • ${esc(b.time)} • ${b.seats} مقعد</div>
        <span class="badge ${cls}" style="margin-top:5px">${label}</span>
      </div>
    </div>`;
  }).join('') : '<div class="empty">لا توجد حجوزات على هذا الرقم</div>';
}

async function cancelMyBooking(id, tripId, seats){
  if(!confirm('إلغاء هذا الحجز؟ سيتم تحرير مقعدك.')) return;
  try{
    await db.collection('bookings').doc(id).delete();
    await db.collection('trips').doc(tripId).update({
      booked: firebase.firestore.FieldValue.increment(-seats)
    });
    toast('تم إلغاء الحجز ✔');
    loadTrips();
    goHome();
    if(lastFindWa){ qs('findWa').value = lastFindWa; }
  }catch(e){ console.error(e); toast('تعذر الإلغاء، حاول مجددًا'); }
}
