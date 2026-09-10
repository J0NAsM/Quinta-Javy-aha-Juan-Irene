/**
 * Quinta Javy'aha Ña Juana-Irene
 * Portal Web Comercial - Script Principal
 * Carapeguá, Paraguarí, Paraguay
 * WhatsApp Oficial: +595 972 783 547
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initHeaderScroll();
  initQuoteCalculator();
  initGalleryLightbox();
  initFaqAccordion();
  initContactForm();
  initDateAvailabilityChecker();
  initMaintenanceMode();
  initBookingForm();
  initDepositClient();
  initTermsClient();
  initLookup();
  initSurveyForm();
  initBookingLive();
});

/* ==========================================================================
   8. Reserva directa del cliente (solicitud: NO bloquea fecha hasta el pago)
   ========================================================================== */
/* Reserva web con inicio/fin explícitos (puede cruzar la medianoche).
   Helpers puros para testear sin DOM. */
function bookingToMin(t) {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function bookingAddDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
/* Expande un rango inicio→fin en tramos por día con horas exactas.
   Día inicial [ini,24:00), intermedios día completo, final [00:00,fin]. */
function bookingEntries(startDate, startTime, endDate, endTime, maxDays = 30) {
  if (!startDate || !startTime || !endDate || !endTime) return { entries: [], error: 'Completá fecha y hora de inicio y fin.' };
  if (endDate < startDate) return { entries: [], error: 'La fecha de fin es anterior a la de inicio.' };
  const DAY = 24 * 60;
  const sMin = bookingToMin(startTime), eMin = bookingToMin(endTime);
  if (endDate === startDate && !(eMin > sMin)) {
    return { entries: [], error: 'La hora de fin debe ser posterior a la de inicio. Para trasnochar, poné fecha de fin al día siguiente.' };
  }
  const entries = [];
  let cur = startDate, guard = 0;
  while (cur <= endDate && guard < maxDays) {
    if (cur === startDate && cur === endDate) entries.push({ date: cur, cs: startTime, ce: endTime });
    else if (cur === startDate) entries.push({ date: cur, cs: startTime, ce: '24:00' });
    else if (cur === endDate) entries.push({ date: cur, cs: '00:00', ce: endTime });
    else entries.push({ date: cur, cs: '00:00', ce: '24:00' });
    if (cur === endDate) break;
    cur = bookingAddDays(cur, 1);
    guard++;
  }
  if (cur !== endDate) return { entries: [], error: 'El rango supera el máximo de 30 días.' };
  return { entries, error: null };
}
function bookingEntryHours(e) {
  const h = (bookingToMin(e.ce === '24:00' ? '24:00' : e.ce) - bookingToMin(e.cs)) / 60;
  return Math.round(h * 2) / 2;
}
function bookingIntervalsOverlap(aS, aE, bS, bE) {
  return Math.max(aS, bS) < Math.min(aE, bE);
}
function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  const readJSON = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
  const TURNS_FALLBACK = [
    { id: 'dia_completo', name: 'Día Completo', startTime: '09:00', endTime: '01:00' },
    { id: 'mañana', name: 'Mañana', startTime: '09:00', endTime: '13:00' },
    { id: 'tarde', name: 'Tarde', startTime: '14:00', endTime: '18:00' },
    { id: 'noche', name: 'Noche', startTime: '19:00', endTime: '01:00' },
    { id: 'personalizado', name: 'Horario personalizado', startTime: '10:00', endTime: '18:00' }
  ];

  const spacePills = document.querySelectorAll('[data-booking-space]');
  const turnSel = document.getElementById('booking-turn');
  const dateStartInput = document.getElementById('booking-date');
  const timeStartInput = document.getElementById('booking-time-start');
  const dateEndInput = document.getElementById('booking-date-end');
  const timeEndInput = document.getElementById('booking-time-end');
  const rangeHint = document.getElementById('booking-range-hint');
  const guestsInput = document.getElementById('booking-guests');
  const estimateEl = document.getElementById('booking-estimate');
  const successEl = document.getElementById('booking-success');

  const today = new Date().toISOString().split('T')[0];
  dateStartInput.setAttribute('min', today);
  dateEndInput.setAttribute('min', today);

  let selectedSpaces = ['piscina'];

  function getTurns() {
    const t = readJSON('quinta_turns', null);
    return (t && t.length ? t.filter(x => x.active !== false) : TURNS_FALLBACK);
  }
  function turnSpansOvernight(t) {
    return !!(t && t.startTime && t.endTime && bookingToMin(t.endTime) <= bookingToMin(t.startTime));
  }

  function refreshTurns() {
    const turns = getTurns().filter(t => {
      if (!t.spaces || !t.spaces.length) return true;
      return selectedSpaces.some(s => t.spaces.includes(s));
    });
    const list = turns.length ? turns : getTurns();
    const prev = turnSel.value;
    turnSel.innerHTML = list.map(t => {
      const over = turnSpansOvernight(t);
      return `<option value="${t.id}">${t.name || t.shortName} (${t.startTime}–${t.endTime}${over ? ' +1 día' : ''})</option>`;
    }).join('');
    if ([...turnSel.options].some(o => o.value === prev)) turnSel.value = prev;
    else if (list.length && !turnSel.value) turnSel.value = list[0].id;
  }

  /* El preset rellena inicio/fin; el cliente siempre puede ajustarlos a mano */
  function applyPreset() {
    const t = getTurns().find(x => x.id === turnSel.value);
    if (!t) return;
    if (!dateStartInput.value) dateStartInput.value = today;
    timeStartInput.value = t.startTime || '10:00';
    timeEndInput.value = t.endTime || '18:00';
    dateEndInput.value = turnSpansOvernight(t) ? bookingAddDays(dateStartInput.value, 1) : dateStartInput.value;
    paintRangeHint();
  }

  function paintRangeHint() {
    if (!rangeHint) return;
    const r = bookingEntries(dateStartInput.value, timeStartInput.value, dateEndInput.value, timeEndInput.value);
    if (r.error) { rangeHint.textContent = ''; return; }
    const totalH = r.entries.reduce((a, e) => a + bookingEntryHours(e), 0);
    rangeHint.textContent = r.entries.length > 1
      ? `Abarca ${r.entries.length} días (${r.entries[0].date} → ${r.entries[r.entries.length - 1].date}) · ${totalH} h en total`
      : `Dentro del mismo día · ${totalH} h`;
  }

  spacePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const v = pill.getAttribute('data-booking-space');
      if (v === 'ambos') {
        selectedSpaces = ['piscina', 'salon'];
        spacePills.forEach(p => p.classList.toggle('active', p.getAttribute('data-booking-space') === 'ambos'));
      } else {
        spacePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedSpaces = [v];
      }
      refreshTurns();
      updateEstimate();
    });
  });

  function currentRange() {
    return bookingEntries(dateStartInput.value, timeStartInput.value, dateEndInput.value, timeEndInput.value);
  }

  function estimateTotal() {
    // Usa las reglas del panel si existen; si no, devuelve null ("a convenir").
    // Precio por tramo diario (cada día con sus horas y su feriado).
    try {
      const spaces = readJSON('quinta_spaces', null);
      const turns = readJSON('quinta_turns', null);
      const rules = readJSON('quinta_pricing_rules', null);
      const holidays = readJSON('quinta_holidays', []);
      if (!spaces || !turns || !rules) return null;
      const range = currentRange();
      if (range.error) return null;
      const guests = Math.max(1, parseInt(guestsInput.value) || 30);
      const sorted = rules.filter(r => r.active !== false).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      let total = 0, matched = false;
      range.entries.forEach(ent => {
        const dow = new Date(ent.date + 'T00:00:00').getDay();
        const hrs = bookingEntryHours(ent);
        const hol = (holidays || []).filter(h => h.active !== false).find(h => h.date === ent.date);
        const holExtra = hol ? (hol.surcharge || 0) : 0;
        selectedSpaces.forEach(sid => {
          let price = 0, hit = false;
          for (const rule of sorted) {
            const c = rule.conditions || {};
            if (c.spaces && c.spaces.length && !c.spaces.includes(sid)) continue;
            if (c.turns && c.turns.length && !c.turns.includes(turnSel.value)) continue;
            if (c.daysOfWeek && c.daysOfWeek.length && !c.daysOfWeek.includes(dow)) continue;
            if (c.specificDates && c.specificDates.length && !c.specificDates.includes(ent.date)) continue;
            if (c.dateRange && c.dateRange.from && c.dateRange.to && (ent.date < c.dateRange.from || ent.date > c.dateRange.to)) continue;
            if (c.guestRange && (guests < (c.guestRange.min || 0) || guests > (c.guestRange.max || 9999))) continue;
            if (c.minDuration && hrs < c.minDuration) continue;
            const pr = rule.pricing || {};
            if ((pr.type || 'fixed') === 'hourly') price = Math.round((pr.perHour || 0) * hrs);
            else if (pr.type === 'per_person') price = Math.round((pr.perPerson || 0) * guests);
            else price = pr.basePrice || 0;
            (rule.discounts || []).forEach(d => { if (d.percent && (!d.days || d.days.includes(dow))) price = Math.round(price * (1 - d.percent / 100)); });
            (rule.surcharges || []).forEach(s => { if (s.fixed) price += s.fixed; else if (s.percent) price = Math.round(price * (1 + s.percent / 100)); });
            hit = true; break;
          }
          if (holExtra > 0) price += holExtra;
          if (hit || holExtra > 0) matched = true;
          total += price;
        });
      });
      return matched ? total : null;
    } catch (e) { return null; }
  }

  function updateEstimate() {
    paintRangeHint();
    const t = estimateTotal();
    estimateEl.textContent = t == null ? 'Gs. — (a convenir)' : 'Gs. ' + t.toLocaleString('es-PY');
    if (typeof refreshDepositBox === 'function') refreshDepositBox(t);
  }

  turnSel.addEventListener('change', () => { applyPreset(); updateEstimate(); });
  [dateStartInput, timeStartInput, dateEndInput, timeEndInput].forEach(el => {
    el.addEventListener('change', updateEstimate);
  });
  guestsInput.addEventListener('input', updateEstimate);

  refreshTurns();
  if (!dateStartInput.value) dateStartInput.value = today;
  if (!dateEndInput.value) dateEndInput.value = today;
  applyPreset();
  updateEstimate();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (bookingSubmitting) return; // anti doble envío
    bookingSubmitting = true;
    const done = () => { bookingSubmitting = false; };
    const name = document.getElementById('booking-name').value.trim();
    const phone = document.getElementById('booking-phone').value.trim();
    const turnId = turnSel.value;
    const guests = Math.max(1, parseInt(guestsInput.value) || 30);
    const notes = document.getElementById('booking-notes').value.trim();

    if (!name || !phone) {
      alert('Completá nombre y teléfono.');
      done(); return;
    }
    const range = currentRange();
    if (range.error) { alert(range.error); done(); return; }
    if (range.entries[0].date < today) {
      alert('La fecha de inicio debe ser hoy o posterior.');
      done(); return;
    }
    const termsCfg = readTermsConfig();
    const termsChecked = document.getElementById('booking-terms-check')?.checked;
    if (termsCfg.active && termsCfg.body && !termsChecked) {
      alert('Debés aceptar el Reglamento y Condiciones de Uso para continuar.');
      document.getElementById('booking-terms-block')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      done(); return;
    }

    const total = estimateTotal() || 0;
    // Opción B: seña (opcional, no altera el flujo normal si no se elige)
    const wantDeposit = document.getElementById('booking-deposit-check')?.checked;
    const depCfg = readDepositConfig();
    let depAmount = 0, depMethod = '', depDate = '', depFile = null;
    if (wantDeposit) {
      if (!depCfg.active) { alert('El pago de seña no está habilitado por el momento.'); done(); return; }
      depAmount = calcDepositClient(total);
      if (!(depAmount > 0)) { alert('El monto de la seña se confirma por WhatsApp (estimado a convenir). Envía tu solicitud sin seña por ahora.'); done(); return; }
      depMethod = document.getElementById('booking-deposit-method')?.value || '';
      depDate = document.getElementById('booking-deposit-date')?.value || '';
      depFile = pendingDepositFile;
      if (!depMethod || !depDate) { alert('Completá método y fecha del pago de seña.'); done(); return; }
      if (!depFile) { alert('Adjuntá el comprobante de la seña.'); done(); return; }
    }
    const turnName = turnSel.options[turnSel.selectedIndex]?.text || turnId;
    const spaceNames = selectedSpaces.map(s => s === 'salon' ? 'Salón Climatizado' : 'Piscina').join(' + ');

    // Aviso si ya hay reservas que BLOQUEAN (confirmadas) en algún tramo, con horas exactas
    let hasBlocking = false;
    try {
      const res = readJSON('quinta_reservations_v2', []);
      const rss = readJSON('quinta_reservation_spaces', []);
      const turnsDb = readJSON('quinta_turns', []);
      const BLOCK = ['confirmada', 'pagado_parcial', 'pagado', 'en_curso'];
      const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
      const rsInterval = (rs) => {
        const t = turnsDb.find(x => x.id === rs.turnId) || {};
        const s = toMin(rs.customStart || t.startTime);
        let e = toMin(rs.customEnd || t.endTime);
        if (!(e > s)) e += 24 * 60;
        return [s, e];
      };
      hasBlocking = range.entries.some(ent => {
        const aS = bookingToMin(ent.cs), aE = ent.ce === '24:00' ? 24 * 60 : bookingToMin(ent.ce);
        return rss.some(rs => {
          if (!selectedSpaces.includes(rs.spaceId) || rs.date !== ent.date) return false;
          const st = String((res.find(r => r.id === rs.reservationId) || {}).status || '').toLowerCase();
          if (!BLOCK.includes(st)) return false;
          const [bS, bE] = rsInterval(rs);
          return Math.max(aS, bS) < Math.min(aE, bE);
        });
      });
    } catch (err) { /* ante duda, se registra igual */ }

    // Guardar solicitud (NO bloquea: queda pendiente hasta el pago)
    try {
      const RKEY = 'quinta_reservations_v2', SKEY = 'quinta_reservation_spaces';
      const list = readJSON(RKEY, []);
      const slist = readJSON(SKEY, []);
      const id = 'web-' + Date.now();
      list.unshift({
        id, clientName: name, phone, email: '',
        status: 'solicitud', source: 'reserva-web',
        totalPrice: total, paidAmount: 0, balance: total,
        discount: 0, guests, notes,
        termsAccepted: !!(termsCfg.active && termsCfg.body),
        termsVersion: (termsCfg.active && termsCfg.body) ? termsCfg.version : '',
        termsAcceptedAt: (termsCfg.active && termsCfg.body) ? new Date().toISOString() : '',
        createdBy: 'web-cliente', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      range.entries.forEach(ent => selectedSpaces.forEach(sid => slist.push({
        id: 'rs-' + Date.now() + '-' + sid + '-' + ent.date, reservationId: id,
        spaceId: sid, turnId, date: ent.date, price: 0, customStart: ent.cs, customEnd: ent.ce
      })));
      localStorage.setItem(RKEY, JSON.stringify(list));
      localStorage.setItem(SKEY, JSON.stringify(slist));
      if (wantDeposit) {
        const DKEY = 'quinta_deposits';
        const dlist = JSON.parse(localStorage.getItem(DKEY) || '[]');
        if (dlist.some(d => d.reservationId === id)) { alert('Tu comprobante ya fue enviado.'); done(); return; }
        dlist.unshift({
          id: 'dep-' + Date.now(), reservationId: id,
          amount: depAmount, method: depMethod, payDate: depDate,
          receipt: depFile.dataUrl, status: 'PENDIENTE_VERIFICACION',
          attempts: [{ receipt: depFile.dataUrl, sentAt: new Date().toISOString(), name: depFile.name, clientName: name }],
          sentAt: new Date().toISOString(), verifiedBy: '', verifiedAt: '', rejectReason: '',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        localStorage.setItem(DKEY, JSON.stringify(dlist));
        pendingDepositFile = null;
      }
    } catch (err) { console.warn('No se pudo guardar la solicitud local:', err); }

    const first = range.entries[0], last = range.entries[range.entries.length - 1];
    const rangeTxt = range.entries.length > 1
      ? `Desde ${first.date} ${first.cs} hasta ${last.date} ${last.ce} (${range.entries.length} días)`
      : `${first.date} de ${first.cs} a ${last.ce}`;
    const msg = `¡Hola Quinta Javy'aha! 🌿 Soy *${name}* (${phone}).\nQuiero solicitar una reserva (web):\n` +
      `📍 Espacio: ${spaceNames}\n📅 ${rangeTxt}\n⏰ Referencia: ${turnName}\n` +
      `👥 Invitados: ${guests}\n💰 Estimado web: ${total ? 'Gs. ' + total.toLocaleString('es-PY') : 'a convenir'}\n` +
      (notes ? `📝 ${notes}\n` : '') +
      (hasBlocking ? `\n(Veo que podría haber otra reserva ese día; igual envío mi solicitud.)\n` : '') +
      ((termsCfg.active && termsCfg.body) ? `✅ Reglamento aceptado (${termsCfg.version}).\n` : '') +
      (wantDeposit ? `💵 Seña: Gs. ${depAmount.toLocaleString('es-PY')} por ${depMethod} el ${depDate} (comprobante enviado, pendiente de verificación).\n` : '') +
      `Entiendo que la fecha se bloquea al abonar la seña. ¡Gracias!`;
    window.open(`https://wa.me/595972783547?text=${encodeURIComponent(msg)}`, '_blank');

    successEl.textContent = wantDeposit
      ? 'Comprobante enviado correctamente. Tu pago se encuentra pendiente de verificación. Te notificaremos cuando sea validado. La fecha aún no está bloqueada.'
      : successEl.textContent;
    successEl.classList.remove('hidden');
    form.reset();
    document.getElementById('booking-guests').value = 30;
    const depCheck = document.getElementById('booking-deposit-check');
    if (depCheck) { depCheck.checked = false; }
    document.getElementById('booking-deposit-box')?.classList.add('hidden');
    document.getElementById('booking-deposit-preview')?.classList.add('hidden');
    document.getElementById('booking-deposit-error')?.classList.add('hidden');
    const depFileInput = document.getElementById('booking-deposit-file');
    if (depFileInput) depFileInput.value = '';
    selectedSpaces = ['piscina'];
    spacePills.forEach(p => p.classList.toggle('active', p.getAttribute('data-booking-space') === 'piscina'));
    refreshTurns();
    updateEstimate();
    bookingSubmitting = false;
    setTimeout(() => successEl.classList.add('hidden'), 9000);
  });
}

/* ==========================================================================
   9. Seña del cliente (opt-in) + comprobante + consulta de solicitud
   ========================================================================== */
const DEPOSIT_MAX_BYTES = 900 * 1024;
let pendingDepositFile = null; // { dataUrl, name }
let bookingSubmitting = false;

function readDepositConfig() {
  const fb = { active: true, mode: 'percent', percent: 50, fixed: 0, bank: '', holder: '', account: '', alias: '', methods: ['Transferencia', 'Efectivo'], instructions: '' };
  try {
    const s = JSON.parse(localStorage.getItem('quinta_settings') || 'null');
    return Object.assign(fb, (s && s.deposit) || {});
  } catch (e) { return fb; }
}
function calcDepositClient(total) {
  const cfg = readDepositConfig();
  if (!cfg.active || !(total > 0)) return 0;
  if (cfg.mode === 'fixed') return Math.max(0, parseInt(cfg.fixed) || 0);
  const pct = Math.min(100, Math.max(0, parseFloat(cfg.percent) || 50));
  return Math.round(total * pct / 100);
}
function refreshDepositBox(total) {
  const block = document.getElementById('booking-deposit-block');
  if (!block) return;
  const cfg = readDepositConfig();
  const amountEl = document.getElementById('booking-deposit-amount');
  const dataEl = document.getElementById('booking-deposit-data');
  const methodSel = document.getElementById('booking-deposit-method');
  if (!cfg.active) { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  const amt = calcDepositClient(total || 0);
  amountEl.textContent = amt > 0 ? 'Gs. ' + amt.toLocaleString('es-PY') : 'Gs. — (a convenir)';
  const rows = [];
  if (cfg.bank) rows.push(`<div><strong>Banco:</strong> ${cfg.bank}</div>`);
  if (cfg.holder) rows.push(`<div><strong>Titular:</strong> ${cfg.holder}</div>`);
  if (cfg.account) rows.push(`<div><strong>Cuenta:</strong> ${cfg.account}</div>`);
  if (cfg.alias) rows.push(`<div><strong>Alias:</strong> ${cfg.alias}</div>`);
  rows.push(`<div class="text-gray-500">${cfg.instructions || 'Adjuntá el comprobante luego de pagar.'}</div>`);
  dataEl.innerHTML = rows.join('');
  const methods = (cfg.methods && cfg.methods.length ? cfg.methods : ['Transferencia']);
  const prev = methodSel.value;
  methodSel.innerHTML = methods.map(m => `<option>${m}</option>`).join('');
  if ([...methodSel.options].some(o => o.value === prev)) methodSel.value = prev;
  const dateInput = document.getElementById('booking-deposit-date');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
}
/* Validación real: MIME + magic bytes (no solo extensión) + tamaño */
function validateReceiptFile(file) {
  return new Promise((resolve) => {
    const err = (m) => resolve({ ok: false, error: m });
    if (!file) return err('Seleccioná una imagen del comprobante.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) return err('Formato inválido. Usá JPG, PNG o WebP.');
    if (file.size > DEPOSIT_MAX_BYTES) return err('Archivo muy pesado (máx. 900KB). Comprimí la foto.');
    if (file.size === 0) return err('El archivo está vacío.');
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const bytes = new Uint8Array(rd.result);
        const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
        const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x57 &&
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
        if (!isJpeg && !isPng && !isWebp) return err('El archivo no es una imagen válida.');
        const rd2 = new FileReader();
        rd2.onload = () => resolve({ ok: true, dataUrl: rd2.result, name: file.name });
        rd2.readAsDataURL(file);
      } catch (e) { err('No se pudo leer el archivo.'); }
    };
    rd.onerror = () => err('No se pudo leer el archivo.');
    rd.readAsArrayBuffer(file.slice(0, 12));
  });
}
/* Reglamento: render liviano (títulos, negrita, listas, separadores) + aceptación */
function readTermsConfig() {
  const fb = { active: true, version: 'v1.0', title: 'Reglamento y Condiciones de Uso', checkboxLabel: 'Declaro haber leído y acepto el reglamento.', body: '' };
  try {
    const s = JSON.parse(localStorage.getItem('quinta_settings') || 'null');
    return Object.assign(fb, (s && s.terms) || {});
  } catch (e) { return fb; }
}
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderTermsBody(src) {
  const lines = String(src || '').split('\n');
  let html = '', inList = null;
  const closeList = () => { if (inList) { html += inList === 'ul' ? '</ul>' : '</ol>'; inList = null; } };
  const inline = (t) => escHtml(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  lines.forEach(raw => {
    const line = raw.trim();
    if (/^---+$/.test(line)) { closeList(); html += '<hr>'; return; }
    let m = line.match(/^(#{1,3})\s+(.*)/);
    if (m) { closeList(); const lvl = m[1].length; html += `<h${lvl}>${inline(m[2])}</h${lvl}>`; return; }
    m = line.match(/^[*\-]\s+(.*)/);
    if (m) { if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; } html += `<li>${inline(m[1])}</li>`; return; }
    m = line.match(/^(\d+)[.)]\s+(.*)/);
    if (m) { if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; } html += `<li>${inline(m[2])}</li>`; return; }
    if (!line) { closeList(); return; }
    closeList(); html += `<p>${inline(line)}</p>`;
  });
  closeList();
  return html;
}
function initTermsClient() {
  const block = document.getElementById('booking-terms-block');
  if (!block) return;
  const cfg = readTermsConfig();
  if (!cfg.active || !cfg.body) { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  document.getElementById('booking-terms-title').textContent = cfg.title;
  document.getElementById('booking-terms-body').innerHTML = renderTermsBody(cfg.body);
  document.getElementById('booking-terms-label').textContent = '☐ ' + cfg.checkboxLabel;
}
function initDepositClient() {
  const check = document.getElementById('booking-deposit-check');
  const box = document.getElementById('booking-deposit-box');
  const fileInput = document.getElementById('booking-deposit-file');
  const errEl = document.getElementById('booking-deposit-error');
  const prevWrap = document.getElementById('booking-deposit-preview');
  const prevImg = document.getElementById('booking-deposit-img');
  if (!check || !box) return;

  refreshDepositBox(null);
  check.addEventListener('change', () => {
    box.classList.toggle('hidden', !check.checked);
    if (check.checked) {
      const est = document.getElementById('booking-estimate')?.textContent || '';
      refreshDepositBox(null);
    }
  });
  document.getElementById('booking-deposit-remove')?.addEventListener('click', () => {
    pendingDepositFile = null;
    fileInput.value = '';
    prevWrap.classList.add('hidden');
    errEl.classList.add('hidden');
  });
  fileInput?.addEventListener('change', async () => {
    errEl.classList.add('hidden');
    prevWrap.classList.add('hidden');
    pendingDepositFile = null;
    const f = fileInput.files?.[0];
    if (!f) return;
    errEl.textContent = 'Verificando imagen…';
    errEl.classList.remove('hidden');
    const r = await validateReceiptFile(f);
    if (!r.ok) {
      errEl.textContent = r.error;
      fileInput.value = '';
      return;
    }
    pendingDepositFile = { dataUrl: r.dataUrl, name: r.name };
    errEl.classList.add('hidden');
    prevImg.src = r.dataUrl;
    prevWrap.classList.remove('hidden');
  });
}
function clientStatusLabel(s) {
  const m = { solicitud: 'Recibida', pendiente: 'Pendiente', confirmada: 'Confirmada', pagado_parcial: 'Señada parcialmente', pagado: 'Pagada', en_curso: 'En curso', finalizada: 'Finalizada', cancelada: 'Cancelada' };
  return m[String(s || '').toLowerCase()] || s;
}
function clientDepositBadge(st) {
  const map = {
    'NO_APLICA': '<span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-gray-100 text-gray-500">Sin seña</span>',
    'PENDIENTE_VERIFICACION': '<span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-amber-100 text-amber-800">Pendiente de verificación</span>',
    'VERIFICADO': '<span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-emerald-100 text-emerald-800">Seña verificada</span>',
    'RECHAZADO': '<span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-red-100 text-red-700">Seña rechazada</span>'
  };
  return map[st] || map['NO_APLICA'];
}
function normPhone(p) { return String(p || '').replace(/[^0-9]/g, ''); }
function phonesMatch(a, b) {
  a = normPhone(a); b = normPhone(b);
  if (!a || !b || a.length < 7 || b.length < 7) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}
function findClientReservations(phone, dateStr) {
  try {
    const list = JSON.parse(localStorage.getItem('quinta_reservations_v2') || '[]');
    const rss = JSON.parse(localStorage.getItem('quinta_reservation_spaces') || '[]');
    const deps = JSON.parse(localStorage.getItem('quinta_deposits') || '[]');
    return list
      .filter(r => phonesMatch(r.phone, phone))
      .filter(r => {
        const dates = rss.filter(x => x.reservationId === r.id).map(x => x.date);
        if (r.date) dates.push(r.date);
        return !dateStr || dates.includes(dateStr);
      })
      .map(r => ({ r, dep: deps.find(d => d.reservationId === r.id) || null }));
  } catch (e) { return []; }
}
function initLookup() {
  const btn = document.getElementById('lookup-btn');
  const out = document.getElementById('lookup-result');
  if (!btn || !out) return;
  btn.addEventListener('click', () => {
    const phone = document.getElementById('lookup-phone').value.trim();
    const date = document.getElementById('lookup-date').value;
    if (!phone) { out.innerHTML = '<p class="text-xs font-bold text-red-600">Ingresá tu teléfono.</p>'; return; }
    const found = findClientReservations(phone, date);
    if (!found.length) { out.innerHTML = '<p class="text-xs text-gray-500 bg-gray-50 border rounded-xl p-4">No encontramos solicitudes con esos datos en este dispositivo. Si reservaste desde otro teléfono o navegador, escribinos por WhatsApp.</p>'; return; }
    out.innerHTML = found.map(({ r, dep }) => {
      const st = dep ? dep.status : 'NO_APLICA';
      let next = '';
      if (!dep) {
        next = '<p class="text-xs text-gray-500 mt-1">Aún no pagaste seña. Podés hacerlo desde una nueva solicitud o coordinar por WhatsApp.</p>';
      } else if (st === 'PENDIENTE_VERIFICACION') {
        next = '<p class="text-xs text-amber-700 mt-1 font-bold">Comprobante enviado correctamente. Tu pago se encuentra pendiente de verificación. Te notificaremos cuando sea validado.</p>';
      } else if (st === 'VERIFICADO') {
        next = '<p class="text-xs text-emerald-700 mt-1 font-bold">¡Seña verificada! Tu reserva está confirmada. 🎉</p>';
      } else if (st === 'RECHAZADO') {
        next = `<p class="text-xs text-red-700 mt-1">Tu comprobante fue rechazado. Motivo: <b>${dep.rejectReason || ''}</b>. Podés reenviarlo abajo (se conserva el anterior).</p>
        <div class="flex flex-col sm:flex-row gap-2 mt-2">
          <input type="file" id="resend-file-${r.id}" accept="image/jpeg,image/png,image/webp" class="text-xs bg-white border border-gray-300 rounded-xl px-3 py-2">
          <button type="button" onclick="resendDeposit('${r.id}')" class="px-4 py-2 rounded-xl bg-forest-800 text-white text-xs font-bold">Reenviar comprobante</button>
        </div>
        <p id="resend-err-${r.id}" class="hidden text-xs font-bold text-red-600 mt-1"></p>`;
      }
      return `<div class="bg-gray-50 border rounded-2xl p-4 text-sm space-y-1">
        <div class="flex flex-wrap items-center gap-2"><b>${r.clientName}</b><span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-sky-100 text-sky-800">${clientStatusLabel(r.status)}</span>${clientDepositBadge(st)}</div>
        <div class="text-xs text-gray-500">Monto total: <b>${r.totalPrice ? 'Gs. ' + r.totalPrice.toLocaleString('es-PY') : 'a convenir'}</b>${dep ? ` · Seña: <b>Gs. ${dep.amount.toLocaleString('es-PY')}</b>` : ''}</div>
        ${next}
      </div>`;
    }).join('');
  });
}
async function resendDeposit(resId) {
  const input = document.getElementById(`resend-file-${resId}`);
  const errEl = document.getElementById(`resend-err-${resId}`);
  const f = input?.files?.[0];
  const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.classList.remove('hidden'); } else alert(m); };
  if (!f) return showErr('Seleccioná la imagen del comprobante.');
  const v = await validateReceiptFile(f);
  if (!v.ok) return showErr(v.error);
  try {
    const list = JSON.parse(localStorage.getItem('quinta_deposits') || '[]');
    const d = list.find(x => x.reservationId === resId);
    if (!d) return showErr('No hay seña para reenviar.');
    if (d.status !== 'RECHAZADO') return showErr('Solo se puede reenviar si fue rechazada.');
    d.attempts = d.attempts || [];
    d.attempts.push({ receipt: v.dataUrl, sentAt: new Date().toISOString(), name: v.name });
    d.receipt = v.dataUrl;
    d.status = 'PENDIENTE_VERIFICACION';
    d.sentAt = new Date().toISOString();
    d.rejectReason = '';
    localStorage.setItem('quinta_deposits', JSON.stringify(list));
    document.getElementById('lookup-btn').click();
    alert('Comprobante reenviado. Quedó pendiente de verificación.');
  } catch (e) { showErr('No se pudo guardar. Probá de nuevo.'); }
}

