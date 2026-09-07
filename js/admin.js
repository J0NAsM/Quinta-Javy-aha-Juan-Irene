/**
 * Quinta Javy'aha Ña Juana-Irene
 * Panel de Administración - Lógica de Gestión y Calendario
 * Carapeguá, Paraguarí, Paraguay
 */

// Claves de LocalStorage
const STORAGE_KEY_RESERVATIONS = 'quinta_reservations';
const STORAGE_KEY_BLOCKED = 'quinta_blocked_dates';
const STORAGE_KEY_PRICING = 'quinta_pricing_config';

// Estado global del administrador
let currentCalendarDate = new Date();
let reservations = [];
let blockedDates = [];
let activeFilter = 'todas';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  initCalendarNavigation();
  initReservationFilters();
  initModalHandlers();
  initAdminTabs();
  initPricingSettings();
  renderDashboard();
});

/* ==========================================================================
   1. Inicialización y Persistencia (LocalStorage)
   ========================================================================== */
function initStorage() {
  const savedReservations = localStorage.getItem(STORAGE_KEY_RESERVATIONS);
  const savedBlocked = localStorage.getItem(STORAGE_KEY_BLOCKED);

  if (savedReservations) {
    reservations = JSON.parse(savedReservations);
  } else {
    // Datos de muestra iniciales realistas para una experiencia lista para usar
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    
    // Próximo fin de semana sábado
    const nextSat = new Date();
    nextSat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
    const nextSatStr = nextSat.toISOString().split('T')[0];

    // Próximo domingo
    const nextSun = new Date(nextSat);
    nextSun.setDate(nextSat.getDate() + 1);
    const nextSunStr = nextSun.toISOString().split('T')[0];

    // Otra fecha posterior
    const laterDate = new Date(nextSat);
    laterDate.setDate(nextSat.getDate() + 14);
    const laterDateStr = laterDate.toISOString().split('T')[0];

    reservations = [
      {
        id: 'res-101',
        clientName: 'Familia Domínguez Ayala',
        phone: '0981 450 120',
        date: nextSatStr,
        eventType: 'Cumpleaños Infantil',
        guests: '40 a 80 personas',
        estimatedPrice: 1500000,
        status: 'confirmada', // 'confirmada' | 'pendiente' | 'cancelada'
        notes: 'Uso del salón climatizado con blindex y piscina. Traen su propio catering.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'res-102',
        clientName: 'Lic. Marcos Fleitas',
        phone: '0971 889 332',
        date: nextSunStr,
        eventType: 'Pasadía Familiar',
        guests: '20 a 40 personas',
        estimatedPrice: 700000,
        status: 'pendiente',
        notes: 'Consulta disponibilidad para asado de mediodía.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'res-103',
        clientName: 'Sofía & Alejandro',
        phone: '0983 214 550',
        date: laterDateStr,
        eventType: 'Boda Campestre',
        guests: '150 a 300+ personas',
        estimatedPrice: 2800000,
        status: 'confirmada',
        notes: 'Exclusividad total día y noche. Decoración con luces.',
        createdAt: new Date().toISOString()
      }
    ];
    saveReservations();
  }

  if (savedBlocked) {
    blockedDates = JSON.parse(savedBlocked);
  } else {
    // Ejemplo de fecha bloqueada por mantenimiento o uso particular
    const maintDate = new Date();
    maintDate.setDate(maintDate.getDate() + 5);
    blockedDates = [maintDate.toISOString().split('T')[0]];
    saveBlockedDates();
  }
}

function saveReservations() {
  localStorage.setItem(STORAGE_KEY_RESERVATIONS, JSON.stringify(reservations));
}

function saveBlockedDates() {
  localStorage.setItem(STORAGE_KEY_BLOCKED, JSON.stringify(blockedDates));
}

/* ==========================================================================
   2. Renderizado Completo del Dashboard
   ========================================================================== */
function renderDashboard() {
  renderKPIs();
  renderCalendar();
  renderReservationsTable();
}

