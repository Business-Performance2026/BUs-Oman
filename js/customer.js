// صفحة العميل — تُفتح برابط الشركة ?c=slug
let company = null, trips = [], currentTrip = null, currentType = '';

const TYPE_ICON = { 'جامعات وكليات':'🎓', 'حج وعمرة':'🕋', 'رحلة يومية':'🚌' };
const icon = t => TYPE_ICON[t] || '🚌';

init();
async function init(){
  const slug = param('c');
  if(!slug){ location.replace('index.html'); return; }
  try{
    const snap = await db.collection('companies').where('slug','==',slug).limit(1).get();
    if(snap.empty || snap.docs[0].data().status !== 'active'){ show('s-404'); return; }
    company = { id: snap.docs[0].id, ...snap.docs[0].data() };
    document.title = company.name + ' — رحلاتك';
    qs('coName').textContent = company.name;
    qs('coSub').textContent = (company.desc || 'حجوزات النقل عبر منصة رحلاتك');
    loadTrips();
  }catch(e){ console.error(e); show('s-404'); }
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
        <div class="meta">${esc(t.from)} ← ${esc(t.to)} • ${t.recurring?'يوميًا':esc(t.date)} ${esc(t.time)}</div>
        <span class="badge ${left>5?'b-green':left>0?'b-gold':'b-red'}" style="margin-top:5px">
          ${left>0 ? left+' مقعد متاح' : 'مكتملة'}</span>
      </div>
      <div class="price">${t.price} ر.س</div>
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
        <p class="muted">${esc(t.from)} ← ${esc(t.to)}</p>
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${t.recurring?'رحلة يومية':fmtDate(new Date(t.date+'T00:00'))}</b></div>
        <div class="tline"><span class="muted">🕖 وقت الانطلاق</span><b>${esc(t.time)}</b></div>
        <div class="tline"><span class="muted">💺 المقاعد المتاحة</span><b>${left} مقعد</b></div>
        <div class="tline" style="border:none"><span class="muted">💰 السعر</span><b class="price">${t.price} ر.س</b></div>
      </div>
    </div>
    <button class="btn btn-primary" ${left<=0?'disabled':''} onclick="show('s-book')">${left>0?'احجز الآن':'اكتملت المقاعد'}</button>`;
  show('s-trip');
}

async function submitBooking(){
  const name=qs('bName').value.trim(), nid=qs('bId').value.trim(),
        wa=qs('bWa').value.trim(), seats=+qs('bSeats').value;
  const err = qs('bookErr');
  err.classList.remove('show');
  if(!name || !nid || !wa){ err.textContent='يرجى تعبئة جميع الحقول المطلوبة'; err.classList.add('show'); return; }
  if(!/^\d{8,15}$/.test(wa.replace(/\D/g,''))){ err.textContent='رقم الواتساب غير صحيح'; err.classList.add('show'); return; }
  const t = currentTrip, left = seatsLeft(t);
  if(seats > left){ err.textContent='عدد المقاعد المطلوب أكبر من المتاح ('+left+')'; err.classList.add('show'); return; }

  const btn = qs('bookBtn'); btn.disabled = true; btn.textContent = 'جارِ الحجز...';
  try{
    const code = 'TKT-' + Date.now().toString(36).toUpperCase();
    const ref = await db.collection('bookings').add({
      tripId: t.id, companyId: company.id, tripName: t.name,
      name, nationalId: nid, whatsapp: wa, seats,
      date: t.recurring ? 'يوميًا' : t.date, time: t.time, price: t.price,
      code, status: 'confirmed', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('trips').doc(t.id).update({
      booked: firebase.firestore.FieldValue.increment(seats)
    });
    t.booked = (t.booked||0) + seats;
    showTicket({ ...t, code, name, seats, id: ref.id });
  }catch(e){ console.error(e); toast('حدث خطأ، حاول مجددًا'); }
  btn.disabled = false; btn.textContent = 'تأكيد الحجز';
}

function showTicket(b){
  qs('ticketBox').innerHTML = `
    <div class="ticket">
      <div class="tp"><div id="qrT"></div></div>
      <div class="tb">
        <h3 style="font-weight:900;text-align:center">${esc(b.tripName||b.name)}</h3>
        <p class="muted center" style="margin-bottom:10px">${esc(b.from||'')} ${b.from?'←':''} ${esc(b.to||'')}</p>
        <div class="tline"><span class="muted">👤 المسافر</span><b>${esc(b.name)}</b></div>
        <div class="tline"><span class="muted">📅 التاريخ</span><b>${b.recurring?'يوميًا':esc(b.date)}</b></div>
        <div class="tline"><span class="muted">🕖 الوقت</span><b>${esc(b.time)}</b></div>
        <div class="tline"><span class="muted">💺 المقاعد</span><b>${b.seats}</b></div>
        <div class="tline" style="border:none"><span class="muted">🔖 رمز التذكرة</span><b dir="ltr">${esc(b.code)}</b></div>
      </div>
    </div>
    <div class="notice" style="margin-top:14px">يرجى إبراز هذا الرمز عند الصعود إلى الحافلة</div>
    <div style="height:12px"></div>
    <button class="btn btn-ghost" onclick="show('s-home')">العودة للرحلات</button>`;
  makeQR(qs('qrT'), b.code, 140);
  show('s-ticket');
}

async function findBookings(){
  const wa = qs('findWa').value.trim();
  if(!wa){ toast('أدخل رقم الواتساب'); return; }
  const box = qs('myBookings');
  box.innerHTML = '<div class="empty"><span class="spin"></span> جارِ البحث...</div>';
  const snap = await db.collection('bookings').where('whatsapp','==',wa).get();
  const rows = snap.docs.map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  box.innerHTML = rows.length ? rows.map(b=>`
    <div class="card trip" onclick='showTicket(${JSON.stringify({...b, createdAt:null})})'>
      <div class="thumb">🎫</div>
      <div style="flex:1">
        <h3>${esc(b.tripName)}</h3>
        <div class="meta">${esc(b.date)} • ${esc(b.time)} • ${b.seats} مقعد</div>
        <span class="badge ${b.status==='confirmed'?'b-green':'b-gold'}" style="margin-top:5px">${b.status==='confirmed'?'مؤكد':'بانتظار'}</span>
      </div>
    </div>`).join('') : '<div class="empty">لا توجد حجوزات على هذا الرقم</div>';
}
