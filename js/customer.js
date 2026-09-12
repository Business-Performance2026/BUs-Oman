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
    qs('coCr').textContent = company.crNumber ? ('سجل تجاري: ' + company.crNumber) : '';
    if(company.logoUrl) qs('coLogoC').innerHTML = `<img src="${company.logoUrl}" style="width:100%;height:100%;object-fit:cover">`;
    qs('coSub').textContent = company.desc || 'حجوزات النقل عبر منصة رحلاتك';
    // أزرار التواصل مع الشركة
    const ct = [];
    if(company.whatsapp) ct.push(`<a class="chip" href="${waLink(company.whatsapp)}" target="_blank" style="text-decoration:none">💬 واتساب</a>`);
    if(company.contactCall) ct.push(`<a class="chip" href="tel:${company.contactCall}" target="_blank" style="text-decoration:none">📞 اتصال</a>`);
    if(company.instagram){
      const ig = company.instagram.startsWith('http') ? company.instagram : 'https://instagram.com/' + company.instagram.replace(/^@/,'');
      ct.push(`<a class="chip" href="${ig}" target="_blank" style="text-decoration:none">📸 انستجرام</a>`);
    }
    qs('contactChips').innerHTML = ct.join('');

    // مسح باركود تذكرة؟ ?ticket=CODE
    const ticket = param('ticket');
    if(ticket){ verifyTicket(ticket); return; }
    loadTrips();
  }catch(e){ console.error(e); qs('errMsg').textContent='تعذر الاتصال، تحقق من الإنترنت'; show('s-404', false); }
}

function loadTrips(){
  // تحديث لحظي: أي رحلة جديدة أو حجز يظهر فورًا بدون تحديث الصفحة
  db.collection('trips')
    .where('companyId','==',company.id)
    .where('active','==',true)
    .onSnapshot(snap=>{
      const today = new Date().toISOString().slice(0,10);
      trips = snap.docs.map(d=>({id:d.id,...d.data()}))
        .filter(t => t.recurring || t.date >= today)
        .sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
      renderTrips();
      // رابط مباشر لرحلة محددة (مشاركة واتساب): يفتحها مباشرة
      if(!window._tripOpened && param('trip')){
        window._tripOpened = true;
        const tr = trips.find(x=>x.id===param('trip'));
        if(tr){ window._restored = true; openTrip(tr.id); return; }
      }
      if(!window._restored){ window._restored = true; restoreSession(); }
    }, e=>{
      console.error(e);
      qs('tripsList').innerHTML = '<div class="empty">تعذر تحميل الرحلات — حدّث الصفحة</div>';
    });
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
        <div class="meta">📅 ${t.recurring?'يوميًا':esc(t.date)} • 🕖 ${esc(t.time)}</div>
        <div class="meta">${t.busNumber?'🚌 '+esc(t.busNumber)+' • ':''}💺 ${left>0 ? 'متبقي '+left+'/'+t.seats : 'مكتملة'}</div>
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

/* مشاركة الرحلة برابط مباشر */
function shareTrip(id){
  const t = trips.find(x=>x.id===id) || currentTrip; if(!t) return;
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
+ 'السعر: ' + t.price + ' ر.ع\n'
+ '-------------------------\n'
+ 'احجز مقعدك الآن بضغطة زر:\n' + url + '\n'
+ '-------------------------\n'
+ 'نتشرف بخدمتكم'), '_blank');
}
function tripStopsC(t){ return (t.routeGo&&t.routeGo.length)?t.routeGo:[t.from,t.to].filter(Boolean); }

/* تعبئة محطات الصعود المتبقية — يرجع false إذا انطلقت الرحلة من كل المحطات (يُمنع الحجز) */
function fillBoardingStops(t){
  const wrap = qs('bStopWrap'), sel = qs('bStop');
  const stops = tripStopsC(t), times = t.routeGoTimes||[];
  const cur = (t.currentStop==null)?-1:t.currentStop;
  const up = stops.map((nm,i)=>({nm,i})).filter(x=>x.i>cur);
  if(stops.length<2){ wrap.style.display='none'; return true; }
  // لازم تبقى محطتان قادمتان على الأقل (محطة صعود + محطة نزول) — وإلا قُفل الحجز
  if(up.length<2){ wrap.style.display='none'; return false; }
  sel.innerHTML = up.map(x=>`<option value="${esc(x.nm)}">🚏 ${esc(x.nm)}${times[x.i]?' — ⏰ '+times[x.i]:''}</option>`).join('');
  wrap.style.display='';
  return true;
}