/* ==========================================================================
   10. Encuesta de satisfacción post-evento
   ========================================================================== */
function initSurveyForm() {
  const form = document.getElementById('survey-form');
  if (!form) return;

  const dims = form.querySelectorAll('[data-survey-dim]');
  const ratings = {};
  dims.forEach(wrap => {
    const key = wrap.getAttribute('data-survey-dim');
    ratings[key] = 0;
    const box = wrap.querySelector('div');
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '★';
      b.setAttribute('aria-label', `${i} de 5`);
      b.className = 'w-10 h-10 rounded-xl border border-gray-300 text-xl text-gray-300 transition hover:scale-110';
      b.addEventListener('click', () => {
        ratings[key] = i;
        [...box.children].forEach((c, idx) => {
          c.classList.toggle('text-amber-400', idx < i);
          c.classList.toggle('border-amber-400', idx < i);
          c.classList.toggle('bg-amber-50', idx < i);
          c.classList.toggle('text-gray-300', idx >= i);
        });
      });
      box.appendChild(b);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('survey-name').value.trim();
    const eventDate = document.getElementById('survey-date').value;
    const spaceVal = document.getElementById('survey-space').value;
    const comment = document.getElementById('survey-comment').value.trim();

    if (!name || !eventDate) {
      alert('Completá tu nombre y la fecha del evento.');
      return;
    }
    const missing = Object.entries(ratings).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      alert('Calificá todos los aspectos del 1 al 5, por favor.');
      return;
    }

    try {
      const KEY = 'quinta_surveys';
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      list.unshift({
        id: 'sur-' + Date.now(),
        name, eventDate,
        spaceId: spaceVal === 'ambos' ? null : spaceVal,
        spacesLabel: spaceVal === 'ambos' ? 'Piscina + Salón' : (spaceVal === 'salon' ? 'Salón Climatizado' : 'Piscina'),
        ratings: { ...ratings },
        comment, createdAt: new Date().toISOString()
      });
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (err) { console.warn('No se pudo guardar la encuesta:', err); }

    document.getElementById('survey-success').classList.remove('hidden');
    form.reset();
    Object.keys(ratings).forEach(k => ratings[k] = 0);
    dims.forEach(wrap => {
      [...wrap.querySelector('div').children].forEach(c => {
        c.classList.remove('text-amber-400', 'border-amber-400', 'bg-amber-50');
        c.classList.add('text-gray-300');
      });
    });
    setTimeout(() => document.getElementById('survey-success').classList.add('hidden'), 9000);
  });
}