function renderKPIs() {
  const currentMonth = currentCalendarDate.getMonth();
  const currentYear = currentCalendarDate.getFullYear();

  let confirmedCount = 0;
  let pendingCount = 0;
  let totalRevenue = 0;
  let occupiedDatesSet = new Set();

  reservations.forEach(r => {
    if (r.status === 'confirmada') {
      const rDate = new Date(r.date + 'T00:00:00');
      if (rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear) {
        confirmedCount++;
        totalRevenue += (r.estimatedPrice || 0);
        occupiedDatesSet.add(r.date);
      }
    } else if (r.status === 'pendiente') {
      pendingCount++;
    }
  });

  blockedDates.forEach(d => {
    const bDate = new Date(d + 'T00:00:00');
    if (bDate.getMonth() === currentMonth && bDate.getFullYear() === currentYear) {
      occupiedDatesSet.add(d);
    }
  });

  document.getElementById('kpi-confirmed').textContent = confirmedCount;
  document.getElementById('kpi-pending').textContent = pendingCount;
  document.getElementById('kpi-occupied').textContent = occupiedDatesSet.size;
  document.getElementById('kpi-revenue').textContent = 'Gs. ' + totalRevenue.toLocaleString('es-PY');

  const navBadge = document.getElementById('nav-pending-badge');
  if (navBadge) {
    navBadge.textContent = pendingCount;
  }
}

/* ==========================================================================
   3. Calendario Interactivo de Disponibilidad
   ========================================================================== */
function initCalendarNavigation() {
  document.getElementById('cal-prev-btn').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderDashboard();
  });

  document.getElementById('cal-next-btn').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderDashboard();
  });

  document.getElementById('cal-today-btn').addEventListener('click', () => {
    currentCalendarDate = new Date();
    renderDashboard();
  });
}