/* خارطة جوجل مضمّنة تعرض مسار الرحلة (مجانية — بدون API Key) */
function mapHTML(t){
  const stops = (t.routeGo&&t.routeGo.length)?t.routeGo:[t.from,t.to].filter(Boolean);
  if(stops.length<2) return '';
  const enc = s2 => encodeURIComponent(s2 + '، عمان');
  const url = 'https://maps.google.com/maps?saddr='+enc(stops[0])+'&daddr='+stops.slice(1).map(enc).join('+to:')+'&hl=ar&output=embed';
  return `<div class="track" style="padding:10px">
    <div class="track-title" style="padding:2px 4px 8px">🗺️ مسار الرحلة على الخارطة</div>
    <iframe src="${url}" style="width:100%;height:260px;border:0;border-radius:12px" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
  </div>`;
}

/* تتبع الرحلة: خط زمني عمودي على اليسار يوضح موقع الحافلة */
function trackerHTML(t){
  const stops = (t.routeGo&&t.routeGo.length)?t.routeGo:[t.from,t.to].filter(Boolean);
  if(stops.length<2) return '';
  const cur = (t.currentStop==null)?-1:t.currentStop;
  return `<div class="track">
    <div class="track-title">🛰️ تتبع الحافلة مباشرة ${cur===-1?'<span class="badge b-gold" style="margin-right:6px">لم تنطلق بعد</span>':''}</div>
    ${stops.map((s2,i)=>{
      const done = cur>i, now = cur===i;
      const st = done?'مرّ من هنا ✓':now?'الحافلة هنا الآن 📍':'قادم';
      const cls = now?'now':done?'done':'next';
      return `<div class="tstop ${cls}">
        <div class="tdot"></div>
        <div class="tinfo"><b>${esc(s2)}</b><span>${i===0?'محطة الانطلاق':i===stops.length-1?'محطة الوصول':'محطة توقف'} • ${st}</span></div>
      </div>`;
    }).join('')}
  </div>`;
}