/* ==========================================================================
   8. Reserva en vivo: progreso del cliente visible para el administrador
   (mismo navegador/dispositivo vía localStorage + BroadcastChannel;
   no bloquea fechas, expira solo por TTL)
   ========================================================================== */
const BOOKING_LIVE_KEY = 'quinta_booking_live';
let bookingSessionId = null;
let bookingLastPush = 0;

function getBookingSessionId() {
  if (!bookingSessionId) {
    bookingSessionId = 'cli-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }
  return bookingSessionId;
}

function pushBookingProgress() {
  const form = document.getElementById('booking-form');
  if (!form) return;
  const now = Date.now();
  if (now - bookingLastPush < 1500) return; // throttle
  bookingLastPush = now;

  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const checks = [
    !!val('booking-name'),
    !!val('booking-phone'),
    !!val('booking-date'),
    !!document.getElementById('booking-turn')?.value,
    document.querySelectorAll('[data-booking-space].active').length > 0,
    !!val('booking-guests'),
    !!val('booking-date-end')
  ];
  const done = checks.filter(Boolean).length;
  const percent = Math.round((done / checks.length) * 100);
  const step = percent < 20 ? 1 : percent < 40 ? 2 : percent < 60 ? 3 : percent < 80 ? 4 : 5;

  const activePills = [...document.querySelectorAll('[data-booking-space].active')]
    .map(p => p.getAttribute('data-booking-space'));
  const spaceIds = activePills.includes('ambos') ? ['piscina', 'salon']
    : activePills.filter(v => v === 'piscina' || v === 'salon');

  const entry = {
    name: val('booking-name'),
    step, steps: 7, percent,
    spaceIds,
    turnId: document.getElementById('booking-turn')?.value || null,
    date: val('booking-date'),
    endDate: val('booking-date-end'),
    guests: Math.max(1, parseInt(val('booking-guests')) || 30),
    customStart: val('booking-time-start') || null,
    customEnd: val('booking-time-end') || null,
    serviceIds: [],
    discount: 0,
    updatedAt: now
  };

  try {
    const map = JSON.parse(localStorage.getItem(BOOKING_LIVE_KEY) || '{}');
    if (!entry.name && !entry.date && percent < 15) {
      delete map[getBookingSessionId()];
    } else {
      map[getBookingSessionId()] = entry;
    }
    localStorage.setItem(BOOKING_LIVE_KEY, JSON.stringify(map));
  } catch (e) { /* almacenamiento no disponible */ }
}

function clearBookingProgress() {
  try {
    const map = JSON.parse(localStorage.getItem(BOOKING_LIVE_KEY) || '{}');
    delete map[getBookingSessionId()];
    localStorage.setItem(BOOKING_LIVE_KEY, JSON.stringify(map));
    if ('BroadcastChannel' in window) {
      new BroadcastChannel('quinta_live').postMessage({ type: 'quinta-changed', at: Date.now() });
    }
  } catch (e) { /* noop */ }
}

function initBookingLive() {
  const form = document.getElementById('booking-form');
  if (!form) return;
  form.addEventListener('input', pushBookingProgress);
  form.addEventListener('change', pushBookingProgress);
  form.addEventListener('submit', () => setTimeout(clearBookingProgress, 1000));
  window.addEventListener('beforeunload', clearBookingProgress);
}

/* ==========================================================================
   10. Modo Mantenimiento (controlado desde el panel admin)
   ========================================================================== */
function initMaintenanceMode() {
  let maintenance = false;
  try {
    const s = localStorage.getItem('quinta_settings');
    if (s) maintenance = !!JSON.parse(s).maintenanceMode;
  } catch (e) { /* sin configuración = sitio normal */ }
  if (!maintenance) return;

  const banner = document.createElement('div');
  banner.className = 'bg-amber-100 border-b border-amber-300 text-amber-900 text-xs sm:text-sm text-center px-4 py-2.5 font-semibold';
  banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Reservas en pausa por mantenimiento. Escríbenos por WhatsApp y te avisamos al reabrir.';
  document.body.prepend(banner);

  ['contact-booking-form', 'booking-form'].forEach(fid => {
    const form = document.getElementById(fid);
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('Reservas en pausa por mantenimiento. Contáctanos por WhatsApp.');
    }, true);
    form.querySelectorAll('input, textarea, select, button[type="submit"]').forEach(el => {
      el.disabled = true;
      el.classList.add('opacity-60');
    });
  });
}