function renderCalendar() {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  document.getElementById('cal-month-title').textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById('cal-days-grid');
  grid.innerHTML = '';

  // Primer día del mes y cantidad de días
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Domingo
  // Ajuste para lunes como primer día de la semana (1 = Lun, 7 = Dom)
  const startingDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Días vacíos previos
  for (let i = 0; i < startingDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'min-h-[90px] sm:min-h-[105px] bg-gray-50/50 rounded-xl border border-dashed border-gray-100 p-1 opacity-40';
    grid.appendChild(emptyCell);
  }

  // Días del mes
  const todayStr = new Date().toISOString().split('T')[0];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayDate = new Date(year, month, day);
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;

    // Verificar estado de la fecha
    const isBlocked = blockedDates.includes(dateStr);
    const confirmedRes = reservations.find(r => r.date === dateStr && r.status === 'confirmada');
    const pendingRes = reservations.find(r => r.date === dateStr && r.status === 'pendiente');

    let status = 'available'; // 'available' | 'confirmed' | 'pending' | 'blocked' | 'past'
    if (isPast) {
      status = 'past';
    } else if (confirmedRes || isBlocked) {
      status = 'confirmed';
    } else if (pendingRes) {
      status = 'pending';
    }

    // Estilos según el estado
    let cardBgClass = '';
    let badgeHtml = '';

    if (status === 'past') {
      cardBgClass = 'bg-gray-100/70 border-gray-200 text-gray-400 opacity-60';
      badgeHtml = '<span class="text-[0.65rem] text-gray-400 font-medium">Pasado</span>';
    } else if (status === 'confirmed') {
      cardBgClass = 'bg-red-50/80 border-red-200 hover:border-red-400 text-red-900 shadow-sm';
      const label = isBlocked ? '🔒 No Disponible' : `🔴 ${confirmedRes.eventType || 'Ocupado'}`;
      badgeHtml = `
        <span class="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[0.65rem] font-bold truncate max-w-full">
          ${label}
        </span>
      `;
    } else if (status === 'pending') {
      cardBgClass = 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-900 shadow-sm';
      badgeHtml = `
        <span class="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[0.65rem] font-bold truncate max-w-full">
          🟡 ${pendingRes.clientName.split(' ')[0]} (Petición)
        </span>
      `;
    } else {
      cardBgClass = 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-400 text-emerald-950 shadow-sm hover:bg-emerald-100/60';
      badgeHtml = `
        <span class="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[0.65rem] font-bold">
          🟢 Disponible
        </span>
      `;
    }

    const dayCell = document.createElement('div');
    dayCell.className = `min-h-[90px] sm:min-h-[105px] p-2 rounded-xl border flex flex-col justify-between cursor-pointer transition-all duration-200 hover:scale-[1.02] ${cardBgClass}`;
    
    dayCell.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-sm ${isToday ? 'w-6 h-6 rounded-full bg-forest-800 text-white flex items-center justify-center text-xs' : ''}">
          ${day}
        </span>
        ${isToday ? '<span class="text-[0.6rem] font-extrabold uppercase text-forest-800">Hoy</span>' : ''}
      </div>
      <div class="mt-1 flex-1 flex flex-col justify-end">
        ${badgeHtml}
      </div>
    `;

    dayCell.addEventListener('click', () => {
      openDayDetailModal(dateStr, status, confirmedRes || pendingRes, isBlocked);
    });

    grid.appendChild(dayCell);
  }
}

/* ==========================================================================
   4. Modal de Detalle de Fecha y Bloqueo Manual
   ========================================================================== */
function openDayDetailModal(dateStr, status, res, isBlocked) {
  const modal = document.getElementById('day-modal');
  const title = document.getElementById('day-modal-title');
  const body = document.getElementById('day-modal-body');
  const actionsContainer = document.getElementById('day-modal-actions');

  const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-PY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  title.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  let statusBadge = '';
  if (status === 'past') {
    statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">Fecha Pasada</span>';
  } else if (isBlocked) {
    statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">🔒 Bloqueada Manualmente (No Disponible)</span>';
  } else if (res && res.status === 'confirmada') {
    statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">🔴 Reserva Confirmada (Ocupada)</span>';
  } else if (res && res.status === 'pendiente') {
    statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">🟡 Petición Web Pendiente</span>';
  } else {
    statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">🟢 Fecha Totalmente Disponible</span>';
  }

  let detailsHtml = `
    <div class="mb-4 flex items-center gap-2">
      <span class="text-xs text-gray-500 font-semibold">Estado actual:</span>
      ${statusBadge}
    </div>
  `;

  if (res) {
    detailsHtml += `
      <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2 text-sm">
        <div><strong class="text-gray-900">Cliente:</strong> ${res.clientName}</div>
        <div><strong class="text-gray-900">Teléfono:</strong> <a href="tel:${res.phone}" class="text-forest-800 underline">${res.phone}</a></div>
        <div><strong class="text-gray-900">Evento:</strong> ${res.eventType}</div>
        <div><strong class="text-gray-900">Invitados:</strong> ${res.guests || 'A confirmar'}</div>
        <div><strong class="text-gray-900">Monto Estimado:</strong> Gs. ${(res.estimatedPrice || 0).toLocaleString('es-PY')}</div>
        ${res.notes ? `<div><strong class="text-gray-900">Notas:</strong> <span class="text-gray-600">${res.notes}</span></div>` : ''}
      </div>
    `;
  } else if (isBlocked) {
    detailsHtml += `
      <p class="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-200">
        Esta fecha está marcada como <strong>No Disponible</strong> para clientes. Puedes liberarla en cualquier momento si deseas habilitar reservas.
      </p>
    `;
  } else {
    detailsHtml += `
      <p class="text-sm text-gray-600 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
        No hay reservas registradas para este día. La fecha está 100% libre para recibir eventos o pasadías.
      </p>
    `;
  }

  body.innerHTML = detailsHtml;

  // Botones de acción dinámica en el modal
  actionsContainer.innerHTML = '';

  // Si tiene reserva pendiente o confirmada
  if (res) {
    if (res.status === 'pendiente') {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn-forest px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5';
      confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
      confirmBtn.addEventListener('click', () => {
        updateReservationStatus(res.id, 'confirmada');
        closeDayDetailModal();
      });
      actionsContainer.appendChild(confirmBtn);
    }

    const waBtn = document.createElement('a');
    waBtn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5';
    waBtn.href = getWhatsAppLinkForClient(res);
    waBtn.target = '_blank';
    waBtn.innerHTML = '<i class="fa-brands fa-whatsapp text-sm"></i> WhatsApp Cliente';
    actionsContainer.appendChild(waBtn);
  }

  // Opción de Bloquear / Liberar Fecha
  if (isBlocked) {
    const unblockBtn = document.createElement('button');
    unblockBtn.className = 'bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5';
    unblockBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Liberar Fecha';
    unblockBtn.addEventListener('click', () => {
      toggleBlockDate(dateStr, false);
      closeDayDetailModal();
    });
    actionsContainer.appendChild(unblockBtn);
  } else if (!res) {
    const blockBtn = document.createElement('button');
    blockBtn.className = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5';
    blockBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Bloquear Fecha';
    blockBtn.addEventListener('click', () => {
      toggleBlockDate(dateStr, true);
      closeDayDetailModal();
    });
    actionsContainer.appendChild(blockBtn);

    const addManualBtn = document.createElement('button');
    addManualBtn.className = 'btn-forest px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5';
    addManualBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Añadir Reserva';
    addManualBtn.addEventListener('click', () => {
      closeDayDetailModal();
      openNewReservationModal(dateStr);
    });
    actionsContainer.appendChild(addManualBtn);
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeDayDetailModal() {
  const modal = document.getElementById('day-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleBlockDate(dateStr, shouldBlock) {
  if (shouldBlock) {
    if (!blockedDates.includes(dateStr)) blockedDates.push(dateStr);
    showToast(`Fecha ${dateStr} bloqueada (No disponible)`, 'info');
  } else {
    blockedDates = blockedDates.filter(d => d !== dateStr);
    showToast(`Fecha ${dateStr} liberada (Disponible)`, 'success');
  }
  saveBlockedDates();
  renderDashboard();
}

/* ==========================================================================
   5. Tabla de Solicitudes y Peticiones Web
   ========================================================================== */
function initReservationFilters() {
  const filterBtns = document.querySelectorAll('.filter-tab-btn');
  const searchInput = document.getElementById('search-reservations');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('bg-forest-800', 'text-white', 'shadow');
        b.classList.add('bg-white', 'text-gray-600', 'hover:bg-gray-100');
      });
      btn.classList.remove('bg-white', 'text-gray-600', 'hover:bg-gray-100');
      btn.classList.add('bg-forest-800', 'text-white', 'shadow');

      activeFilter = btn.getAttribute('data-filter');
      renderReservationsTable();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderReservationsTable();
    });
  }
}

function renderReservationsTable() {
  const container = document.getElementById('reservations-list-container');
  if (!container) return;

  // Filtrado
  let list = reservations.filter(r => {
    if (activeFilter === 'todas') return true;
    return r.status === activeFilter;
  });

  if (searchQuery) {
    list = list.filter(r => 
      r.clientName.toLowerCase().includes(searchQuery) ||
      r.phone.includes(searchQuery) ||
      r.eventType.toLowerCase().includes(searchQuery)
    );
  }

  // Ordenar por fecha ascendente
  list.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-gray-400">
        <i class="fa-solid fa-inbox text-4xl mb-3 block text-gray-300"></i>
        <p class="text-sm">No se encontraron solicitudes con los filtros aplicados.</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm text-gray-600">
        <thead class="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-200">
          <tr>
            <th class="px-4 py-3.5">Cliente</th>
            <th class="px-4 py-3.5">Fecha Evento</th>
            <th class="px-4 py-3.5">Tipo Evento</th>
            <th class="px-4 py-3.5">Presupuesto</th>
            <th class="px-4 py-3.5 text-center">Estado</th>
            <th class="px-4 py-3.5 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
  `;

  list.forEach(r => {
    let statusBadge = '';
    if (r.status === 'confirmada') {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">Confirmada (Ocupado)</span>';
    } else if (r.status === 'pendiente') {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">Pendiente</span>';
    } else {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">Cancelada</span>';
    }

    const formattedDate = new Date(r.date + 'T00:00:00').toLocaleDateString('es-PY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    html += `
      <tr class="hover:bg-gray-50/80 transition">
        <td class="px-4 py-3.5">
          <div class="font-bold text-gray-900">${r.clientName}</div>
          <a href="tel:${r.phone}" class="text-xs text-forest-700 hover:underline flex items-center gap-1">
            <i class="fa-solid fa-phone text-[0.65rem]"></i> ${r.phone}
          </a>
        </td>
        <td class="px-4 py-3.5 font-medium text-gray-800">
          ${formattedDate}
        </td>
        <td class="px-4 py-3.5">
          <span class="block text-gray-900 font-semibold">${r.eventType}</span>
          <span class="text-xs text-gray-400">${r.guests || 'Capacidad no esp.'}</span>
        </td>
        <td class="px-4 py-3.5 font-bold text-gray-900">
          Gs. ${(r.estimatedPrice || 0).toLocaleString('es-PY')}
        </td>
        <td class="px-4 py-3.5 text-center">
          ${statusBadge}
        </td>
        <td class="px-4 py-3.5 text-right space-x-1 whitespace-nowrap">
          ${r.status === 'pendiente' ? `
            <button onclick="updateReservationStatus('${r.id}', 'confirmada')" title="Confirmar Reserva" class="p-2 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition">
              <i class="fa-solid fa-check"></i>
            </button>
            <button onclick="updateReservationStatus('${r.id}', 'cancelada')" title="Rechazar / Cancelar" class="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ''}
          ${r.status === 'confirmada' ? `
            <button onclick="updateReservationStatus('${r.id}', 'cancelada')" title="Liberar / Cancelar Reserva" class="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700 transition">
              <i class="fa-solid fa-ban"></i>
            </button>
          ` : ''}
          ${r.status === 'cancelada' ? `
            <button onclick="updateReservationStatus('${r.id}', 'confirmada')" title="Reactivar Reserva" class="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700 transition">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
          ` : ''}
          <a href="${getWhatsAppLinkForClient(r)}" target="_blank" rel="noopener noreferrer" title="Escribir al WhatsApp del cliente" class="inline-block p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition">
            <i class="fa-brands fa-whatsapp"></i>
          </a>
          <button onclick="deleteReservation('${r.id}')" title="Eliminar Registro" class="p-2 rounded-lg text-gray-400 hover:text-red-600 transition">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function updateReservationStatus(id, newStatus) {
  const res = reservations.find(r => r.id === id);
  if (!res) return;

  res.status = newStatus;
  saveReservations();
  renderDashboard();

  if (newStatus === 'confirmada') {
    showToast(`¡Reserva confirmada para ${res.clientName}! Fecha ocupada en el calendario.`, 'success');
  } else if (newStatus === 'cancelada') {
    showToast(`Reserva cancelada. Fecha liberada.`, 'info');
  }
}

function deleteReservation(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este registro de reserva?')) return;
  reservations = reservations.filter(r => r.id !== id);
  saveReservations();
  renderDashboard();
  showToast('Registro eliminado exitosamente', 'info');
}

function getWhatsAppLinkForClient(r) {
  // Limpiar número de teléfono
  const cleanPhone = r.phone.replace(/[^0-9]/g, '');
  const targetPhone = cleanPhone.startsWith('595') ? cleanPhone : '595' + (cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone);

  const formattedDate = new Date(r.date + 'T00:00:00').toLocaleDateString('es-PY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  let message = '';
  if (r.status === 'confirmada') {
    message = `¡Hola ${r.clientName}! 🌿 Te saludamos desde *Quinta Javy'aha Ña Juana-Irene* en Carapeguá.\n` +
      `Te confirmamos que la fecha para tu evento (*${formattedDate}*) ha sido agendada con éxito. ¡Estamos preparando todo para recibirlos de la mejor manera! ¿Deseas coordinar los detalles de pago o visita previa?`;
  } else {
    message = `¡Hola ${r.clientName}! 🌿 Te saludamos desde *Quinta Javy'aha Ña Juana-Irene* en Carapeguá.\n` +
      `Recibimos tu solicitud para la fecha *${formattedDate}* (${r.eventType}). Nos encantaría brindarte toda la información y disponibilidad. ¿Seguís interesado/a?`;
  }

  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
}

/* ==========================================================================
   6. Modal de Nueva Reserva Manual
   ========================================================================== */
function initModalHandlers() {
  const openBtn = document.getElementById('open-new-res-modal-btn');
  const closeBtn = document.getElementById('close-new-res-modal-btn');
  const cancelBtn = document.getElementById('cancel-new-res-btn');
  const form = document.getElementById('new-reservation-form');

  if (openBtn) openBtn.addEventListener('click', () => openNewReservationModal());
  if (closeBtn) closeBtn.addEventListener('click', closeNewReservationModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeNewReservationModal);

  const closeDayModalBtn = document.getElementById('close-day-modal-btn');
  if (closeDayModalBtn) closeDayModalBtn.addEventListener('click', closeDayDetailModal);

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('form-client-name').value.trim();
      const phone = document.getElementById('form-client-phone').value.trim();
      const date = document.getElementById('form-event-date').value;
      const type = document.getElementById('form-event-type').value;
      const guests = document.getElementById('form-event-guests').value;
      const price = parseInt(document.getElementById('form-event-price').value) || 0;
      const status = document.getElementById('form-event-status').value;
      const notes = document.getElementById('form-event-notes').value.trim();

      if (!name || !phone || !date) {
        alert('Por favor completa los campos requeridos (*).');
        return;
      }

      // Si la fecha estaba en bloqueadas manuales, removerla
      blockedDates = blockedDates.filter(d => d !== date);
      saveBlockedDates();

      const newRes = {
        id: 'res-' + Date.now(),
        clientName: name,
        phone: phone,
        date: date,
        eventType: type,
        guests: guests,
        estimatedPrice: price,
        status: status,
        notes: notes,
        createdAt: new Date().toISOString()
      };

      reservations.push(newRes);
      saveReservations();
      renderDashboard();
      closeNewReservationModal();
      showToast(`Reserva agregada exitosamente para el ${date}`, 'success');
      form.reset();
    });
  }
}

