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
});

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

  // Precios base referenciales en Guaraníes (Gs.)
  const basePrices = {
    pasadia: { name: 'Pasadía de Sol & Relax (9:00 a 19:00 hs)', price: 700000 },
    cumple: { name: 'Cumpleaños / Festejo Privado (13:00 a 01:00 hs)', price: 1200000 },
    boda_15: { name: 'Boda / 15 Años Soñado (Exclusividad Completa)', price: 2000000 },
    corporativo: { name: 'Encuentro Corporativo / Retiro', price: 1500000 }
  };

  const guestPrices = {
    '30': { name: 'Hasta 30 personas', extra: 0 },
    '80': { name: '30 a 80 personas', extra: 300000 },
    '150': { name: '80 a 150 personas', extra: 600000 },
    '300': { name: '150 a 300+ personas', extra: 1000000 }
  };

  const dayMultipliers = {
    'semana': { name: 'Lunes a Jueves (Día de semana)', discount: 0.15, extra: 0 },
    'viernes': { name: 'Viernes', discount: 0, extra: 150000 },
    'finde': { name: 'Sábado, Domingo o Feriado', discount: 0, extra: 300000 }
  };

  const extraServices = {
    'luces': { name: 'Guirnaldas & Luces Cálidas Nocturnas', price: 200000 },
    'parrillero': { name: 'Asistente de Parrilla / Asador', price: 250000 },
    'mobiliario': { name: 'Mesas y Sillas Adicionales', price: 200000 },
    'cancha': { name: 'Iluminación Especial de Áreas Verdes & Cancha', price: 150000 }
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

  function updateCalculation() {
    let total = basePrices[selectedEvent].price;
    total += guestPrices[selectedGuests].extra;

    const dayConfig = dayMultipliers[selectedDay];
    if (dayConfig.discount > 0) {
      total = Math.round(total * (1 - dayConfig.discount));
    }
    total += dayConfig.extra;

    let extrasTotal = 0;
    const extrasListNames = [];
    selectedExtras.forEach(key => {
      if (extraServices[key]) {
        extrasTotal += extraServices[key].price;
        extrasListNames.push(extraServices[key].name);
      }
    });

    total += extrasTotal;

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
    const dayName = dayConfig.name;
    const extrasText = extrasListNames.length > 0 ? extrasListNames.join(', ') : 'Ninguno por ahora';

    const rawMessage = `¡Hola Quinta Javy'aha Ña Juana-Irene! 🌿✨\n\nEstuve cotizando en su portal web y me gustaría consultar disponibilidad:\n\n` +
      `📍 Evento: ${eventName}\n` +
      `👥 Capacidad estimada: ${guestsName}\n` +
      `📅 Tipo de fecha: ${dayName}\n` +
      `✨ Servicios extra: ${extrasText}\n` +
      `💰 Estimado en web: ${formatGs(total)}\n\n` +
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
   6. Formulario de Contacto Rápido hacia WhatsApp
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
   7. Chequeador Rápido de Disponibilidad de Fechas
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

    const msg = `¡Hola Quinta Javy'aha! 🌿\nQuisiera saber si tienen disponibilidad para el día *${formattedDate}*. ¿Podrían confirmarme precios y horarios? ¡Gracias!`;
    const waUrl = `https://wa.me/595972783547?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  });
}