function openTrip(id){
  currentTrip = trips.find(t=>t.id===id);
  saveNavState({ tripId: id });
  const t = currentTrip, left = seatsLeft(t);
  const departed = !fillBoardingStops(t);
  qs('tripDetail').innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="height:140px;background:linear-gradient(140deg,var(--teal),var(--navy2));display:flex;align-items:center;justify-content:center;font-size:60px">${icon(t.type)}</div>
      <div style="padding:16px">
        <h3 style="font-weight:900;font-size:18px">${esc(t.name)}</h3>
        <p class="route" style="font-size:15px">${esc(t.from)} ← ${esc(t.to)}</p>
        ${t.busNumber?`<p class="muted">🚌 رقم الحافلة: <b>${esc(t.busNumber)}</b></p>`:''}
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${t.recurring?'رحلة يومية':fmtDate(new Date(t.date+'T00:00'))}</b></div>
        <div class="tline"><span class="muted">🕖 وقت الانطلاق</span><b>${esc(t.time)}</b></div>
        <div class="tline"><span class="muted">💺 المقاعد المتاحة</span><b>${left} مقعد</b></div>
        <div class="tline" style="border:none"><span class="muted">💰 السعر</span><b class="price">${t.price} ر.ع</b></div>
      </div>
    </div>
    ${mapHTML(t)}
    ${trackerHTML(t)}
    <button class="btn btn-ghost" style="margin-bottom:10px" onclick="shareTrip('${t.id}')">📤 مشاركة الرحلة</button>
    <button class="btn btn-primary" ${(left<=0||departed)?'disabled':''} onclick="show('s-book')">${departed?'🚌 انطلقت الرحلة — توقّف الحجز':left>0?'احجز الآن':'اكتملت المقاعد'}</button>`;
  show('s-trip');
}

/* ===== التحقق من التذكرة عند مسح الباركود ===== */
async function verifyTicket(code){
  show('s-verify', false);
  qs('verifyBox').innerHTML = '<div class="empty"><span class="spin"></span> جارِ التحقق من التذكرة...</div>';
  const PAY_L = { cash:'💵 كاش', visa:'💳 فيزا', transfer:'🏦 تحويل' };
  try{
    const snap = await db.collection('bookings')
      .where('companyId','==',company.id).where('code','==',code).limit(1).get();
    if(snap.empty){
      qs('verifyBox').innerHTML = `<div class="vcard" style="border-top:6px solid var(--red)">
        <div style="font-size:56px">❌</div>
        <h2 style="font-weight:900;margin:8px 0;color:var(--red)">التذكرة غير موجودة</h2>
        <p class="muted">لم يتم العثور على تذكرة بهذا الرقم<br><b dir="ltr">${esc(code)}</b></p>
      </div>`;
      return;
    }
    const bk = snap.docs[0].data();
    let expired = false, tripGone = false;
    if(bk.tripId){
      try{
        const td = await db.collection('trips').doc(bk.tripId).get();
        if(!td.exists){ tripGone = true; }
        else{
          const tr = td.data()||{};
          if(!tr.recurring && tr.date && tr.date < new Date().toISOString().slice(0,10)) expired = true;
        }
      }catch(e){ tripGone = true; }
    } else { tripGone = true; }
    const paid = bk.paymentStatus==='confirmed' || bk.status==='confirmed';
    const payState = bk.paymentMethod==='cash'
      ? '<span class="badge b-teal">يدفع كاش في الحافلة 🚌</span>'
      : paid ? '<span class="badge b-green">مدفوع ✔</span>' : '<span class="badge b-gold">لم يُدفع بعد</span>';
    let head;
    if(bk.status==='cancelled'){
      head = `<div class="vcard" style="border-top:6px solid var(--red)">
        <div style="font-size:56px">⛔</div>
        <h2 style="font-weight:900;margin:8px 0;color:var(--red)">تذكرة ملغية</h2>
        <p class="muted">أُلغي هذا الحجز من الشركة${bk.cancelReason?'<br>السبب: '+esc(bk.cancelReason):''}</p>`;
    } else if(tripGone){
      head = `<div class="vcard" style="border-top:6px solid #94a3b8">
        <div style="font-size:56px">🚫</div>
        <h2 style="font-weight:900;margin:8px 0;color:#64748b">الباركود غير صالح</h2>
        <p class="muted">الرحلة انتهت — قم بحجز رحلة جديدة</p>`;
    } else if(expired){
      head = `<div class="vcard" style="border-top:6px solid #94a3b8">
        <div style="font-size:56px">⌛</div>
        <h2 style="font-weight:900;margin:8px 0;color:#64748b">التذكرة منتهية</h2>
        <p class="muted">انتهت الرحلة وتم استخدام هذا الباركود مسبقًا</p>`;
    } else {
      head = `<div class="vcard" style="border-top:6px solid #16a34a">
        <div style="font-size:56px">✅</div>
        <h2 style="font-weight:900;margin:8px 0;color:#16a34a">تذكرة صالحة</h2>
        <p class="muted">هذا الشخص حاجز فعلاً في هذه الرحلة</p>`;
    }
    qs('verifyBox').innerHTML = head + `
      <div style="text-align:right;margin-top:14px">
        <div class="tline"><span class="muted">👤 المسافر</span><b>${esc(bk.name)}</b></div>
        <div class="tline"><span class="muted">🚌 الرحلة</span><b>${esc(bk.tripName)}</b></div>
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${esc(bk.date)}</b></div>
        <div class="tline"><span class="muted">🕖 الوقت</span><b>${esc(bk.time)}</b></div>
        ${bk.boardingStop?`<div class="tline"><span class="muted">🚏 محطة الصعود</span><b>${esc(bk.boardingStop)}</b></div>`:''}
        <div class="tline"><span class="muted">💺 المقاعد</span><b>${bk.seats}</b></div>
        <div class="tline"><span class="muted">💳 الدفع</span><b>${PAY_L[bk.paymentMethod]||''} ${payState}</b></div>
        <div class="tline" style="border:none"><span class="muted">🔖 رقم التذكرة</span><b dir="ltr">${esc(bk.code)}</b></div>
      </div>
    </div>`;
  }catch(e){
    console.error(e);
    qs('verifyBox').innerHTML = '<div class="empty">تعذر التحقق — تحقق من الإنترنت وأعد المحاولة</div>';
  }
}

/* ===== خطوة 1: بيانات المسافر ثم اختيار الدفع ===== */
function submitBooking(){
  const name=qs('bName').value.trim(),
        wa=qs('bWa').value.trim(), seats=+qs('bSeats').value;
  const boardingStop = qs('bStopWrap').style.display!=='none' ? qs('bStop').value : '';
  const err = qs('bookErr');
  err.classList.remove('show');
  if(!name || !wa){ err.textContent='يرجى تعبئة جميع الحقول المطلوبة'; err.classList.add('show'); return; }
  if(!/^\d{8,15}$/.test(wa.replace(/\D/g,''))){ err.textContent='رقم الواتساب غير صحيح'; err.classList.add('show'); return; }
  const t = currentTrip, left = seatsLeft(t);
  if(seats > left){ err.textContent='عدد المقاعد المطلوب أكبر من المتاح ('+left+')'; err.classList.add('show'); return; }
  pendingBooking = { name, whatsapp: wa, seats, boardingStop };
  saveNavState({ tripId: currentTrip.id, pending: { name, whatsapp: wa, seats, boardingStop } });
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
      <p class="muted" style="margin-top:8px;font-size:12.5px">${esc(company.bankName || ('الحساب البنكي لشركة ' + company.name))}</p>
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
    const code = 'OM-' + Math.floor(1000+Math.random()*9000);
    await db.collection('bookings').add({
      tripId: t.id, companyId: company.id, tripName: t.name,
      from: t.from, to: t.to,
      name: p.name, whatsapp: p.whatsapp, seats: p.seats, boardingStop: p.boardingStop||'',
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
      date: t.recurring?'يوميًا':t.date, time:t.time, code, boardingStop: p.boardingStop||'',
      status });
  }catch(e){ console.error(e); toast('حدث خطأ، حاول مجددًا'); }
}

function statusLabel(s){
  if(s==='confirmed') return ['b-green','مؤكد ✔'];
  if(s==='cancelled') return ['b-red','ملغي ⛔'];
  return ['b-gold','بانتظار تأكيد الدفع'];
}

function showTicket(b, bookingId, tripId){
  saveNavState({ ticket: b, bookingId: bookingId||null, tripId2: tripId||null });
  const [cls,label] = statusLabel(b.status);
  qs('ticketBox').innerHTML = `
    <div class="ticket">
      <div class="tp"><div id="qrT" class="qr-frame"></div><div class="qr-cap">🎫 امسح الباركود للتحقق من التذكرة</div></div>
      <div class="tb">
        <h3 style="font-weight:900;text-align:center">${esc(b.tripName)}</h3>
        <p class="muted center" style="margin-bottom:10px">${esc(b.from||'')} ${b.from?'←':''} ${esc(b.to||'')}</p>
        <div class="tline"><span class="muted">👤 المسافر</span><b>${esc(b.name)}</b></div>
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${esc(b.date)}</b></div>
        <div class="tline"><span class="muted">🕖 الوقت</span><b>${esc(b.time)}</b></div>
        <div class="tline"><span class="muted">💺 المقاعد</span><b>${b.seats}</b></div>
        ${b.boardingStop?`<div class="tline"><span class="muted">🚏 محطة الصعود</span><b>${esc(b.boardingStop)}</b></div>`:''}
        <div class="tline"><span class="muted">الحالة</span><span class="badge ${cls}">${label}</span></div>
        <div class="tline" style="border:none"><span class="muted">🔖 رقم التذكرة</span><b dir="ltr">${esc(b.code)}</b></div>
      </div>
    </div>
    ${(()=>{ const tr = trips.find(x=>x.id===(tripId||b.tripId)); return tr?trackerHTML(tr):''; })()}
    <div class="notice" style="margin-top:14px">يرجى إبراز رقم التذكرة عند الصعود إلى الحافلة</div>
    <div style="height:12px"></div>
    ${b.status==='cancelled' && b.cancelReason ? `<div class="notice" style="margin-top:14px;background:#fdeaea;color:var(--red)">⛔ أُلغي هذا الحجز من الشركة<br>السبب: ${esc(b.cancelReason)}</div><div style="height:12px"></div>` : ''}
    ${bookingId && b.status!=='cancelled' ? `<button class="btn btn-danger" onclick="cancelMyBooking('${bookingId}','${tripId}',${b.seats})">إلغاء الحجز</button><div style="height:12px"></div>` : ''}
    <button class="btn btn-ghost" onclick="goHome()">العودة للرحلات</button>`;
  // باركود التذكرة = رابط تحقق مباشر: من يمسحه يرى صلاحية التذكرة وتفاصيلها
  const verifyUrl = companyLink(b.companySlug || company.slug) + '&ticket=' + b.code;
  makeQR(qs('qrT'), verifyUrl, 140);
  show('s-ticket');
}

function goHome(){
  _navStack = ['s-home'];
  show('s-home', false);
}

/* ===== حجوزاتي + الإلغاء ===== */
let lastFindWa = '', bookingsUnsub = null;
function findBookings(){
  const wa = qs('findWa').value.trim();
  if(!wa){ toast('أدخل رقم الواتساب'); return; }
  lastFindWa = wa;
  const box = qs('myBookings');
  box.innerHTML = '<div class="empty"><span class="spin"></span> جارِ البحث...</div>';
  if(bookingsUnsub) bookingsUnsub();
  // تحديث لحظي: الإلغاء أو التأكيد يظهر فورًا
  bookingsUnsub = db.collection('bookings').where('whatsapp','==',wa)
    .onSnapshot(snap=>{
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
            ${b.status==='cancelled' && b.cancelReason ? `<div class="meta" style="color:var(--red)">السبب: ${esc(b.cancelReason)}</div>` : ''}
          </div>
        </div>`;
      }).join('') : '<div class="empty">لا توجد حجوزات على هذا الرقم</div>';
    }, e=>{ console.error(e); box.innerHTML = '<div class="empty">تعذر التحميل — حاول مجددًا</div>'; });
}