function openNewReservationModal(defaultDate = null) {
  const modal = document.getElementById('new-res-modal');
  const dateInput = document.getElementById('form-event-date');
  if (dateInput && defaultDate) {
    dateInput.value = defaultDate;
  } else if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewReservationModal() {
  const modal = document.getElementById('new-res-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/* ==========================================================================
   7. Toast de Notificaciones
   ========================================================================== */
function showToast(message, type = 'info') {
  const toast = document.getElementById('admin-toast');
  const toastMsg = document.getElementById('admin-toast-message');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;

  if (type === 'success') {
    toast.className = 'fixed bottom-6 right-6 z-50 bg-forest-900 text-white border-l-4 border-emerald-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300';
  } else {
    toast.className = 'fixed bottom-6 right-6 z-50 bg-gray-900 text-white border-l-4 border-gold-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300';
  }

  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

/* ==========================================================================
   8. Navegación entre Pestañas Principales del Panel
   ========================================================================== */
function initAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  const sections = {
    calendar: document.getElementById('section-calendar'),
    reservations: document.getElementById('section-reservations'),
    pricing: document.getElementById('section-pricing')
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');

      // Actualizar estilo de tabs
      tabs.forEach(t => {
        t.classList.remove('bg-forest-800', 'text-white', 'shadow', 'active');
        t.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-200');
      });
      tab.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-200');
      tab.classList.add('bg-forest-800', 'text-white', 'shadow', 'active');

      // Mostrar sección seleccionada
      Object.keys(sections).forEach(key => {
        if (sections[key]) {
          if (key === target) {
            sections[key].classList.remove('hidden');
          } else {
            sections[key].classList.add('hidden');
          }
        }
      });
    });
  });
}

