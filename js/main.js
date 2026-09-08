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
});

/* ==========================================================================
   8. Modo Mantenimiento (controlado desde el panel admin)
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

  const form = document.getElementById('contact-booking-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('Reservas en pausa por mantenimiento. Contáctanos por WhatsApp.');
    }, true);
    form.querySelectorAll('input, textarea, select, button[type="submit"]').forEach(el => {
      el.disabled = true;
      el.classList.add('opacity-60');
    });
  }
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
      if (!spaces || !turns || !rules) return null;

      const eventMap = {
        pasadia: { spaces: ['piscina', 'quincho'], turn: 'dia_completo' },
        cumple: { spaces: ['salon', 'piscina'], turn: 'noche' },
        boda_15: { spaces: ['salon', 'piscina', 'quincho'], turn: 'dia_completo' },
        corporativo: { spaces: ['salon'], turn: 'dia_completo' }
      };
      const guestCount = { '30': 30, '80': 80, '150': 150, '300': 300 }[selectedGuests] || 30;
      const dayDow = { semana: 2, viernes: 5, finde: 6 }[selectedDay] ?? 6;
      // Fecha representativa real (próximo día de ese tipo) para que apliquen temporadas/fechas
      const t = new Date(); let add = 0;
      while (new Date(t.getFullYear(), t.getMonth(), t.getDate() + add).getDay() !== dayDow) add++;
      const ref = new Date(t.getFullYear(), t.getMonth(), t.getDate() + add);
      const dateStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;

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
        total += price;
        detail.push(`${sp.shortName || sp.name || sid}: ${formatGs(price)}`);
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
    if (fresh) {
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
      `💰 Estimado en web: ${formatGs(total)}${fresh ? `\n🧾 Desglose: ${fresh.detail.join(' · ')}` : ''}\n\n` +
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

    header.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Cerrar otros
      faqItems.forEach(other => {
        if (other !== item) other.classList.remove('open');
      });

      // Alternar actual
      if (isOpen) {
        item.classList.remove('open');
      } else {
        item.classList.add('open');
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