/* ==========================================================================
   1. Menú Móvil y Navegación
   ========================================================================== */
function initMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuBackdrop = document.getElementById('mobile-backdrop');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');

  if (!menuBtn || !mobileMenu) return;

  function toggleMenu() {
    const isOpen = mobileMenu.classList.contains('translate-x-0');
    if (isOpen) {
      mobileMenu.classList.remove('translate-x-0');
      mobileMenu.classList.add('translate-x-full');
      if (menuBackdrop) menuBackdrop.classList.add('hidden');
      document.body.style.overflow = '';
    } else {
      mobileMenu.classList.remove('translate-x-full');
      mobileMenu.classList.add('translate-x-0');
      if (menuBackdrop) menuBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  menuBtn.addEventListener('click', toggleMenu);
  if (menuBackdrop) menuBackdrop.addEventListener('click', toggleMenu);

  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (mobileMenu.classList.contains('translate-x-0')) {
        toggleMenu();
      }
    });
  });
}

/* ==========================================================================
   2. Cabecera con Efecto Scroll
   ========================================================================== */
function initHeaderScroll() {
  const header = document.getElementById('main-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('shadow-md', 'py-3');
      header.classList.remove('py-4');
    } else {
      header.classList.remove('shadow-md', 'py-3');
      header.classList.add('py-4');
    }
  });
}