/* ==========================================================================
   9. Parametrización y Configuración de Tarifas / Precios
   ========================================================================== */
const DEFAULT_PRICING = {
  basePrices: {
    pasadia: 700000,
    cumple: 1200000,
    boda: 2000000,
    corporativo: 1500000
  },
  guestPrices: {
    '30': 0,
    '80': 300000,
    '150': 600000,
    '300': 1000000
  },
  dayMultipliers: {
    semanaDiscount: 15,
    viernes: 150000,
    finde: 300000
  },
  extraServices: {
    luces: 200000,
    parrillero: 250000,
    mobiliario: 200000,
    cancha: 150000
  }
};

function getPricingConfig() {
  const saved = localStorage.getItem(STORAGE_KEY_PRICING);
  if (!saved) return JSON.parse(JSON.stringify(DEFAULT_PRICING));
  try {
    return JSON.parse(saved);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_PRICING));
  }
}

function initPricingSettings() {
  const form = document.getElementById('pricing-settings-form');
  if (!form) return;

  // Inputs
  const inputPasadia = document.getElementById('price-pasadia');
  const inputCumple = document.getElementById('price-cumple');
  const inputBoda = document.getElementById('price-boda');
  const inputCorporativo = document.getElementById('price-corporativo');

  const inputGuest30 = document.getElementById('price-guest-30');
  const inputGuest80 = document.getElementById('price-guest-80');
  const inputGuest150 = document.getElementById('price-guest-150');
  const inputGuest300 = document.getElementById('price-guest-300');

  const inputSemanaDesc = document.getElementById('price-day-semana-desc');
  const inputViernes = document.getElementById('price-day-viernes');
  const inputFinde = document.getElementById('price-day-finde');

  const inputExtraLuces = document.getElementById('price-extra-luces');
  const inputExtraParrillero = document.getElementById('price-extra-parrillero');
  const inputExtraMobiliario = document.getElementById('price-extra-mobiliario');
  const inputExtraCancha = document.getElementById('price-extra-cancha');

  const simulationTotal = document.getElementById('price-simulation-total');
  const btnSave = document.getElementById('btn-save-pricing');
  const btnReset = document.getElementById('btn-reset-pricing');
  const batchButtons = document.querySelectorAll('.btn-batch-adjust');

  function populateInputs(config) {
    if (inputPasadia) inputPasadia.value = config.basePrices.pasadia;
    if (inputCumple) inputCumple.value = config.basePrices.cumple;
    if (inputBoda) inputBoda.value = config.basePrices.boda;
    if (inputCorporativo) inputCorporativo.value = config.basePrices.corporativo;

    if (inputGuest30) inputGuest30.value = config.guestPrices['30'] || 0;
    if (inputGuest80) inputGuest80.value = config.guestPrices['80'];
    if (inputGuest150) inputGuest150.value = config.guestPrices['150'];
    if (inputGuest300) inputGuest300.value = config.guestPrices['300'];

    if (inputSemanaDesc) inputSemanaDesc.value = config.dayMultipliers.semanaDiscount;
    if (inputViernes) inputViernes.value = config.dayMultipliers.viernes;
    if (inputFinde) inputFinde.value = config.dayMultipliers.finde;

    if (inputExtraLuces) inputExtraLuces.value = config.extraServices.luces;
    if (inputExtraParrillero) inputExtraParrillero.value = config.extraServices.parrillero;
    if (inputExtraMobiliario) inputExtraMobiliario.value = config.extraServices.mobiliario;
    if (inputExtraCancha) inputExtraCancha.value = config.extraServices.cancha;

    updateSimulation();
  }

  function readInputs() {
    return {
      basePrices: {
        pasadia: parseInt(inputPasadia.value) || 0,
        cumple: parseInt(inputCumple.value) || 0,
        boda: parseInt(inputBoda.value) || 0,
        corporativo: parseInt(inputCorporativo.value) || 0
      },
      guestPrices: {
        '30': parseInt(inputGuest30.value) || 0,
        '80': parseInt(inputGuest80.value) || 0,
        '150': parseInt(inputGuest150.value) || 0,
        '300': parseInt(inputGuest300.value) || 0
      },
      dayMultipliers: {
        semanaDiscount: parseFloat(inputSemanaDesc.value) || 0,
        viernes: parseInt(inputViernes.value) || 0,
        finde: parseInt(inputFinde.value) || 0
      },
      extraServices: {
        luces: parseInt(inputExtraLuces.value) || 0,
        parrillero: parseInt(inputExtraParrillero.value) || 0,
        mobiliario: parseInt(inputExtraMobiliario.value) || 0,
        cancha: parseInt(inputExtraCancha.value) || 0
      }
    };
  }

  function updateSimulation() {
    if (!simulationTotal) return;
    const current = readInputs();
    // Ejemplo: Pasadía (base) + 30 personas (0) + Sábado (finde)
    const base = current.basePrices.pasadia || 0;
    const guest = current.guestPrices['30'] || 0;
    const dayExtra = current.dayMultipliers.finde || 0;
    const total = base + guest + dayExtra;
    simulationTotal.textContent = 'Gs. ' + total.toLocaleString('es-PY');
  }

  // Escuchar cambios en todos los inputs para recalcular en vivo
  const allInputs = form.querySelectorAll('input');
  allInputs.forEach(input => {
    input.addEventListener('input', updateSimulation);
  });

  // Ajustes Rápidos por porcentaje (+10%, +15%, -10%, etc.)
  batchButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const pct = parseFloat(btn.getAttribute('data-percent'));
      if (isNaN(pct)) return;

      const current = readInputs();
      const factor = 1 + (pct / 100);

      // Aplicar factor a tarifas base y recargos
      current.basePrices.pasadia = Math.round((current.basePrices.pasadia * factor) / 10000) * 10000;
      current.basePrices.cumple = Math.round((current.basePrices.cumple * factor) / 10000) * 10000;
      current.basePrices.boda = Math.round((current.basePrices.boda * factor) / 10000) * 10000;
      current.basePrices.corporativo = Math.round((current.basePrices.corporativo * factor) / 10000) * 10000;

      current.guestPrices['80'] = Math.round((current.guestPrices['80'] * factor) / 10000) * 10000;
      current.guestPrices['150'] = Math.round((current.guestPrices['150'] * factor) / 10000) * 10000;
      current.guestPrices['300'] = Math.round((current.guestPrices['300'] * factor) / 10000) * 10000;

      populateInputs(current);
      const sign = pct > 0 ? '+' : '';
      showToast(`Ajuste temporal del ${sign}${pct}% aplicado en pantalla. Pulsa "Guardar" para confirmarlo.`, 'info');
    });
  });

  // Botón Guardar
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const newConfig = readInputs();
      localStorage.setItem(STORAGE_KEY_PRICING, JSON.stringify(newConfig));
      showToast('¡Tarifas guardadas exitosamente! El cotizador web ya refleja los nuevos precios.', 'success');
    });
  }

  // Botón Restablecer
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (!confirm('¿Deseas restablecer todas las tarifas a sus valores iniciales por defecto?')) return;
      localStorage.setItem(STORAGE_KEY_PRICING, JSON.stringify(DEFAULT_PRICING));
      populateInputs(DEFAULT_PRICING);
      showToast('Tarifas restablecidas a valores estándar.', 'info');
    });
  }

  // Cargar valores iniciales
  const currentConfig = getPricingConfig();
  populateInputs(currentConfig);
}