function cancelMyBooking(id, tripId, seats){
  confirmBox({ icon:'⚠️', title:'إلغاء الحجز', msg:'سيتم إلغاء حجزك وتحرير مقعدك فورًا.', ok:'نعم، إلغاء الحجز', danger:true },
  async ()=>{
    try{
      await db.collection('bookings').doc(id).delete();
      // استرجاع المقاعد خطوة مستقلة — لا يفشل الإلغاء لو الرحلة حُذفت
      if(tripId && tripId!=='undefined' && seats>0){
        try{
          await db.collection('trips').doc(tripId).update({
            booked: firebase.firestore.FieldValue.increment(-seats)
          });
        }catch(e2){ console.warn('استرجاع المقاعد:', e2); }
      }
      toast('تم إلغاء الحجز ✔');
      // تحديث القائمة فورًا بدون تحديث الصفحة
      if(lastFindWa){ qs('findWa').value = lastFindWa; findBookings(); show('s-find'); }
      else goHome();
    }catch(e){ console.error(e); toast('تعذر الإلغاء، حاول مجددًا'); }
  });
}

/* ===== استعادة الجلسة بعد تحديث الصفحة ===== */
function restoreSession(){
  const saved = SAVED_AT_LOAD.screen;
  if(!saved || saved==='s-home' || saved==='s-404') return;
  let st = {}; try{ st = JSON.parse(SAVED_AT_LOAD.state||'{}'); }catch(e){}
  const t = st.tripId ? trips.find(x=>x.id===st.tripId) : null;
  if(saved==='s-trip' && t){ openTrip(t.id); return; }
  if(saved==='s-book' && t){ currentTrip=t; fillBoardingStops(t); show('s-book'); restoreDraft('s-book'); return; }
  if(saved==='s-pay' && t && st.pending){ currentTrip=t; pendingBooking=st.pending; renderPayment(); return; }
  if(saved==='s-ticket' && st.ticket){ showTicket(st.ticket, st.bookingId, st.tripId2); return; }
  if(saved==='s-find'){ show('s-find'); restoreDraft('s-find'); }
}