/* ==========================================================================
   3. Cotizador Interactivo de Eventos con Salida a WhatsApp
   ========================================================================== */
function initQuoteCalculator() {
  const form = document.getElementById('quote-form');
  if (!form) return;

  // Cargar configuración de precios parametrizada desde la administración (o usar valores estándar)
  const STORAGE_KEY_PRICING = 'quinta_pricing_config';
  let dynamicPricing = null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PRICING);
    if (saved) dynamicPricing = JSON.parse(saved);
  } catch (e) {
    console.warn('Error al leer precios personalizados:', e);
  }

  // Precios base referenciales en Guaraníes (Gs.)
  const basePrices = {
    pasadia: { 
      name: 'Pasadía de Sol & Relax (9:00 a 19:00 hs)', 
      price: (dynamicPricing && dynamicPricing.basePrices && dynamicPricing.basePrices.pasadia) || 700000 
    },
    cumple: { 
      name: 'Cumpleaños / Festejo Privado (13:00 a 01:00 hs)', 
      price: (dynamicPricing && dynamicPricing.basePrices && dynamicPricing.basePrices.cumple) || 1200000 
    },
    boda_15: { 
      name: 'Boda / 15 Años Soñado (Exclusividad Completa)', 
      price: (dynamicPricing && dynamicPricing.basePrices && dynamicPricing.basePrices.boda) || 2000000 
    },
    corporativo: { 
      name: 'Encuentro Corporativo / Retiro', 
      price: (dynamicPricing && dynamicPricing.basePrices && dynamicPricing.basePrices.corporativo) || 1500000 
    }
  };

  const guestPrices = {
    '30': { 
      name: 'Hasta 30 personas', 
      extra: (dynamicPricing && dynamicPricing.guestPrices && dynamicPricing.guestPrices['30'] !== undefined) ? dynamicPricing.guestPrices['30'] : 0 
    },
    '80': { 
      name: '30 a 80 personas', 
      extra: (dynamicPricing && dynamicPricing.guestPrices && dynamicPricing.guestPrices['80'] !== undefined) ? dynamicPricing.guestPrices['80'] : 300000 
    },
    '150': { 
      name: '80 a 150 personas', 
      extra: (dynamicPricing && dynamicPricing.guestPrices && dynamicPricing.guestPrices['150'] !== undefined) ? dynamicPricing.guestPrices['150'] : 600000 
    },
    '300': { 
      name: '150 a 300+ personas', 
      extra: (dynamicPricing && dynamicPricing.guestPrices && dynamicPricing.guestPrices['300'] !== undefined) ? dynamicPricing.guestPrices['300'] : 1000000 
    }
  };

  const dayMultipliers = {
    'semana': { 
      name: 'Lunes a Jueves (Día de semana)', 
      discount: (dynamicPricing && dynamicPricing.dayMultipliers && dynamicPricing.dayMultipliers.semanaDiscount !== undefined) ? (dynamicPricing.dayMultipliers.semanaDiscount / 100) : 0.15, 
      extra: 0 
    },
    'viernes': { 
      name: 'Viernes', 
      discount: 0, 
      extra: (dynamicPricing && dynamicPricing.dayMultipliers && dynamicPricing.dayMultipliers.viernes !== undefined) ? dynamicPricing.dayMultipliers.viernes : 150000 
    },
    'finde': { 
      name: 'Sábado, Domingo o Feriado', 
      discount: 0, 
      extra: (dynamicPricing && dynamicPricing.dayMultipliers && dynamicPricing.dayMultipliers.finde !== undefined) ? dynamicPricing.dayMultipliers.finde : 300000 
    }
  };

  const extraServices = {
    'luces': { 
      name: 'Guirnaldas & Luces Cálidas Nocturnas', 
      price: (dynamicPricing && dynamicPricing.extraServices && dynamicPricing.extraServices.luces !== undefined) ? dynamicPricing.extraServices.luces : 200000 
    },
    'parrillero': { 
      name: 'Asistente de Parrilla / Asador', 
      price: (dynamicPricing && dynamicPricing.extraServices && dynamicPricing.extraServices.parrillero !== undefined) ? dynamicPricing.extraServices.parrillero : 250000 
    },
    'mobiliario': { 
      name: 'Mesas y Sillas Adicionales', 
      price: (dynamicPricing && dynamicPricing.extraServices && dynamicPricing.extraServices.mobiliario !== undefined) ? dynamicPricing.extraServices.mobiliario : 200000 
    }
  };

  // State
  let selectedEvent = 'pasadia';
  let selectedGuests = '30';
  let selectedDay = 'finde';
  let selectedExtras = [];

  // DOM Elements
  const eventPills = document.querySelectorAll('[data-quote-event]');
  const guestPills = document.querySelectorAll('[data-quote-guests]');
  const dayPills = document.querySelectorAll('[data-quote-day]');
  const extraCheckboxes = document.querySelectorAll('input[name="quote-extra"]');
  const priceDisplay = document.getElementById('calc-total-price');
  const planNameDisplay = document.getElementById('calc-plan-name');
  const whatsappQuoteBtn = document.getElementById('calc-whatsapp-btn');

  // Event Listeners for Event Type
  eventPills.forEach(pill => {
    pill.addEventListener('click', () => {
      eventPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedEvent = pill.getAttribute('data-quote-event');
      updateCalculation();
    });
  });

  // Event Listeners for Guests
  guestPills.forEach(pill => {
    pill.addEventListener('click', () => {
      guestPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedGuests = pill.getAttribute('data-quote-guests');
      updateCalculation();
    });
  });

  // Event Listeners for Day
  dayPills.forEach(pill => {
    pill.addEventListener('click', () => {
      dayPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedDay = pill.getAttribute('data-quote-day');
      updateCalculation();
    });
  });

  // Extras
  extraCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      selectedExtras = Array.from(extraCheckboxes)
        .filter(i => i.checked)
        .map(i => i.value);
      updateCalculation();
    });
  });

  function formatGs(amount) {
    return 'Gs. ' + amount.toLocaleString('es-PY');
  }

  // Motor nuevo: usa espacios/turnos/reglas del panel admin si existen.
  // Mapea la selección pública a espacios + turno + fecha representativa.
  function computeQuoteNew() {
    try {
      const spaces = JSON.parse(localStorage.getItem('quinta_spaces') || 'null');
      const turns = JSON.parse(localStorage.getItem('quinta_turns') || 'null');
      const rules = JSON.parse(localStorage.getItem('quinta_pricing_rules') || 'null');
      const services = JSON.parse(localStorage.getItem('quinta_services') || 'null');
      const holidays = JSON.parse(localStorage.getItem('quinta_holidays') || '[]');
      if (!spaces || !turns || !rules) return null;

      const eventMap = {
        pasadia: { spaces: ['piscina'], turn: 'dia_completo' },
        cumple: { spaces: ['salon', 'piscina'], turn: 'noche' },
        boda_15: { spaces: ['salon', 'piscina'], turn: 'dia_completo' },
        corporativo: { spaces: ['salon'], turn: 'dia_completo' }
      };
      const guestCount = { '30': 30, '80': 80, '150': 150, '300': 300 }[selectedGuests] || 30;
      const dayDow = { semana: 2, viernes: 5, finde: 6 }[selectedDay] ?? 6;
      // Fecha representativa real (próximo día de ese tipo) para que apliquen temporadas/fechas
      const t = new Date(); let add = 0;
      while (new Date(t.getFullYear(), t.getMonth(), t.getDate() + add).getDay() !== dayDow) add++;
      const ref = new Date(t.getFullYear(), t.getMonth(), t.getDate() + add);
      const dateStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;
      const hol = holidays.filter(h => h.active !== false).find(h => h.date === dateStr);
      const holExtra = hol ? (hol.surcharge || 0) : 0;

      const cfg = eventMap[selectedEvent] || eventMap.pasadia;
      const spaceIds = cfg.spaces.filter(id => spaces.some(s => s.id === id && s.active !== false));
      const turn = turns.find(x => x.id === cfg.turn) || {};
      const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
      let hrs = 8;
      if (turn.startTime && turn.endTime) {
        hrs = (toMin(turn.endTime) - toMin(turn.startTime)) / 60;
        if (hrs <= 0) hrs += 24;
      }
      const sorted = rules.filter(r => r.active !== false).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      let total = 0;
      const detail = [];
      (spaceIds.length ? spaceIds : spaces.filter(s => s.active !== false).map(s => s.id)).forEach(sid => {
        const sp = spaces.find(s => s.id === sid) || {};
        let applied = null;
        for (const rule of sorted) {
          const c = rule.conditions || {};
          if (c.spaces && c.spaces.length && !c.spaces.includes(sid)) continue;
          if (c.turns && c.turns.length && !c.turns.includes(cfg.turn)) continue;
          if (c.daysOfWeek && c.daysOfWeek.length && !c.daysOfWeek.includes(dayDow)) continue;
          if (c.specificDates && c.specificDates.length && !c.specificDates.includes(dateStr)) continue;
          if (c.dateRange && c.dateRange.from && c.dateRange.to && (dateStr < c.dateRange.from || dateStr > c.dateRange.to)) continue;
          if (c.guestRange && (guestCount < (c.guestRange.min || 0) || guestCount > (c.guestRange.max || 9999))) continue;
          if (c.minDuration && hrs < c.minDuration) continue;
          applied = rule; break;
        }
        let price = sp.basePrice || 0;
        if (applied) {
          const pr = applied.pricing || {};
          if ((pr.type || 'fixed') === 'hourly') price = Math.round((pr.perHour || 0) * hrs);
          else if (pr.type === 'per_person') price = Math.round((pr.perPerson || 0) * guestCount);
          else price = pr.basePrice || 0;
          (applied.discounts || []).forEach(d => { if (d.percent && (!d.days || d.days.includes(dayDow))) price = Math.round(price * (1 - d.percent / 100)); });
          (applied.surcharges || []).forEach(s => { if (s.fixed) price += s.fixed; else if (s.percent) price = Math.round(price * (1 + s.percent / 100)); });
        }
        if (holExtra > 0) price += holExtra;
        total += price;
        detail.push(`${sp.shortName || sp.name || sid}: ${formatGs(price)}${holExtra > 0 ? ` (incl. feriado ${hol.name || ''})` : ''}`);
      });

      const extrasListNames = [];
      selectedExtras.forEach(key => {
        const svc = (services || []).find(s => s.key === key && s.active !== false);
        if (svc) { total += svc.price || 0; extrasListNames.push(svc.name); }
        else if (extraServices[key]) { total += extraServices[key].price; extrasListNames.push(extraServices[key].name); }
      });
      return { total, extrasListNames, detail, refDate: dateStr };
    } catch (e) { return null; }
  }

  function updateCalculation() {
    const fresh = computeQuoteNew();
    let total, extrasListNames;
    // Si el motor nuevo no tiene reglas o da 0, usar precios base legacy
    if (fresh && fresh.total > 0) {
      total = fresh.total;
      extrasListNames = fresh.extrasListNames;
    } else {
      total = basePrices[selectedEvent].price;
      total += guestPrices[selectedGuests].extra;

      const dayConfig = dayMultipliers[selectedDay];
      if (dayConfig.discount > 0) {
        total = Math.round(total * (1 - dayConfig.discount));
      }
      total += dayConfig.extra;

      let extrasTotal = 0;
      extrasListNames = [];
      selectedExtras.forEach(key => {
        if (extraServices[key]) {
          extrasTotal += extraServices[key].price;
          extrasListNames.push(extraServices[key].name);
        }
      });

      total += extrasTotal;
    }

    // Actualizar vista
    if (priceDisplay) {
      priceDisplay.textContent = formatGs(total);
    }
    if (planNameDisplay) {
      planNameDisplay.textContent = basePrices[selectedEvent].name;
    }

    // Construir mensaje de WhatsApp
    const eventName = basePrices[selectedEvent].name;
    const guestsName = guestPrices[selectedGuests].name;
    const dayName = dayMultipliers[selectedDay].name;
    const extrasText = extrasListNames.length > 0 ? extrasListNames.join(', ') : 'Ninguno por ahora';

    const rawMessage = `¡Hola Quinta Javy'aha Ña Juana-Irene! 🌿✨\n\nEstuve cotizando en su portal web y me gustaría consultar disponibilidad:\n\n` +
      `📍 Evento: ${eventName}\n` +
      `👥 Capacidad estimada: ${guestsName}\n` +
      `📅 Tipo de fecha: ${dayName}\n` +
      `✨ Servicios extra: ${extrasText}\n` +
      `💰 Estimado en web: ${formatGs(total)}${(fresh && fresh.total > 0) ? `\n🧾 Desglose: ${fresh.detail.join(' · ')}` : ''}\n\n` +
      `¿Tendrían fecha disponible próximamente? ¡Muchas gracias!`;

    const phone = '595972783547';
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(rawMessage)}`;

    if (whatsappQuoteBtn) {
      whatsappQuoteBtn.href = waUrl;
    }
  }

  // Inicializar cálculo al cargar
  updateCalculation();
}

/* ==========================================================================
   4. Galería Interactiva con Filtros y Lightbox
   ========================================================================== */
function initGalleryLightbox() {
  const filterBtns = document.querySelectorAll('.gallery-filter-btn');
  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightbox = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');

  if (!galleryItems.length || !lightbox) return;

  let currentIndex = 0;
  let activeVisibleItems = Array.from(galleryItems);

  // Filtrado de fotos
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('bg-emerald-800', 'text-white', 'shadow-md');
        b.classList.add('bg-white', 'text-gray-700', 'hover:bg-gray-100');
      });
      btn.classList.remove('bg-white', 'text-gray-700', 'hover:bg-gray-100');
      btn.classList.add('bg-emerald-800', 'text-white', 'shadow-md');

      const filter = btn.getAttribute('data-filter');

      galleryItems.forEach(item => {
        const category = item.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });

      activeVisibleItems = Array.from(galleryItems).filter(item => item.style.display !== 'none');
    });
  });

  // Abrir Lightbox
  galleryItems.forEach((item) => {
    item.addEventListener('click', () => {
      currentIndex = activeVisibleItems.indexOf(item);
      if (currentIndex === -1) currentIndex = 0;
      showLightbox(currentIndex);
    });
  });

  function showLightbox(index) {
    if (!activeVisibleItems[index]) return;
    const item = activeVisibleItems[index];
    const img = item.querySelector('img');
    const title = item.querySelector('h4') ? item.querySelector('h4').textContent : '';
    const desc = item.querySelector('p') ? item.querySelector('p').textContent : '';

    if (lightboxImg && img) {
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
    }
    if (lightboxCaption) {
      lightboxCaption.innerHTML = `<span class="font-bold text-lg text-white">${title}</span> <span class="text-gray-300 block text-sm mt-1">${desc}</span>`;
    }

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  function prevImage() {
    currentIndex = (currentIndex - 1 + activeVisibleItems.length) % activeVisibleItems.length;
    showLightbox(currentIndex);
  }

  function nextImage() {
    currentIndex = (currentIndex + 1) % activeVisibleItems.length;
    showLightbox(currentIndex);
  }

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxPrev) lightboxPrev.addEventListener('click', prevImage);
  if (lightboxNext) lightboxNext.addEventListener('click', nextImage);

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'ArrowRight') nextImage();
  });
}

/* ==========================================================================
   5. Acordeón de Preguntas Frecuentes (FAQ)
   ========================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    if (!header) return;

    const toggle = () => {
      const isOpen = item.classList.contains('open');

      // Cerrar otros
      faqItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.faq-header')?.setAttribute('aria-expanded', 'false');
        }
      });

      // Alternar actual
      if (isOpen) {
        item.classList.remove('open');
        header.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('open');
        header.setAttribute('aria-expanded', 'true');
      }
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

/* ==========================================================================
   6. Formulario de Contacto Rápido hacia WhatsApp y Registro de Petición
   ========================================================================== */
function initContactForm() {
  const contactForm = document.getElementById('contact-booking-form');
  if (!contactForm) return;

  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const date = document.getElementById('contact-date').value;
    const guests = document.getElementById('contact-guests').value;
    const message = document.getElementById('contact-message').value.trim();

    if (!name || !phone) {
      alert('Por favor ingresa tu nombre y número de contacto.');
      return;
    }

    // Registrar la petición en LocalStorage para que el administrador la vea en admin.html
    try {
      const STORAGE_KEY = 'quinta_reservations';
      const stored = localStorage.getItem(STORAGE_KEY);
      const list = stored ? JSON.parse(stored) : [];

      const newInquiry = {
        id: 'web-' + Date.now(),
        clientName: name,
        phone: phone,
        date: date || new Date().toISOString().split('T')[0],
        eventType: 'Consulta Web General',
        guests: guests || 'Por definir',
        estimatedPrice: 1000000,
        status: 'pendiente',
        notes: message || 'Enviado desde el formulario de contacto web.',
        createdAt: new Date().toISOString()
      };

      list.unshift(newInquiry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('Error al almacenar consulta en LocalStorage:', err);
    }

    const text = `¡Hola Quinta Javy'aha Ña Juana-Irene! 🌿\n\nMi nombre es *${name}* (${phone}).\n` +
      `Me comunico desde el portal web para consultar reserva:\n` +
      `📅 Fecha tentativa: ${date ? date : 'A coordinar'}\n` +
      `👥 Cantidad de invitados: ${guests || 'Por definir'}\n` +
      (message ? `📝 Consulta adicional: ${message}\n\n` : '\n') +
      `¿Podrían confirmarme disponibilidad y detalles? ¡Muchas gracias!`;

    const waUrl = `https://wa.me/595972783547?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  });
}

/* ==========================================================================
   7. Chequeador Rápido de Disponibilidad de Fechas (Sincronizado)
   ========================================================================== */
function initDateAvailabilityChecker() {
  const quickDateBtn = document.getElementById('quick-check-date-btn');
  const quickDateInput = document.getElementById('quick-check-date-input');

  if (!quickDateBtn || !quickDateInput) return;

  // Asignar fecha mínima hoy
  const today = new Date().toISOString().split('T')[0];
  quickDateInput.setAttribute('min', today);

  quickDateBtn.addEventListener('click', () => {
    const selectedDate = quickDateInput.value;
    if (!selectedDate) {
      quickDateInput.focus();
      return;
    }

    const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-PY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Consultar disponibilidad en LocalStorage
    let isOccupied = false;
    let isPending = false;

    try {
      const storedRes = localStorage.getItem('quinta_reservations');
      const storedBlocked = localStorage.getItem('quinta_blocked_dates');

      const reservations = storedRes ? JSON.parse(storedRes) : [];
      const blockedDates = storedBlocked ? JSON.parse(storedBlocked) : [];

      if (blockedDates.includes(selectedDate)) {
        isOccupied = true;
      } else {
        const conf = reservations.find(r => r.date === selectedDate && r.status === 'confirmada');
        if (conf) isOccupied = true;

        const pend = reservations.find(r => r.date === selectedDate && r.status === 'pendiente');
        if (pend) isPending = true;
      }
    } catch (e) {
      console.warn('Error al verificar disponibilidad local:', e);
    }

    let statusNotice = '';
    if (isOccupied) {
      statusNotice = `\n(⚠️ Nota: En el sistema figura como Ocupada, pero consulto por si hay opciones alternativas o lista de espera).`;
    } else if (isPending) {
      statusNotice = `\n(🟡 Nota: Veo en el sistema que tiene una consulta previa, quisiera confirmar si aún sigue libre).`;
    } else {
      statusNotice = `\n(🟢 Veo que figura DISPONIBLE en la web y me gustaría reservarla).`;
    }

    const msg = `¡Hola Quinta Javy'aha! 🌿\nQuisiera saber la disponibilidad para el día *${formattedDate}*.${statusNotice}\n¿Podrían confirmarme precios y horarios? ¡Gracias!`;
    const waUrl = `https://wa.me/595972783547?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  });
}

