/**
 * Quinta Javy'aha Ña Juana-Irene
 * Panel de Administración - Lógica de Gestión y Calendario
 * Carapeguá, Paraguarí, Paraguay
 */

// ============================================================================
// CLAVES DE LOCALSTORAGE - NUEVO MODELO DE DATOS v2
// ============================================================================
const STORAGE_KEYS = {
  // Core rental
  SPACES: 'quinta_spaces',
  TURNS: 'quinta_turns',
  PRICING_RULES: 'quinta_pricing_rules',
  RESERVATIONS: 'quinta_reservations_v2',
  RESERVATION_SPACES: 'quinta_reservation_spaces',
  SERVICES: 'quinta_services',
  PAYMENTS: 'quinta_payments',
  // Finance
  INCOMES: 'quinta_incomes',
  EXPENSES: 'quinta_expenses',
  EXPENSE_CATEGORIES: 'quinta_expense_categories',
  RECURRING_EXPENSES: 'quinta_recurring_expenses',
  // System
  USERS: 'quinta_users',
  AUDIT_LOGS: 'quinta_audit_logs',
  SETTINGS: 'quinta_settings',
  // Legacy (compatibilidad)
  LEGACY_RESERVATIONS: 'quinta_reservations',
  LEGACY_BLOCKED: 'quinta_blocked_dates',
  LEGACY_PRICING: 'quinta_pricing_config'
};

// Estado global
let currentCalendarDate = new Date();
let currentView = 'month'; // 'month' | 'week' | 'day'
let currentUser = null;

// Entidades
let spaces = [];
let turns = [];
let pricingRules = [];
let reservations = [];
let reservationSpaces = [];
let services = [];
let payments = [];
let incomes = [];
let expenses = [];
let expenseCategories = [];
let recurringExpenses = [];
let users = [];
let auditLogs = [];
let settings = {};

let activeFilter = 'todas';
let searchQuery = '';

// ============================================================================
// UTILIDADES BASE
// ============================================================================
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function formatGs(amount) {
  return 'Gs. ' + (amount || 0).toLocaleString('es-PY');
}

function parseGs(str) {
  return parseInt(String(str).replace(/[^\d]/g, '')) || 0;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function loadJSON(key, fallback = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.warn(`Error loading ${key}:`, e);
    return fallback;
  }
}

function saveJSON(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
}

// ============================================================================
// AUDITORÍA
// ============================================================================
function logAudit(action, entityType, entityId, details = {}, level = 'info') {
  const log = {
    id: generateId('audit'),
    timestamp: nowISO(),
    userId: currentUser?.id || 'system',
    userName: currentUser?.name || 'Sistema',
    action,
    entityType,
    entityId,
    details,
    level // 'info' | 'warning' | 'critical'
  };
  auditLogs.unshift(log);
  if (auditLogs.length > 5000) auditLogs.length = 5000;
  saveJSON(STORAGE_KEYS.AUDIT_LOGS, auditLogs);
}

// ============================================================================
// MIGRACIÓN DE DATOS LEGACY
// ============================================================================
function migrateLegacyData() {
  const legacyReservations = loadJSON(STORAGE_KEYS.LEGACY_RESERVATIONS);
  const legacyBlocked = loadJSON(STORAGE_KEYS.LEGACY_BLOCKED);
  const legacyPricing = loadJSON(STORAGE_KEYS.LEGACY_PRICING);

  // Migrar reservas legacy al nuevo formato
  if (legacyReservations.length > 0 && reservations.length === 0) {
    legacyReservations.forEach((r, idx) => {
      const newRes = {
        id: r.id || generateId('res'),
        clientName: r.clientName,
        phone: r.phone,
        email: r.email || '',
        status: r.status || 'pendiente',
        totalPrice: r.estimatedPrice || 0,
        paidAmount: 0,
        balance: r.estimatedPrice || 0,
        discount: 0,
        notes: r.notes || '',
        source: 'web',
        createdBy: 'migration',
        createdAt: r.createdAt || nowISO(),
        updatedAt: nowISO()
      };
      reservations.push(newRes);

      // Crear reservation_spaces basado en eventType legacy
      const spaceMapping = {
        'Pasadía Familiar': ['piscina'],
        'Cumpleaños Infantil': ['salon', 'piscina'],
        'Cumpleaños / Festejo': ['salon', 'piscina'],
        'Boda Campestre': ['salon', 'piscina', 'quincho'],
        'Boda / 15 Años': ['salon', 'piscina', 'quincho'],
        'Evento Corporativo': ['salon'],
        'Encuentro Corporativo / Retiro': ['salon']
      };

      const turnMapping = {
        'Pasadía Familiar': 'dia_completo',
        'Cumpleaños Infantil': 'tarde_noche',
        'Cumpleaños / Festejo': 'tarde_noche',
        'Boda Campestre': 'dia_completo',
        'Boda / 15 Años': 'dia_completo',
        'Evento Corporativo': 'mañana_tarde',
        'Encuentro Corporativo / Retiro': 'dia_completo'
      };

      const spaceIds = spaceMapping[r.eventType] || ['salon'];
      const turnId = turnMapping[r.eventType] || 'dia_completo';

      spaceIds.forEach(sid => {
        reservationSpaces.push({
          id: generateId('rs'),
          reservationId: newRes.id,
          spaceId: sid,
          turnId,
          date: r.date,
          price: 0 // Se calculará después
        });
      });

      // Crear ingreso si está confirmada
      if (newRes.status === 'confirmada') {
        incomes.push({
          id: generateId('inc'),
          date: r.date,
          concept: `Alquiler - ${r.eventType}`,
          reservationId: newRes.id,
          clientName: r.clientName,
          amount: newRes.totalPrice,
          paymentMethod: 'Efectivo',
          recordedBy: 'migration',
          notes: 'Migrado desde sistema anterior',
          createdAt: nowISO()
        });
      }
    });
    logAudit('migrate', 'reservations', 'bulk', { count: legacyReservations.length }, 'info');
  }

  // Migrar fechas bloqueadas
  if (legacyBlocked.length > 0) {
    // En el nuevo modelo, las fechas bloqueadas se manejan como reservationSpaces con espacio especial "blocked"
    // O como configuración de espacio no disponible. Por simplicidad, mantenemos blockedDates legacy
    // y lo integramos en la validación de disponibilidad.
  }

  // Migrar pricing legacy a pricingRules
  if (legacyPricing && pricingRules.length === 0) {
    const base = legacyPricing.basePrices || {};
    const guest = legacyPricing.guestPrices || {};
    const day = legacyPricing.dayMultipliers || {};
    const extra = legacyPricing.extraServices || {};

    // Crear reglas básicas por tipo de evento
    const eventRules = [
      { key: 'pasadia', name: 'Pasadía', spaces: ['piscina', 'quincho'], turn: 'dia_completo' },
      { key: 'cumple', name: 'Cumpleaños/Festejo', spaces: ['salon', 'piscina'], turn: 'tarde_noche' },
      { key: 'boda', name: 'Boda/15 Años', spaces: ['salon', 'piscina', 'quincho'], turn: 'dia_completo' },
      { key: 'corporativo', name: 'Corporativo', spaces: ['salon'], turn: 'dia_completo' }
    ];

    eventRules.forEach(er => {
      if (base[er.key]) {
        pricingRules.push({
          id: generateId('rule'),
          name: `Regla base - ${er.name}`,
          priority: 100,
          conditions: {
            spaces: er.spaces,
            turns: [er.turn],
            daysOfWeek: [],
            dateRange: null,
            specificDates: [],
            minDuration: 0,
            guestRange: { min: 1, max: 300 }
          },
          pricing: {
            type: 'fixed',
            basePrice: base[er.key],
            perHour: 0,
            perPerson: 0
          },
          discounts: day.semanaDiscount ? [{ type: 'weekday', days: [1,2,3,4], percent: day.semanaDiscount }] : [],
          surcharges: [
            ...(day.viernes ? [{ type: 'friday', fixed: day.viernes }] : []),
            ...(day.finde ? [{ type: 'weekend', fixed: day.finde }] : [])
          ],
          active: true,
          createdAt: nowISO(),
          createdBy: 'migration'
        });
      }
    });

    // Servicios extra
    Object.entries(extra).forEach(([key, price]) => {
      if (price > 0) {
        services.push({
          id: generateId('svc'),
          key,
          name: key === 'luces' ? 'Guirnaldas & Luces Nocturnas' : 
                key === 'parrillero' ? 'Asistente de Parrilla' : 
                key === 'mobiliario' ? 'Mesas y Sillas Extra' : key,
          description: '',
          price,
          unit: 'evento',
          active: true,
          sortOrder: services.length
        });
      }
    });

    logAudit('migrate', 'pricing_rules', 'bulk', { count: pricingRules.length }, 'info');
  }

  saveAll();
}

// ============================================================================
// INICIALIZACIÓN Y PERSISTENCIA
// ============================================================================
function initStorage() {
  // Cargar todas las entidades
  spaces = loadJSON(STORAGE_KEYS.SPACES, getDefaultSpaces());
  turns = loadJSON(STORAGE_KEYS.TURNS, getDefaultTurns());
  pricingRules = loadJSON(STORAGE_KEYS.PRICING_RULES, []);
  reservations = loadJSON(STORAGE_KEYS.RESERVATIONS, []);
  reservationSpaces = loadJSON(STORAGE_KEYS.RESERVATION_SPACES, []);
  services = loadJSON(STORAGE_KEYS.SERVICES, getDefaultServices());
  payments = loadJSON(STORAGE_KEYS.PAYMENTS, []);
  incomes = loadJSON(STORAGE_KEYS.INCOMES, []);
  expenses = loadJSON(STORAGE_KEYS.EXPENSES, []);
  expenseCategories = loadJSON(STORAGE_KEYS.EXPENSE_CATEGORIES, getDefaultExpenseCategories());
  recurringExpenses = loadJSON(STORAGE_KEYS.RECURRING_EXPENSES, []);
  users = loadJSON(STORAGE_KEYS.USERS, getDefaultUsers());
  auditLogs = loadJSON(STORAGE_KEYS.AUDIT_LOGS, []);
  settings = loadJSON(STORAGE_KEYS.SETTINGS, getDefaultSettings());

  // Migración legacy (solo primera vez)
  const migrationDone = localStorage.getItem('quinta_migration_v2_done');
  if (!migrationDone) {
    migrateLegacyData();
    localStorage.setItem('quinta_migration_v2_done', 'true');
  }

  // Asegurar espacios por defecto si no existen
  if (spaces.length === 0) {
    spaces = getDefaultSpaces();
    saveJSON(STORAGE_KEYS.SPACES, spaces);
  }
  if (turns.length === 0) {
    turns = getDefaultTurns();
    saveJSON(STORAGE_KEYS.TURNS, turns);
  }
  if (services.length === 0) {
    services = getDefaultServices();
    saveJSON(STORAGE_KEYS.SERVICES, services);
  }
  if (expenseCategories.length === 0) {
    expenseCategories = getDefaultExpenseCategories();
    saveJSON(STORAGE_KEYS.EXPENSE_CATEGORIES, expenseCategories);
  }
  if (users.length === 0) {
    users = getDefaultUsers();
    saveJSON(STORAGE_KEYS.USERS, users);
  }
  if (Object.keys(settings).length === 0) {
    settings = getDefaultSettings();
    saveJSON(STORAGE_KEYS.SETTINGS, settings);
  }

  autoBackup();
}
/* Respaldo automático diario: snapshot con fecha, conserva últimos 7 */
function autoBackup() {
  try {
    if (!settings.backupEnabled) return;
    const key = `quinta_backup_${getTodayStr()}`;
    if (!localStorage.getItem(key)) { // crear el de hoy si falta
      const dump = {};
      Object.values(STORAGE_KEYS).forEach(k => { dump[k] = loadJSON(k, null); });
      localStorage.setItem(key, JSON.stringify({ date: getTodayStr(), data: dump }));
    }
    // podar snapshots viejos (conservar 7) — siempre, no solo al crear
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('quinta_backup_')) keys.push(k);
    }
    keys.sort();
    while (keys.length > 7) {
      localStorage.removeItem(keys.shift());
    }
  } catch (e) { console.warn('autoBackup:', e); }
}

function saveAll() {
  saveJSON(STORAGE_KEYS.SPACES, spaces);
  saveJSON(STORAGE_KEYS.TURNS, turns);
  saveJSON(STORAGE_KEYS.PRICING_RULES, pricingRules);
  saveJSON(STORAGE_KEYS.RESERVATIONS, reservations);
  saveJSON(STORAGE_KEYS.RESERVATION_SPACES, reservationSpaces);
  saveJSON(STORAGE_KEYS.SERVICES, services);
  saveJSON(STORAGE_KEYS.PAYMENTS, payments);
  saveJSON(STORAGE_KEYS.INCOMES, incomes);
  saveJSON(STORAGE_KEYS.EXPENSES, expenses);
  saveJSON(STORAGE_KEYS.EXPENSE_CATEGORIES, expenseCategories);
  saveJSON(STORAGE_KEYS.RECURRING_EXPENSES, recurringExpenses);
  saveJSON(STORAGE_KEYS.USERS, users);
  saveJSON(STORAGE_KEYS.AUDIT_LOGS, auditLogs);
  saveJSON(STORAGE_KEYS.SETTINGS, settings);
}

// ============================================================================
// DATOS POR DEFECTO (SEED)
// ============================================================================
function getDefaultSpaces() {
  return [
    {
      id: 'salon',
      name: 'Salón de Eventos',
      description: 'Salón climatizado cerrado con blindex, vista al jardín, capacidad 300+ personas',
      shortName: 'Salón',
      icon: 'fa-solid fa-building-columns',
      color: '#0891b2', // cyan-600
      capacity: 300,
      basePrice: 0, // Se usa pricingRules
      requiresStaff: false,
      active: true,
      sortOrder: 1,
      amenities: ['Aire acondicionado', 'Blindex panorámico', 'Iluminación escénica', 'Tomas para DJ', 'Baños sexados'],
      createdAt: nowISO(),
      updatedAt: nowISO()
    },
    {
      id: 'piscina',
      name: 'Zona de Piscina',
      description: 'Piscina cristalina con solárium, reposeras, área de sombra y vestuarios',
      shortName: 'Piscina',
      icon: 'fa-solid fa-water-ladder',
      color: '#06b6d4', // cyan-500
      capacity: 80,
      basePrice: 0,
      requiresStaff: false,
      active: true,
      sortOrder: 2,
      amenities: ['Solárium', 'Reposeras', 'Sombrillas', 'Vestuarios', 'Duchas'],
      createdAt: nowISO(),
      updatedAt: nowISO()
    },
    {
      id: 'quincho',
      name: 'Quincho y Parrilla',
      description: 'Parrilla profesional con mesadas, bacha, área de preparación y comedor exterior',
      shortName: 'Quincho',
      icon: 'fa-solid fa-fire-burner',
      color: '#dc2626', // red-600
      capacity: 50,
      basePrice: 0,
      requiresStaff: false,
      active: true,
      sortOrder: 3,
      amenities: ['Parrilla grande', 'Mesadas', 'Bacha', 'Heladera', 'Freezer'],
      createdAt: nowISO(),
      updatedAt: nowISO()
    },
    {
      id: 'estacionamiento',
      name: 'Estacionamiento Interno',
      description: 'Estacionamiento privado dentro del predio con portón de acceso',
      shortName: 'Estac.',
      icon: 'fa-solid fa-parking',
      color: '#6b7280', // gray-500
      capacity: 40,
      basePrice: 0,
      requiresStaff: false,
      active: true,
      sortOrder: 4,
      amenities: ['Portón automático', 'Iluminación', 'Seguridad'],
      createdAt: nowISO(),
      updatedAt: nowISO()
    }
  ];
}

function getDefaultTurns() {
  return [
    {
      id: 'mañana',
      name: 'Turno Mañana',
      shortName: 'Mañana',
      startTime: '09:00',
      endTime: '13:00',
      durationHours: 4,
      color: '#f59e0b', // amber-500
      spaces: ['salon', 'piscina', 'quincho'],
      active: true,
      sortOrder: 1,
      allowCustom: false
    },
    {
      id: 'tarde',
      name: 'Turno Tarde',
      shortName: 'Tarde',
      startTime: '14:00',
      endTime: '18:00',
      durationHours: 4,
      color: '#f97316', // orange-500
      spaces: ['salon', 'piscina', 'quincho'],
      active: true,
      sortOrder: 2,
      allowCustom: false
    },
    {
      id: 'noche',
      name: 'Turno Noche',
      shortName: 'Noche',
      startTime: '19:00',
      endTime: '01:00',
      durationHours: 6,
      color: '#7c3aed', // violet-600
      spaces: ['salon', 'quincho'],
      active: true,
      sortOrder: 3,
      allowCustom: false
    },
    {
      id: 'dia_completo',
      name: 'Día Completo',
      shortName: 'Día Completo',
      startTime: '09:00',
      endTime: '01:00',
      durationHours: 16,
      color: '#1b4332', // forest-900
      spaces: ['salon', 'piscina', 'quincho'],
      active: true,
      sortOrder: 4,
      allowCustom: false
    },
    {
      id: 'personalizado',
      name: 'Horario Personalizado',
      shortName: 'Personalizado',
      startTime: '00:00',
      endTime: '23:59',
      durationHours: 0, // Variable
      color: '#6366f1', // indigo-500
      spaces: ['salon', 'piscina', 'quincho'],
      active: true,
      sortOrder: 5,
      allowCustom: true
    }
  ];
}

function getDefaultServices() {
  return [
    {
      id: generateId('svc'),
      key: 'luces',
      name: 'Guirnaldas & Luces Cálidas Nocturnas',
      description: 'Instalación de iluminación decorativa para eventos nocturnos',
      price: 200000,
      unit: 'evento',
      active: true,
      sortOrder: 1
    },
    {
      id: generateId('svc'),
      key: 'parrillero',
      name: 'Asistente de Parrilla / Asador Profesional',
      description: 'Servicio de asador experto por 6 horas',
      price: 250000,
      unit: 'evento',
      active: true,
      sortOrder: 2
    },
    {
      id: generateId('svc'),
      key: 'mobiliario',
      name: 'Mesas y Sillas Adicionales (Juego Extra)',
      description: 'Set de 10 sillas + 1 mesa plegable',
      price: 200000,
      unit: 'juego',
      active: true,
      sortOrder: 3
    },
    {
      id: generateId('svc'),
      key: 'limpieza_extra',
      name: 'Limpieza Profunda Post-Evento',
      description: 'Servicio de limpieza completa al día siguiente',
      price: 150000,
      unit: 'evento',
      active: true,
      sortOrder: 4
    },
    {
      id: generateId('svc'),
      key: 'decoracion',
      name: 'Decoración Básica (Centros de mesa, manteles)',
      description: 'Incluye manteles, centros de mesa, sillas vestidas',
      price: 300000,
      unit: 'evento',
      active: true,
      sortOrder: 5
    }
  ];
}

function getDefaultExpenseCategories() {
  return [
    {
      id: 'cat_limpieza',
      name: 'Limpieza',
      icon: 'fa-solid fa-broom',
      color: '#06b6d4',
      parentId: null,
      active: true,
      sortOrder: 1
    },
    {
      id: 'cat_limpieza_personal',
      name: 'Personal de Limpieza',
      icon: 'fa-solid fa-user-tie',
      color: '#0891b2',
      parentId: 'cat_limpieza',
      active: true,
      sortOrder: 1
    },
    {
      id: 'cat_limpieza_productos',
      name: 'Productos de Limpieza',
      icon: 'fa-solid fa-spray-can',
      color: '#0e7490',
      parentId: 'cat_limpieza',
      active: true,
      sortOrder: 2
    },
    {
      id: 'cat_limpieza_servicios',
      name: 'Servicios Externos de Limpieza',
      icon: 'fa-solid fa-truck',
      color: '#155e75',
      parentId: 'cat_limpieza',
      active: true,
      sortOrder: 3
    },
    {
      id: 'cat_piscina',
      name: 'Piscina',
      icon: 'fa-solid fa-water-ladder',
      color: '#06b6d4',
      parentId: null,
      active: true,
      sortOrder: 2
    },
    {
      id: 'cat_piscina_quimicos',
      name: 'Productos Químicos',
      icon: 'fa-solid fa-flask-vial',
      color: '#0891b2',
      parentId: 'cat_piscina',
      active: true,
      sortOrder: 1
    },
    {
      id: 'cat_piscina_cloro',
      name: 'Cloro',
      icon: 'fa-solid fa-droplet',
      color: '#0e7490',
      parentId: 'cat_piscina',
      active: true,
      sortOrder: 2
    },
    {
      id: 'cat_piscina_insumos',
      name: 'Insumos',
      icon: 'fa-solid fa-boxes-stacked',
      color: '#155e75',
      parentId: 'cat_piscina',
      active: true,
      sortOrder: 3
    },
    {
      id: 'cat_piscina_limpieza',
      name: 'Limpieza de Piscina',
      icon: 'fa-solid fa-brush',
      color: '#164e63',
      parentId: 'cat_piscina',
      active: true,
      sortOrder: 4
    },
    {
      id: 'cat_piscina_mantenimiento',
      name: 'Mantenimiento',
      icon: 'fa-solid fa-wrench',
      color: '#164e63',
      parentId: 'cat_piscina',
      active: true,
      sortOrder: 5
    },
    {
      id: 'cat_mantenimiento',
      name: 'Mantenimiento y Reparaciones',
      icon: 'fa-solid fa-tools',
      color: '#f59e0b',
      parentId: null,
      active: true,
      sortOrder: 3
    },
    {
      id: 'cat_mant_electricidad',
      name: 'Electricidad',
      icon: 'fa-solid fa-bolt',
      color: '#d97706',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 1
    },
    {
      id: 'cat_mant_plomeria',
      name: 'Plomería',
      icon: 'fa-solid fa-faucet',
      color: '#b45309',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 2
    },
    {
      id: 'cat_mant_instalaciones',
      name: 'Instalaciones',
      icon: 'fa-solid fa-building',
      color: '#92400e',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 3
    },
    {
      id: 'cat_mant_mobiliario',
      name: 'Reparación de Mobiliario',
      icon: 'fa-solid fa-chair',
      color: '#78350f',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 4
    },
    {
      id: 'cat_mant_equipos',
      name: 'Reparación de Equipos',
      icon: 'fa-solid fa-fan',
      color: '#78350f',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 5
    },
    {
      id: 'cat_mant_objetos',
      name: 'Objetos Dañados o Rotos',
      icon: 'fa-solid fa-mug-saucer',
      color: '#78350f',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 6
    },
    {
      id: 'cat_mant_general',
      name: 'Reparaciones Generales',
      icon: 'fa-solid fa-hammer',
      color: '#78350f',
      parentId: 'cat_mantenimiento',
      active: true,
      sortOrder: 7
    },
    {
      id: 'cat_otros',
      name: 'Otros Gastos',
      icon: 'fa-solid fa-ellipsis',
      color: '#6b7280',
      parentId: null,
      active: true,
      sortOrder: 99
    }
  ];
}

function getDefaultUsers() {
  return [
    {
      id: 'user_admin',
      name: 'Administrador',
      email: 'admin@quintajavyaha.com',
      password: 'admin123', // En producción: hash
      role: 'admin',
      permissions: ['*'],
      active: true,
      avatar: null,
      createdAt: nowISO(),
      lastLogin: null
    },
    {
      id: 'user_operativo',
      name: 'Personal Operativo',
      email: 'operativo@quintajavyaha.com',
      password: 'operativo123',
      role: 'operativo',
      permissions: [
        'reservations.create', 'reservations.read', 'reservations.update',
        'payments.create', 'payments.read',
        'incomes.create', 'expenses.create'
      ],
      active: true,
      avatar: null,
      createdAt: nowISO(),
      lastLogin: null
    }
  ];
}

function getDefaultSettings() {
  return {
    currency: 'PYG',
    currencySymbol: 'Gs.',
    timezone: 'America/Asuncion',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    companyName: 'Quinta Javy\'aha Ña Juana-Irene',
    companyAddress: 'Compañía Potrero, Carapeguá, Paraguarí',
    companyPhone: '+595 972 783 547',
    companyEmail: 'contacto@quintajavyaha.com',
    whatsappNumber: '595972783547',
    defaultPaymentMethods: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'],
    alertDaysBefore: 3,
    autoConfirmEnabled: false,
    maintenanceMode: false,
    backupEnabled: true
  };
}

// ============================================================================
// AUTENTICACIÓN SIMPLE (FASE 3.2)
// ============================================================================
function initAuth() { /* legacy no-op: se usa initAuthBoot */ }

function showLoginModal() {
  const modalHtml = `
    <div id="login-modal" class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-fadeIn">
        <div class="text-center mb-8">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-forest-800 flex items-center justify-center text-gold-400 text-3xl mb-4 shadow-lg">
            <i class="fa-solid fa-tree"></i>
          </div>
          <h2 class="font-serif text-2xl font-bold text-forest-900">Quinta Javy'aha</h2>
          <p class="text-gray-500 text-sm mt-1">Panel de Administración</p>
        </div>
        <form id="login-form" class="space-y-4">
          <div>
            <label for="login-email" class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Email</label>
            <input type="email" id="login-email" required autocomplete="email" placeholder="admin@quintajavyaha.com" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-800">
          </div>
          <div>
            <label for="login-password" class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Contraseña</label>
            <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-800">
          </div>
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" id="login-remember" class="rounded text-forest-800 focus:ring-forest-800">
              Recordarme
            </label>
          </div>
          <button type="submit" class="w-full btn-forest py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
            <span>Acceder al Panel</span>
          </button>
        </form>
        <div class="mt-6 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
          <p class="font-semibold text-gray-700">Credenciales de prueba:</p>
          <p><strong>Admin:</strong> admin@quintajavyaha.com / admin123</p>
          <p><strong>Operativo:</strong> operativo@quintajavyaha.com / operativo123</p>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const remember = document.getElementById('login-remember').checked;

  const user = users.find(u => u.email.toLowerCase() === email && u.password === password && u.active);
  
  if (!user) {
    showToast('Credenciales inválidas', 'error');
    return;
  }

  currentUser = user;
  user.lastLogin = nowISO();
  saveJSON(STORAGE_KEYS.USERS, users);

  const expires = new Date();
  expires.setDate(expires.getDate() + (remember ? 30 : 1));
  sessionStorage.setItem('quinta_admin_session', JSON.stringify({ userId: user.id, expires: expires.toISOString() }));

  logAudit('login', 'user', user.id, { email }, 'info');

  const lm = document.getElementById('login-modal');
  if (lm) lm.remove();
  showApp();
  bootApp();
}

function showApp() {
  // Actualizar header con info de usuario
  const headerUser = document.getElementById('header-user-info');
  if (headerUser) {
    headerUser.innerHTML = `
      <div class="flex items-center gap-3 ml-4">
        <div class="w-8 h-8 rounded-full bg-forest-800 border border-gold-400/40 flex items-center justify-center text-gold-400 text-sm">
          <i class="fa-solid fa-user"></i>
        </div>
        <div class="hidden sm:block">
          <div class="font-semibold text-gray-900 text-sm">${currentUser.name}</div>
          <div class="text-[0.65rem] text-gray-500 capitalize">${currentUser.role}</div>
        </div>
        <button id="logout-btn" class="p-2 text-gray-400 hover:text-red-600 transition rounded-lg" title="Cerrar sesión">
          <i class="fa-solid fa-arrow-right-from-bracket"></i>
        </button>
      </div>
    `;
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
  }

  // Mostrar/ocultar tabs según permisos
  updateTabsVisibility();
}

function handleLogout() {
  logAudit('logout', 'user', currentUser.id, {}, 'info');
  currentUser = null;
  sessionStorage.removeItem('quinta_admin_session');
  location.reload();
}

function hasPermission(permission) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  if (currentUser.permissions.includes('*')) return true;
  return currentUser.permissions.includes(permission);
}

function updateTabsVisibility() {
  const tabMap = {
    'calendar': 'reservations.read',
    'reservations': 'reservations.read',
    'spaces': 'spaces.crud',
    'turns': 'turns.crud',
    'pricing-rules': 'pricing.crud',
    'services': 'pricing.crud',
    'finances': 'finances.dashboard',
    'incomes': 'incomes.crud',
    'expenses': 'expenses.crud',
    'profitability': 'profitability.view',
    'users': 'users.crud',
    'audit': 'audit.read',
    'settings': 'settings.crud'
  };

  Object.entries(tabMap).forEach(([tabId, perm]) => {
    const tab = document.getElementById(`nav-btn-${tabId}`);
    const section = document.getElementById(`section-${tabId}`);
    if (tab) {
      tab.style.display = hasPermission(perm) ? 'flex' : 'none';
    }
    if (section && !hasPermission(perm)) {
      section.classList.add('hidden');
    }
  });
}

// Compatibilidad legacy: fechas bloqueadas se siguen leyendo de clave antigua
let blockedDates = [];
function loadBlockedDatesCompat() {
  blockedDates = loadJSON(STORAGE_KEYS.LEGACY_BLOCKED, []);
}
function saveBlockedDatesCompat() {
  saveJSON(STORAGE_KEYS.LEGACY_BLOCKED, blockedDates);
}
// Shim pricing legacy para no romper initPricingSettings existente
const STORAGE_KEY_PRICING = STORAGE_KEYS.LEGACY_PRICING;
const DEFAULT_PRICING = {
  basePrices: { pasadia: 700000, cumple: 1200000, boda: 2000000, corporativo: 1500000 },
  guestPrices: { '30': 0, '80': 300000, '150': 600000, '300': 1000000 },
  dayMultipliers: { semanaDiscount: 15, viernes: 150000, finde: 300000 },
  extraServices: { luces: 200000, parrillero: 250000, mobiliario: 200000 }
};
function getPricingConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PRICING);
    if (!saved) return JSON.parse(JSON.stringify(DEFAULT_PRICING));
    return JSON.parse(saved);
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_PRICING)); }
}

function bootApp() {
  initCalendarNavigation();
  initReservationFilters();
  initModalHandlers();
  initAdminTabs();
  initPricingSettings();
  if (typeof initSpacesManagement === 'function') initSpacesManagement();
  if (typeof initTurnsManagement === 'function') initTurnsManagement();
  if (typeof initServicesManagement === 'function') initServicesManagement();
  if (typeof initPricingRulesManagement === 'function') initPricingRulesManagement();
  if (typeof initFinancesManagement === 'function') initFinancesManagement();
  if (typeof initUsersManagement === 'function') initUsersManagement();
  if (typeof initSettingsManagement === 'function') initSettingsManagement();
  if (typeof initWizard === 'function') initWizard();
  const legacyPricing = document.getElementById('section-pricing');
  if (legacyPricing) legacyPricing.classList.add('hidden');
  renderDashboard();
  if (typeof checkAlerts === 'function') checkAlerts();
}

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  loadBlockedDatesCompat();
  // initAuth decide si mostrar login o bootear directo
  initAuthBoot();
});

function initAuthBoot() {
  const session = sessionStorage.getItem('quinta_admin_session');
  if (session) {
    try {
      const { userId, expires } = JSON.parse(session);
      if (new Date(expires) > new Date()) {
        const u = users.find(x => x.id === userId && x.active);
        if (u) {
          currentUser = u;
          currentUser.lastLogin = nowISO();
          saveJSON(STORAGE_KEYS.USERS, users);
          showApp();
          bootApp();
          return;
        }
      }
    } catch (e) { sessionStorage.removeItem('quinta_admin_session'); }
  }
  showLoginModal();
}

/* ==========================================================================
   2. Renderizado Completo del Dashboard
   ========================================================================== */
function renderDashboard() {
  renderKPIs();
  renderCalendar();
  renderReservationsTable();
  if (typeof renderSpaces === 'function') renderSpaces();
  if (typeof renderTurns === 'function') renderTurns();
  if (typeof renderServices === 'function') renderServices();
  if (typeof renderPricingRules === 'function') renderPricingRules();
  if (typeof renderFinances === 'function') renderFinances();
  if (typeof renderIncomes === 'function') renderIncomes();
  if (typeof renderExpenses === 'function') renderExpenses();
  if (typeof renderProfitability === 'function') renderProfitability();
  if (typeof renderUsers === 'function') renderUsers();
  if (typeof renderAudit === 'function') renderAudit();
  if (typeof renderSettings === 'function') renderSettings();
  if (typeof renderAlerts === 'function') renderAlerts();
  if (typeof updateRecurringBadge === 'function') updateRecurringBadge();
}

function resAmount(r){ return r.totalPrice ?? r.estimatedPrice ?? 0; }
function renderKPIs() {
  const currentMonth = currentCalendarDate.getMonth();
  const currentYear = currentCalendarDate.getFullYear();

  let confirmedCount = 0;
  let pendingCount = 0;
  let totalRevenue = 0;
  let occupiedDatesSet = new Set();

  reservations.forEach(r => {
    const st = normStatus(r.status);
    const dStr = getPrimaryDateOfReservation(r);
    const inMonth = dStr ? (new Date(dStr + 'T00:00:00').getMonth() === currentMonth && new Date(dStr + 'T00:00:00').getFullYear() === currentYear) : false;
    if (['confirmada','pagado_parcial','pagado','en_curso'].includes(st)) {
      if (inMonth) { confirmedCount++; totalRevenue += resAmount(r); if(dStr) occupiedDatesSet.add(dStr); }
    } else if (['pendiente','solicitud'].includes(st)) {
      pendingCount++;
      if (inMonth && dStr) occupiedDatesSet.add(dStr);
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
function reservationsOnDate(dateStr) {
  const ids = new Set(reservationSpaces.filter(rs => rs.date === dateStr).map(rs => rs.reservationId));
  // legacy fallback: reserva con r.date directo
  reservations.forEach(r => { if (r.date === dateStr) ids.add(r.id); });
  return [...ids].map(id => reservations.find(r => r.id === id)).filter(Boolean);
}

/* ==========================================================================
   3. Calendario Interactivo de Disponibilidad
   ========================================================================== */
function initCalendarNavigation() {
  document.getElementById('cal-prev-btn').addEventListener('click', () => {
    calStep(-1);
    renderDashboard();
  });

  document.getElementById('cal-next-btn').addEventListener('click', () => {
    calStep(1);
    renderDashboard();
  });

  document.getElementById('cal-today-btn').addEventListener('click', () => {
    currentCalendarDate = new Date();
    renderDashboard();
  });

  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => setCalView(btn.getAttribute('data-view')));
  });
}
function calStep(dir) {
  if (currentView === 'week') currentCalendarDate.setDate(currentCalendarDate.getDate() + dir * 7);
  else if (currentView === 'day') currentCalendarDate.setDate(currentCalendarDate.getDate() + dir);
  else currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
}
function setCalView(view) {
  currentView = view;
  document.querySelectorAll('.cal-view-btn').forEach(b => {
    if (b.getAttribute('data-view') === view) {
      b.classList.remove('text-gray-600', 'hover:bg-white');
      b.classList.add('bg-forest-800', 'text-white', 'shadow');
    } else {
      b.classList.add('text-gray-600', 'hover:bg-white');
      b.classList.remove('bg-forest-800', 'text-white', 'shadow');
    }
  });
  renderCalendar();
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = lunes
  x.setDate(x.getDate() - dow);
  return x;
}

function renderCalendar() {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthGrid = document.getElementById('cal-days-grid');
  const weekGrid = document.getElementById('cal-week-grid');
  const dayGrid = document.getElementById('cal-day-grid');
  const weekdayHeaders = document.getElementById('cal-weekday-headers');
  const titleEl = document.getElementById('cal-month-title');

  [monthGrid, weekGrid, dayGrid].forEach(g => { if (g) g.classList.add('hidden'); });
  if (weekdayHeaders) weekdayHeaders.classList.toggle('hidden', currentView !== 'month');

  if (currentView === 'week') {
    if (weekGrid) weekGrid.classList.remove('hidden');
    const mon = weekMonday(currentCalendarDate);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    if (titleEl) titleEl.textContent = `Semana ${mon.getDate()} ${monthNames[mon.getMonth()]} – ${sun.getDate()} ${monthNames[sun.getMonth()]} ${sun.getFullYear()}`;
    renderWeekGrid(mon);
    return;
  }
  if (currentView === 'day') {
    if (dayGrid) dayGrid.classList.remove('hidden');
    const f = currentCalendarDate.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (titleEl) titleEl.textContent = f.charAt(0).toUpperCase() + f.slice(1);
    renderDayGrid(toDateStr(currentCalendarDate));
    return;
  }

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

  if (monthGrid) monthGrid.classList.remove('hidden');
  const grid = monthGrid;
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

    // Verificar estado de la fecha (nuevo modelo multi-espacio + legacy)
    const isBlocked = blockedDates.includes(dateStr);
    const dayRes = reservationsOnDate(dateStr).filter(r => isActiveReservation(r) || normStatus(r.status)==='pendiente');
    const confirmedRes = dayRes.find(r => ['confirmada','pagado_parcial','pagado','en_curso'].includes(normStatus(r.status))) || reservations.find(r => r.date === dateStr && normStatus(r.status) === 'confirmada');
    const pendingRes = dayRes.find(r => ['pendiente','solicitud'].includes(normStatus(r.status))) || reservations.find(r => r.date === dateStr && normStatus(r.status) === 'pendiente');

    let status = 'available';
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

    const spaceDots = (r) => {
      const sps = getSpacesOfReservation(r.id);
      if (!sps.length) return '';
      return `<span class="flex gap-1 mt-1">` + sps.slice(0,4).map(rs => {
        const sp = getSpaceById(rs.spaceId);
        const tn = getTurnById(rs.turnId);
        return `<span title="${sp?.name||rs.spaceId} · ${tn?.shortName||rs.turnId}" class="w-2.5 h-2.5 rounded-full inline-block border border-white shadow" style="background:${sp?.color||'#999'}"></span>`;
      }).join('') + `</span>`;
    };

    if (status === 'past') {
      cardBgClass = 'bg-gray-100/70 border-gray-200 text-gray-400 opacity-60';
      badgeHtml = '<span class="text-[0.65rem] text-gray-400 font-medium">Pasado</span>';
    } else if (status === 'confirmed') {
      cardBgClass = 'bg-red-50/80 border-red-200 hover:border-red-400 text-red-900 shadow-sm';
      const label = isBlocked ? '🔒 No Disponible' : `🔴 ${(confirmedRes?.clientName||'Ocupado').split(' ').slice(0,2).join(' ')}`;
      const bal = confirmedRes ? ((confirmedRes.totalPrice||confirmedRes.estimatedPrice||0) - (confirmedRes.paidAmount||0)) : 0;
      badgeHtml = `
        <span class="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[0.65rem] font-bold truncate max-w-full">
          ${label}
        </span>
        ${confirmedRes ? spaceDots(confirmedRes) : ''}
        ${bal>0?`<span class="text-[0.6rem] font-bold text-red-600">Saldo ${formatGs(bal)}</span>`:''}
      `;
    } else if (status === 'pending') {
      cardBgClass = 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-900 shadow-sm';
      badgeHtml = `
        <span class="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[0.65rem] font-bold truncate max-w-full">
          🟡 ${pendingRes.clientName.split(' ')[0]} (Petición)
        </span>
        ${spaceDots(pendingRes)}
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

/* Vista semana: 7 columnas con turnos y espacios ocupados */
function renderWeekGrid(monday) {
  const grid = document.getElementById('cal-week-grid');
  if (!grid) return;
  const todayStr = getTodayStr();
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  let html = '<div class="grid grid-cols-7 gap-2 min-w-[720px]">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    const ds = toDateStr(d);
    const isToday = ds === todayStr;
    const dayRes = reservationsOnDate(ds).filter(r => isActiveReservation(r) || ['pendiente', 'solicitud'].includes(normStatus(r.status)));
    const chips = dayRes.length ? dayRes.map(r => {
      const st = normStatus(r.status);
      const cls = ['confirmada', 'pagado_parcial', 'pagado', 'en_curso'].includes(st) ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200';
      const sps = getSpacesOfReservation(r.id).map(x => `${getSpaceById(x.spaceId)?.shortName||x.spaceId}·${getTurnById(x.turnId)?.shortName||x.turnId}`).join(' + ') || (r.eventType || '');
      return `<button onclick="event.stopPropagation();openReservationDetail('${r.id}')" class="w-full text-left text-[0.65rem] p-1.5 rounded-lg border ${cls} font-bold truncate" title="${r.clientName} · ${sps}">${r.clientName.split(' ').slice(0, 2).join(' ')}<span class="block font-medium opacity-80 truncate">${sps}</span></button>`;
    }).join('') : '<span class="text-[0.65rem] text-emerald-700 font-bold">🟢 Libre</span>';
    html += `<div class="rounded-2xl border ${isToday ? 'border-forest-800 ring-2 ring-forest-800/20' : 'border-gray-200'} bg-white p-2 min-h-[140px] cursor-pointer hover:shadow" onclick="openDayDetailModal('${ds}','${dayRes.length ? 'confirmed' : 'available'}',null,${blockedDates.includes(ds)})">
      <div class="text-center pb-1 border-b border-gray-100 mb-1">
        <div class="text-[0.6rem] font-extrabold uppercase text-gray-400">${dayNames[i]}${isToday ? ' · Hoy' : ''}</div>
        <div class="font-serif font-bold ${isToday ? 'text-forest-900' : 'text-gray-800'}">${d.getDate()}</div>
      </div>
      <div class="space-y-1">${chips}</div>
    </div>`;
  }
  grid.innerHTML = html + '</div>';
}

/* Vista día: matriz espacios x turnos con disponibilidad y acción */
function renderDayGrid(dateStr) {
  const grid = document.getElementById('cal-day-grid');
  if (!grid) return;
  const activeSpaces = spaces.filter(s => s.active);
  const activeTurns = turns.filter(t => t.active);
  const dayRes = reservationsOnDate(dateStr);
  let html = `<div class="flex flex-wrap items-center gap-2">
    <input type="date" value="${dateStr}" onchange="currentCalendarDate=new Date(this.value+'T00:00:00');renderDashboard()" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-800">
    <button onclick="openWizard('${dateStr}')" class="btn-forest px-4 py-2 rounded-xl text-xs font-bold shadow"><i class="fa-solid fa-plus mr-1"></i>Reservar este día</button>
  </div>`;
  html += '<div class="overflow-x-auto"><table class="w-full text-sm border-separate" style="border-spacing:0">';
  html += `<thead><tr><th class="text-left text-xs uppercase text-gray-400 p-2">Espacio \\ Turno</th>` + activeTurns.map(t => `<th class="text-center text-xs p-2"><span class="px-2 py-1 rounded-lg text-white font-bold" style="background:${t.color}">${t.shortName||t.name}</span><span class="block text-[0.6rem] text-gray-400 font-medium mt-0.5">${t.startTime}–${t.endTime}</span></th>`).join('') + '</tr></thead><tbody>';
  activeSpaces.forEach(s => {
    html += `<tr><td class="p-2 border-t border-gray-100"><span class="flex items-center gap-2 font-bold text-sm"><span class="w-3 h-3 rounded-full inline-block" style="background:${s.color}"></span>${s.shortName}</span></td>`;
    activeTurns.forEach(t => {
      const applies = !t.spaces?.length || t.spaces.includes(s.id);
      if (!applies) { html += '<td class="p-1 border-t border-gray-100 text-center text-gray-300 text-xs">—</td>'; return; }
      const occ = reservationSpaces.filter(rs => rs.spaceId === s.id && rs.date === dateStr && (getTurnById(rs.turnId)?.id === t.id || turnsOverlap(getTurnById(rs.turnId), t)) && isActiveReservation(reservations.find(r => r.id === rs.reservationId) || {}));
      if (occ.length) {
        const r = reservations.find(x => x.id === occ[0].reservationId);
        html += `<td class="p-1 border-t border-gray-100"><button onclick="openReservationDetail('${r?.id}')" class="w-full p-2 rounded-xl bg-red-50 border border-red-200 text-left hover:bg-red-100"><span class="block text-xs font-bold text-red-800 truncate">${r?.clientName||'Ocupado'}</span><span class="block text-[0.6rem] text-red-500 font-bold">${STATUS_META[normStatus(r?.status)]?.l||''}</span></button></td>`;
      } else {
        html += `<td class="p-1 border-t border-gray-100"><button onclick="openWizard('${dateStr}','${s.id}','${t.id}')" class="w-full p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-100">🟢 Libre</button></td>`;
      }
    });
    html += '</tr>';
  });
  grid.innerHTML = html + '</tbody></table></div>' + (dayRes.length ? '' : '<p class="text-xs text-gray-400">Día sin reservas. Toca “Libre” para crear una con ese espacio y turno preseleccionados.</p>');
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

function saveBlockedDates() { saveBlockedDatesCompat(); }
function saveReservations() { saveJSON(STORAGE_KEYS.RESERVATIONS, reservations); }
function toggleBlockDate(dateStr, shouldBlock) {
  if (shouldBlock) {
    if (!blockedDates.includes(dateStr)) blockedDates.push(dateStr);
    showToast(`Fecha ${dateStr} bloqueada (No disponible)`, 'info');
    logAudit('update', 'blocked_date', dateStr, { blocked: true }, 'warning');
  } else {
    blockedDates = blockedDates.filter(d => d !== dateStr);
    showToast(`Fecha ${dateStr} liberada (Disponible)`, 'success');
    logAudit('update', 'blocked_date', dateStr, { blocked: false }, 'info');
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

  const bindSel = (id, set) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('change', () => { set(el.value); renderReservationsTable(); });
      el.addEventListener('input', () => { set(el.value); renderReservationsTable(); });
    }
  };
  bindSel('filter-res-space', v => resFilterSpace = v);
  bindSel('filter-res-turn', v => resFilterTurn = v);
  bindSel('filter-res-from', v => resFilterFrom = v);
  bindSel('filter-res-to', v => resFilterTo = v);
  const clearBtn = document.getElementById('btn-clear-res-filters');
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = '1';
    clearBtn.addEventListener('click', () => {
      resFilterSpace = resFilterTurn = resFilterFrom = resFilterTo = '';
      ['filter-res-space', 'filter-res-turn', 'filter-res-from', 'filter-res-to'].forEach(i => {
        const el = document.getElementById(i);
        if (el) el.value = '';
      });
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
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach(t => {
        t.classList.remove('bg-forest-800', 'text-white', 'shadow', 'active');
        t.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-200');
      });
      tab.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-200');
      tab.classList.add('bg-forest-800', 'text-white', 'shadow', 'active');
      document.querySelectorAll('.admin-view-section').forEach(sec => {
        if (sec.id === `section-${target}`) sec.classList.remove('hidden');
        else sec.classList.add('hidden');
      });
      // refrescar renders perezosos
      if (target === 'finances' && typeof renderFinances === 'function') renderFinances();
      if (target === 'profitability' && typeof renderProfitability === 'function') renderProfitability();
      if (target === 'audit' && typeof renderAudit === 'function') renderAudit();
    });
  });
  // Ocultar sección legacy pricing si existe (se mantiene por compat pero sin tab)
  const legacyPricing = document.getElementById('section-pricing');
  if (legacyPricing) legacyPricing.classList.add('hidden');
}

/* ==========================================================================
   9. Parametrización y Configuración de Tarifas / Precios (legacy UI)
   ========================================================================== */
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
        mobiliario: parseInt(inputExtraMobiliario.value) || 0
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

/* ==========================================================================
   FASE 3.3 - NÚCLEO: helpers reservas multi-espacio, disponibilidad y precios
   ========================================================================== */
const ACTIVE_STATUSES = ['solicitud', 'pendiente', 'confirmada', 'confirmado', 'pagado_parcial', 'pagado', 'en_curso'];
function normStatus(s) {
  if (!s) return 'pendiente';
  s = String(s).toLowerCase();
  if (s === 'confirmado') return 'confirmada';
  if (s === 'cancelada' || s === 'cancelado') return 'cancelada';
  if (s === 'finalizada' || s === 'finalizado') return 'finalizada';
  return s;
}
function isActiveReservation(r) {
  return ACTIVE_STATUSES.includes(normStatus(r.status));
}
function getSpacesOfReservation(resId) {
  return reservationSpaces.filter(rs => rs.reservationId === resId);
}
function getPrimaryDateOfReservation(r) {
  const sps = getSpacesOfReservation(r.id);
  if (sps.length) return sps.map(x => x.date).sort()[0];
  return r.date || null;
}
function getTurnById(id) { return turns.find(t => t.id === id); }
function getSpaceById(id) { return spaces.find(s => s.id === id); }
function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}
function turnsOverlap(a, b) {
  return intervalsOverlap(intervalOfTurn(a), intervalOfTurn(b));
}
/* Intervalo en minutos [s,e) — soporta horas personalizadas y cruce de medianoche */
function intervalOfTurn(t, customStart, customEnd) {
  if (!t) return null; // desconocido = choca con todo por seguridad
  if (t.id === 'dia_completo') return { s: 0, e: 24 * 60 };
  const s = timeToMin(customStart || t.startTime);
  let e = timeToMin(customEnd || t.endTime);
  if (!(e > s)) e += 24 * 60; // cruza medianoche o duración nula
  return { s, e };
}
function rsInterval(rs) {
  const t = getTurnById(rs.turnId) || { id: rs.turnId };
  return intervalOfTurn(t, rs.customStart, rs.customEnd);
}
function intervalsOverlap(i1, i2) {
  if (!i1 || !i2) return true;
  return Math.max(i1.s, i2.s) < Math.min(i1.e, i2.e);
}
function turnHours(turnId, customStart, customEnd) {
  const iv = intervalOfTurn(getTurnById(turnId) || { id: turnId }, customStart, customEnd);
  if (!iv) return 0;
  return Math.round(((iv.e - iv.s) / 60) * 2) / 2; // redondeo a media hora
}
// Validación anti-doble-reserva (frontend + lógica reutilizable en "backend" local)
function checkAvailability(spaceId, date, turnId, excludeReservationId = null, customStart = null, customEnd = null) {
  const turn = getTurnById(turnId) || { id: turnId };
  const req = intervalOfTurn(turn, customStart, customEnd);
  const conflicts = reservationSpaces.filter(rs => {
    if (rs.spaceId !== spaceId) return false;
    if (rs.date !== date) return false;
    if (excludeReservationId && rs.reservationId === excludeReservationId) return false;
    const r = reservations.find(x => x.id === rs.reservationId);
    if (!r) return false;
    if (!isActiveReservation(r)) return false;
    return intervalsOverlap(req, rsInterval(rs));
  });
  return { available: conflicts.length === 0, conflicts };
}
function checkMultiAvailability(spaceIds, date, turnId, excludeReservationId = null, customStart = null, customEnd = null) {
  const allConflicts = [];
  spaceIds.forEach(sid => {
    const r = checkAvailability(sid, date, turnId, excludeReservationId, customStart, customEnd);
    if (!r.available) allConflicts.push({ spaceId: sid, conflicts: r.conflicts });
  });
  return { available: allConflicts.length === 0, conflicts: allConflicts };
}
// Motor de precios por reglas (fixed | hourly | per_person)
function evaluatePrice(spaceIds, turnId, dateStr, guestsCount = 30, hoursOverride = null, customStart = null, customEnd = null) {
  const date = new Date(dateStr + 'T00:00:00');
  const dow = date.getDay();
  const hours = hoursOverride ?? turnHours(turnId, customStart, customEnd);
  const sorted = [...pricingRules].filter(r => r.active !== false).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  let total = 0;
  const breakdown = [];
  spaceIds.forEach(sid => {
    const space = getSpaceById(sid);
    let applied = null;
    for (const rule of sorted) {
      const c = rule.conditions || {};
      if (c.spaces && c.spaces.length && !c.spaces.includes(sid)) continue;
      if (c.turns && c.turns.length && !c.turns.includes(turnId)) continue;
      if (c.daysOfWeek && c.daysOfWeek.length && !c.daysOfWeek.includes(dow)) continue;
      if (c.specificDates && c.specificDates.length && !c.specificDates.includes(dateStr)) continue;
      if (c.dateRange && c.dateRange.from && c.dateRange.to) {
        if (dateStr < c.dateRange.from || dateStr > c.dateRange.to) continue;
      }
      if (c.guestRange && (guestsCount < (c.guestRange.min || 0) || guestsCount > (c.guestRange.max || 9999))) continue;
      if (c.minDuration && hours < c.minDuration) continue;
      applied = rule;
      break;
    }
    let price = space?.basePrice || 0;
    let label = `${space?.shortName || sid} (base)`;
    if (applied) {
      const pr = applied.pricing || {};
      const type = pr.type || 'fixed';
      if (type === 'hourly') {
        price = Math.round((pr.perHour || 0) * hours);
        label = `${space?.shortName || sid} · ${applied.name} (${hours}h × ${formatGs(pr.perHour || 0)})`;
      } else if (type === 'per_person') {
        price = Math.round((pr.perPerson || 0) * guestsCount);
        label = `${space?.shortName || sid} · ${applied.name} (${guestsCount} pers. × ${formatGs(pr.perPerson || 0)})`;
      } else {
        price = pr.basePrice || 0;
        label = `${space?.shortName || sid} · ${applied.name}`;
      }
      // descuentos de la regla
      (applied.discounts || []).forEach(d => {
        if (d.type === 'weekday' && d.days && d.days.includes(dow) && d.percent) {
          price = Math.round(price * (1 - d.percent / 100));
        } else if (d.type === 'early_bird' || d.percent) {
          if (d.days && !d.days.includes(dow)) return;
          if (d.percent) price = Math.round(price * (1 - d.percent / 100));
        }
      });
      (applied.surcharges || []).forEach(s => {
        if (s.fixed) price += s.fixed;
        else if (s.percent) price = Math.round(price * (1 + s.percent / 100));
      });
    } else {
      // fallback legacy: recargo finde/viernes del config antiguo
      const legacy = getPricingConfig();
      if ([0, 6].includes(dow) && legacy.dayMultipliers?.finde) price += legacy.dayMultipliers.finde;
      else if (dow === 5 && legacy.dayMultipliers?.viernes) price += legacy.dayMultipliers.viernes;
      else if ([1,2,3,4].includes(dow) && legacy.dayMultipliers?.semanaDiscount) {
        price = Math.round(price * (1 - legacy.dayMultipliers.semanaDiscount / 100));
      }
    }
    total += price;
    breakdown.push({ spaceId: sid, label, price });
  });
  return { total, breakdown };
}
function recalcReservationTotals(resId) {
  const r = reservations.find(x => x.id === resId);
  if (!r) return;
  const paid = payments.filter(p => p.reservationId === resId && p.status !== 'anulado').reduce((a, p) => a + (p.amount || 0), 0);
  r.paidAmount = paid;
  r.balance = Math.max(0, (r.totalPrice || 0) - paid);
  if (r.balance === 0 && (r.totalPrice || 0) > 0) {
    if (['confirmada', 'pagado_parcial'].includes(normStatus(r.status))) r.status = 'pagado';
  } else if (paid > 0 && normStatus(r.status) === 'confirmada') {
    r.status = 'pagado_parcial';
  }
  r.updatedAt = nowISO();
  saveJSON(STORAGE_KEYS.RESERVATIONS, reservations);
}

// Toast con tipo error
function showToastSafe(message, type = 'info') {
  const toast = document.getElementById('admin-toast');
  const toastMsg = document.getElementById('admin-toast-message');
  if (!toast || !toastMsg) { alert(message); return; }
  toastMsg.textContent = message;
  let cls = 'fixed bottom-6 right-6 z-50 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300 ';
  if (type === 'success') cls += 'bg-forest-900 border-l-4 border-emerald-400';
  else if (type === 'error') cls += 'bg-red-900 border-l-4 border-red-400';
  else cls += 'bg-gray-900 border-l-4 border-gold-400';
  toast.className = cls;
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 4000);
}
// Reemplazo seguro (mantiene compat con llamadas antiguas)
function showToast(message, type = 'info') { showToastSafe(message, type); }

// Modal genérico CRUD
function openGenericModal({ title, subtitle, bodyHtml, onSubmit, submitLabel = 'Guardar' }) {
  closeGenericModal();
  const wrap = document.createElement('div');
  wrap.id = 'generic-modal';
  wrap.className = 'fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm';
  wrap.innerHTML = `
    <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-gray-100 relative max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
        <div><span class="text-xs font-bold uppercase tracking-wider text-gold-600 block">${subtitle || ''}</span>
        <h3 class="font-serif text-xl font-bold text-forest-900">${title}</h3></div>
        <button id="generic-modal-close" class="p-2 text-gray-400 hover:text-gray-700"><i class="fa-solid fa-xmark text-xl"></i></button>
      </div>
      <form id="generic-modal-form" class="space-y-4">${bodyHtml}
        <div class="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" id="generic-modal-cancel" class="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button type="submit" class="btn-forest px-6 py-2.5 rounded-xl text-xs font-bold shadow"><i class="fa-solid fa-floppy-disk mr-1"></i>${submitLabel}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('generic-modal-close').onclick = closeGenericModal;
  document.getElementById('generic-modal-cancel').onclick = closeGenericModal;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeGenericModal(); });
  document.getElementById('generic-modal-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    // checkboxes múltiples de espacios
    data._spaces = Array.from(e.target.querySelectorAll('input[name="spaces"]:checked')).map(i => i.value);
    if (onSubmit) onSubmit(data, e.target);
  });
}
function closeGenericModal() {
  const m = document.getElementById('generic-modal');
  if (m) m.remove();
}
function inputCls() { return 'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-800'; }
function lbl(t) { return `<label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">${t}</label>`; }

/* ---------------- ESPACIOS (FASE 3.3) ---------------- */
function initSpacesManagement() {
  document.getElementById('btn-add-space')?.addEventListener('click', () => openSpaceModal());
}
function renderSpaces() {
  const c = document.getElementById('spaces-list');
  if (!c) return;
  if (!spaces.length) { c.innerHTML = '<p class="text-sm text-gray-400">Sin espacios. Crea el primero.</p>'; return; }
  c.innerHTML = spaces.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(s => `
    <div class="p-5 rounded-2xl border border-gray-200 bg-gray-50/60 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg" style="background:${s.color||'#1b4332'}"><i class="${s.icon||'fa-solid fa-building'}"></i></div>
          <div><div class="font-bold text-gray-900">${s.name}</div><div class="text-xs text-gray-500">Cap: ${s.capacity||'-'} · ${s.active?'Activo':'Inactivo'}</div></div>
        </div>
        <span class="w-3 h-3 rounded-full" style="background:${s.color}"></span>
      </div>
      <p class="text-xs text-gray-600">${s.description||''}</p>
      <div class="flex gap-2 pt-1">
        <button onclick="openSpaceModal('${s.id}')" class="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-bold hover:bg-gray-100"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
        <button onclick="toggleSpace('${s.id}')" class="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-bold hover:bg-gray-100">${s.active?'Desactivar':'Activar'}</button>
        <button onclick="deleteSpace('${s.id}')" class="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold hover:bg-red-100"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    </div>`).join('');
}
function openSpaceModal(id = null) {
  if (!hasPermission('spaces.crud') && currentUser?.role !== 'admin') return showToast('Sin permiso', 'error');
  const s = id ? getSpaceById(id) : { name:'', shortName:'', description:'', icon:'fa-solid fa-building-columns', color:'#1b4332', capacity:50, active:true, sortOrder: spaces.length+1, amenities:[] };
  openGenericModal({
    title: id ? 'Editar espacio' : 'Nuevo espacio', subtitle: 'Configuración',
    bodyHtml: `
      ${lbl('Nombre *')}<input name="name" required value="${s.name||''}" class="${inputCls()}">
      <div class="grid grid-cols-2 gap-3">
        <div>${lbl('Nombre corto')}<input name="shortName" value="${s.shortName||''}" class="${inputCls()}"></div>
        <div>${lbl('Capacidad')}<input name="capacity" type="number" value="${s.capacity||''}" class="${inputCls()}"></div>
      </div>
      ${lbl('Descripción')}<textarea name="description" rows="2" class="${inputCls()}">${s.description||''}</textarea>
      <div class="grid grid-cols-3 gap-3">
        <div>${lbl('Icono (FA)')}<input name="icon" value="${s.icon||''}" class="${inputCls()}"></div>
        <div>${lbl('Color')}<input name="color" type="color" value="${s.color||'#1b4332'}" class="w-full h-11 rounded-xl border border-gray-200"></div>
        <div>${lbl('Orden')}<input name="sortOrder" type="number" value="${s.sortOrder||1}" class="${inputCls()}"></div>
      </div>
      <label class="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="active" ${s.active?'checked':''} class="rounded"> Activo</label>`,
    onSubmit: (d) => {
      const payload = { name: d.name.trim(), shortName: d.shortName.trim() || d.name.trim(), description: d.description, icon: d.icon, color: d.color, capacity: parseInt(d.capacity)||0, sortOrder: parseInt(d.sortOrder)||1, active: !!d.active, updatedAt: nowISO() };
      if (id) {
        Object.assign(getSpaceById(id), payload);
        logAudit('update', 'space', id, payload, 'info');
      } else {
        const ns = { id: 'sp-' + Date.now(), ...payload, basePrice: 0, requiresStaff: false, amenities: [], createdAt: nowISO() };
        spaces.push(ns);
        logAudit('create', 'space', ns.id, payload, 'info');
      }
      saveJSON(STORAGE_KEYS.SPACES, spaces);
      closeGenericModal(); renderSpaces(); showToast('Espacio guardado', 'success');
    }
  });
}
function toggleSpace(id) {
  const s = getSpaceById(id); if (!s) return;
  s.active = !s.active; s.updatedAt = nowISO();
  saveJSON(STORAGE_KEYS.SPACES, spaces); renderSpaces();
  logAudit('update', 'space', id, { active: s.active }, 'info');
}
function deleteSpace(id) {
  const used = reservationSpaces.some(rs => rs.spaceId === id);
  if (used) return showToast('No se puede eliminar: tiene reservas asociadas. Desactívalo.', 'error');
  if (!confirm('¿Eliminar este espacio?')) return;
  spaces = spaces.filter(s => s.id !== id);
  saveJSON(STORAGE_KEYS.SPACES, spaces); renderSpaces();
  logAudit('delete', 'space', id, {}, 'warning');
}

/* ---------------- TURNOS (FASE 3.3) ---------------- */
function initTurnsManagement() {
  document.getElementById('btn-add-turn')?.addEventListener('click', () => openTurnModal());
}
function renderTurns() {
  const c = document.getElementById('turns-list');
  if (!c) return;
  c.innerHTML = turns.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(t => {
    const spNames = (t.spaces||[]).map(sid => getSpaceById(sid)?.shortName || sid).join(', ');
    return `<div class="p-4 rounded-2xl border border-gray-200 bg-gray-50/60 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white" style="background:${t.color}"><i class="fa-solid fa-clock"></i></div>
        <div><div class="font-bold text-gray-900 text-sm">${t.name} <span class="text-gray-400 font-medium">· ${t.startTime}–${t.endTime} (${t.durationHours||'var'}h)</span></div>
        <div class="text-xs text-gray-500">Espacios: ${spNames||'todos'} ${t.allowCustom?'· permite personalizado':''} ${t.active?'':'· INACTIVO'}</div></div>
      </div>
      <div class="flex gap-2">
        <button onclick="openTurnModal('${t.id}')" class="px-3 py-1.5 rounded-lg bg-white border text-xs font-bold">Editar</button>
        <button onclick="toggleTurn('${t.id}')" class="px-3 py-1.5 rounded-lg bg-white border text-xs font-bold">${t.active?'Desactivar':'Activar'}</button>
        <button onclick="deleteTurn('${t.id}')" class="px-3 py-1.5 rounded-lg bg-red-50 border-red-200 border text-red-700 text-xs font-bold">Eliminar</button>
      </div></div>`;
  }).join('');
}
function openTurnModal(id = null) {
  if (currentUser?.role !== 'admin') return showToast('Sin permiso', 'error');
  const t = id ? getTurnById(id) : { name:'', shortName:'', startTime:'09:00', endTime:'13:00', durationHours:4, color:'#f59e0b', spaces: spaces.map(s=>s.id), active:true, sortOrder: turns.length+1, allowCustom:false };
  const spaceChecks = spaces.map(s => `<label class="flex items-center gap-2 text-xs p-2 rounded-lg border cursor-pointer"><input type="checkbox" name="spaces" value="${s.id}" ${(t.spaces||[]).includes(s.id)?'checked':''} class="rounded"> ${s.shortName}</label>`).join('');
  openGenericModal({
    title: id ? 'Editar turno' : 'Nuevo turno', subtitle: 'Modalidad de alquiler',
    bodyHtml: `
      ${lbl('Nombre *')}<input name="name" required value="${t.name||''}" class="${inputCls()}">
      <div class="grid grid-cols-2 gap-3">
        <div>${lbl('Inicio')}<input name="startTime" type="time" value="${t.startTime}" class="${inputCls()}"></div>
        <div>${lbl('Fin')}<input name="endTime" type="time" value="${t.endTime}" class="${inputCls()}"></div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>${lbl('Duración (h)')}<input name="durationHours" type="number" step="0.5" value="${t.durationHours||0}" class="${inputCls()}"></div>
        <div>${lbl('Color')}<input name="color" type="color" value="${t.color||'#f59e0b'}" class="w-full h-11 rounded-xl border"></div>
        <div>${lbl('Orden')}<input name="sortOrder" type="number" value="${t.sortOrder||1}" class="${inputCls()}"></div>
      </div>
      ${lbl('Espacios aplicables')}<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${spaceChecks}</div>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="allowCustom" ${t.allowCustom?'checked':''}> Permite horario personalizado</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${t.active?'checked':''}> Activo</label>
      </div>`,
    onSubmit: (d, form) => {
      const payload = { name: d.name.trim(), shortName: d.name.trim(), startTime: d.startTime, endTime: d.endTime, durationHours: parseFloat(d.durationHours)||0, color: d.color, sortOrder: parseInt(d.sortOrder)||1, spaces: d._spaces, allowCustom: !!form.querySelector('[name="allowCustom"]').checked, active: !!form.querySelector('[name="active"]').checked };
      if (id) { Object.assign(getTurnById(id), payload); logAudit('update','turn',id,payload,'info'); }
      else { const nt = { id: 'tn-' + Date.now(), ...payload }; turns.push(nt); logAudit('create','turn',nt.id,payload,'info'); }
      saveJSON(STORAGE_KEYS.TURNS, turns); closeGenericModal(); renderTurns(); showToast('Turno guardado','success');
    }
  });
}
function toggleTurn(id) { const t = getTurnById(id); t.active = !t.active; saveJSON(STORAGE_KEYS.TURNS, turns); renderTurns(); }
function deleteTurn(id) {
  if (reservationSpaces.some(rs => rs.turnId === id)) return showToast('Turno en uso en reservas. Desactívalo.', 'error');
  if (!confirm('¿Eliminar turno?')) return;
  turns = turns.filter(t => t.id !== id); saveJSON(STORAGE_KEYS.TURNS, turns); renderTurns();
}

/* ---------------- SERVICIOS (FASE 3.3) ---------------- */
function initServicesManagement() {
  document.getElementById('btn-add-service')?.addEventListener('click', () => openServiceModal());
}
function renderServices() {
  const c = document.getElementById('services-list');
  if (!c) return;
  c.innerHTML = services.map(s => `<div class="p-4 rounded-2xl border bg-gray-50/60 flex flex-col sm:flex-row justify-between gap-3">
    <div><div class="font-bold text-sm">${s.name}</div><div class="text-xs text-gray-500">${s.description||''} · ${s.unit||'evento'} ${s.active?'':'· INACTIVO'}</div></div>
    <div class="flex items-center gap-2"><span class="font-bold text-sm">${formatGs(s.price)}</span>
    <button onclick="openServiceModal('${s.id}')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">Editar</button>
    <button onclick="toggleService('${s.id}')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">${s.active?'Desactivar':'Activar'}</button>
    <button onclick="deleteService('${s.id}')" class="px-3 py-1.5 bg-red-50 border-red-200 border text-red-700 rounded-lg text-xs font-bold">Eliminar</button></div></div>`).join('');
}
function openServiceModal(id = null) {
  const s = id ? services.find(x => x.id === id) : { name:'', description:'', price:0, unit:'evento', active:true, sortOrder: services.length+1 };
  openGenericModal({
    title: id?'Editar servicio':'Nuevo servicio', subtitle:'Adicionales',
    bodyHtml: `${lbl('Nombre *')}<input name="name" required value="${s.name||''}" class="${inputCls()}">
      ${lbl('Descripción')}<input name="description" value="${s.description||''}" class="${inputCls()}">
      <div class="grid grid-cols-3 gap-3">
      <div>${lbl('Precio (Gs)')}<input name="price" type="number" step="1000" value="${s.price||0}" class="${inputCls()}"></div>
      <div>${lbl('Unidad')}<select name="unit" class="${inputCls()}"><option ${s.unit==='evento'?'selected':''}>evento</option><option ${s.unit==='juego'?'selected':''}>juego</option><option ${s.unit==='hora'?'selected':''}>hora</option><option ${s.unit==='persona'?'selected':''}>persona</option></select></div>
      <div>${lbl('Orden')}<input name="sortOrder" type="number" value="${s.sortOrder||1}" class="${inputCls()}"></div></div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${s.active?'checked':''}> Activo</label>`,
    onSubmit: d => {
      const p = { name: d.name.trim(), description: d.description, price: parseInt(d.price)||0, unit: d.unit, sortOrder: parseInt(d.sortOrder)||1, active: !!d.active };
      if (id) { Object.assign(services.find(x=>x.id===id), p); logAudit('update','service',id,p,'info'); }
      else { const ns = { id: generateId('svc'), key: 'svc-'+Date.now(), ...p }; services.push(ns); logAudit('create','service',ns.id,p,'info'); }
      saveJSON(STORAGE_KEYS.SERVICES, services); closeGenericModal(); renderServices(); showToast('Servicio guardado','success');
    }
  });
}
function toggleService(id) { const s = services.find(x=>x.id===id); s.active=!s.active; saveJSON(STORAGE_KEYS.SERVICES, services); renderServices(); }
function deleteService(id) { if(!confirm('¿Eliminar servicio?'))return; services = services.filter(x=>x.id!==id); saveJSON(STORAGE_KEYS.SERVICES, services); renderServices(); }

/* ---------------- REGLAS DE PRECIO (motor flexible) ---------------- */
function initPricingRulesManagement() {
  document.getElementById('btn-add-pricing-rule')?.addEventListener('click', () => openPricingRuleModal());
}
function renderPricingRules() {
  const c = document.getElementById('pricing-rules-list');
  if (!c) return;
  if (!pricingRules.length) { c.innerHTML = '<div class="p-6 text-center text-sm text-gray-400 border border-dashed rounded-2xl">Sin reglas. El sistema usa precios base de espacios + recargos legacy. Crea tu primera regla.</div>'; return; }
  c.innerHTML = pricingRules.slice().sort((a,b)=>(b.priority||0)-(a.priority||0)).map(r => {
    const cond = r.conditions||{};
    const sp = (cond.spaces||[]).map(s=>getSpaceById(s)?.shortName||s).join(', ')||'Todos';
    const tn = (cond.turns||[]).map(t=>getTurnById(t)?.shortName||t).join(', ')||'Todos';
    return `<div class="p-4 rounded-2xl border ${r.active===false?'opacity-60':''} bg-gray-50/60 flex flex-col lg:flex-row justify-between gap-3">
      <div><div class="font-bold text-sm">${r.name} <span class="ml-2 text-[0.65rem] px-2 py-0.5 rounded-full bg-forest-800 text-white">Prio ${r.priority||0}</span> ${r.active===false?'<span class="text-[0.65rem] px-2 py-0.5 rounded-full bg-gray-200">Inactiva</span>':''}</div>
      <div class="text-xs text-gray-500 mt-1">Espacios: ${sp} · Turnos: ${tn} · Días: ${(cond.daysOfWeek||[]).join(',')||'todos'} ${cond.specificDates?.length?('· Fechas: '+cond.specificDates.join(',')):''} ${cond.dateRange?.from?('· '+cond.dateRange.from+' → '+cond.dateRange.to):''}</div>
      <div class="text-xs font-bold text-forest-900 mt-1">${r.pricing?.type==='hourly'?`${formatGs(r.pricing?.perHour)}/h`:r.pricing?.type==='per_person'?`${formatGs(r.pricing?.perPerson)}/pers.`:`${formatGs(r.pricing?.basePrice)}`}${r.conditions?.minDuration?` · mín. ${r.conditions.minDuration}h`:''} ${(r.discounts||[]).map(d=>` · -${
d.percent||0}%`).join('')} ${(r.surcharges||[]).map(s=>` · +${s.fixed?formatGs(s.fixed):(s.percent+'%')}`).join('')}</div></div>
      <div class="flex gap-2 items-start">
        <button onclick="openPricingRuleModal('${r.id}')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">Editar</button>
        <button onclick="togglePricingRule('${r.id}')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">${r.active===false?'Activar':'Pausar'}</button>
        <button onclick="deletePricingRule('${r.id}')" class="px-3 py-1.5 bg-red-50 border-red-200 border text-red-700 rounded-lg text-xs font-bold">Eliminar</button>
      </div></div>`;
  }).join('');
}
function openPricingRuleModal(id = null) {
  if (currentUser?.role !== 'admin') return showToast('Sin permiso', 'error');
  const r = id ? pricingRules.find(x=>x.id===id) : { name:'', priority:10, conditions:{spaces:[],turns:[],daysOfWeek:[],specificDates:[],dateRange:{from:'',to:''},guestRange:{min:1,max:300}}, pricing:{type:'fixed',basePrice:0}, discounts:[], surcharges:[], active:true };
  const c = r.conditions||{};
  const spChecks = spaces.map(s=>`<label class="flex items-center gap-1.5 text-xs p-2 border rounded-lg cursor-pointer"><input type="checkbox" name="spaces" value="${s.id}" ${(c.spaces||[]).includes(s.id)?'checked':''}> ${s.shortName}</label>`).join('');
  const tnChecks = turns.map(t=>`<label class="flex items-center gap-1.5 text-xs p-2 border rounded-lg cursor-pointer"><input type="checkbox" name="cturns" value="${t.id}" ${(c.turns||[]).includes(t.id)?'checked':''}> ${t.shortName}</label>`).join('');
  const dowNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const dowChecks = dowNames.map((n,i)=>`<label class="flex items-center gap-1 text-xs p-2 border rounded-lg cursor-pointer"><input type="checkbox" name="dow" value="${i}" ${(c.daysOfWeek||[]).includes(i)?'checked':''}> ${n}</label>`).join('');
  openGenericModal({
    title: id?'Editar regla':'Nueva regla de precio', subtitle:'Motor flexible',
    bodyHtml: `
      ${lbl('Nombre *')}<input name="name" required value="${r.name||''}" placeholder="Ej: Verano 2026 - Piscina finde" class="${inputCls()}">
      <div class="grid grid-cols-2 gap-3">
        <div>${lbl('Prioridad (mayor gana)')}<input name="priority" type="number" value="${r.priority||10}" class="${inputCls()}"></div>
        <div>${lbl('Tipo de cobro')}<select name="ptype" class="${inputCls()}">
          <option value="fixed" ${(r.pricing?.type||'fixed')==='fixed'?'selected':''}>Monto fijo por evento</option>
          <option value="hourly" ${r.pricing?.type==='hourly'?'selected':''}>Por hora</option>
          <option value="per_person" ${r.pricing?.type==='per_person'?'selected':''}>Por persona</option>
        </select></div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>${lbl('Precio fijo (Gs)')}<input name="basePrice" type="number" step="1000" value="${r.pricing?.basePrice||0}" class="${inputCls()}"></div>
        <div>${lbl('Por hora (Gs/h)')}<input name="perHour" type="number" step="1000" value="${r.pricing?.perHour||0}" class="${inputCls()}"></div>
        <div>${lbl('Por persona (Gs)')}<input name="perPerson" type="number" step="1000" value="${r.pricing?.perPerson||0}" class="${inputCls()}"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>${lbl('Duración mínima (h, 0 = sin mínimo)')}<input name="minDuration" type="number" step="0.5" min="0" value="${r.conditions?.minDuration||0}" class="${inputCls()}"></div>
        <div>${lbl('Invitados máx. (0 = sin tope)')}<input name="maxGuests" type="number" value="${(r.conditions?.guestRange?.max===9999||!r.conditions?.guestRange)?0:(r.conditions.guestRange.max||0)}" class="${inputCls()}"></div>
      </div>
      ${lbl('Espacios (vacío = todos)')}<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${spChecks}</div>
      ${lbl('Turnos (vacío = todos)')}<div class="grid grid-cols-2 sm:grid-cols-5 gap-2">${tnChecks}</div>
      ${lbl('Días semana (vacío = todos)')}<div class="grid grid-cols-4 sm:grid-cols-7 gap-2">${dowChecks}</div>
      <div class="grid grid-cols-2 gap-3">
        <div>${lbl('Temporada desde')}<input name="from" type="date" value="${c.dateRange?.from||''}" class="${inputCls()}"></div>
        <div>${lbl('Temporada hasta')}<input name="to" type="date" value="${c.dateRange?.to||''}" class="${inputCls()}"></div>
      </div>
      ${lbl('Fechas específicas (separadas por coma YYYY-MM-DD)')}<input name="specificDates" value="${(c.specificDates||[]).join(', ')}" placeholder="2026-12-25, 2027-01-01" class="${inputCls()}">
      <div class="grid grid-cols-3 gap-3">
        <div>${lbl('Descuento %')}<input name="disc" type="number" value="${r.discounts?.[0]?.percent||0}" class="${inputCls()}"></div>
        <div>${lbl('Recargo fijo Gs')}<input name="surch" type="number" step="1000" value="${r.surcharges?.find(s=>s.fixed)?.fixed||0}" class="${inputCls()}"></div>
        <div>${lbl('Recargo %')}<input name="surchp" type="number" value="${r.surcharges?.find(s=>s.percent)?.percent||0}" class="${inputCls()}"></div>
      </div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${r.active!==false?'checked':''}> Activa</label>`,
    onSubmit: (d, form) => {
      const maxG = parseInt(d.maxGuests) || 0;
      const payload = {
        name: d.name.trim(), priority: parseInt(d.priority)||0,
        conditions: {
          spaces: d._spaces,
          turns: Array.from(form.querySelectorAll('input[name="cturns"]:checked')).map(i=>i.value),
          daysOfWeek: Array.from(form.querySelectorAll('input[name="dow"]:checked')).map(i=>parseInt(i.value)),
          specificDates: String(d.specificDates||'').split(',').map(s=>s.trim()).filter(Boolean),
          dateRange: (d.from||d.to) ? { from: d.from||'', to: d.to||'' } : null,
          guestRange: { min: 1, max: maxG > 0 ? maxG : 9999 },
          minDuration: parseFloat(d.minDuration) || 0
        },
        pricing: { type: d.ptype || 'fixed', basePrice: parseInt(d.basePrice)||0, perHour: parseInt(d.perHour)||0, perPerson: parseInt(d.perPerson)||0 },
        discounts: (parseFloat(d.disc)||0) ? [{ type:'promo', percent: parseFloat(d.disc) }] : [],
        surcharges: [...((parseInt(d.surch)||0)?[{type:'fixed',fixed:parseInt(d.surch)}]:[]), ...((parseFloat(d.surchp)||0)?[{type:'percent',percent:parseFloat(d.surchp)}]:[])],
        active: !!form.querySelector('[name="active"]').checked, updatedAt: nowISO()
      };
      if (id) { Object.assign(pricingRules.find(x=>x.id===id), payload); logAudit('update','pricing_rule',id,payload,'info'); }
      else { const nr = { id: generateId('rule'), ...payload, createdAt: nowISO(), createdBy: currentUser?.id }; pricingRules.push(nr); logAudit('create','pricing_rule',nr.id,payload,'info'); }
      saveJSON(STORAGE_KEYS.PRICING_RULES, pricingRules); closeGenericModal(); renderPricingRules(); showToast('Regla guardada','success');
    }
  });
}
function togglePricingRule(id){ const r=pricingRules.find(x=>x.id===id); r.active = r.active===false?true:false; saveJSON(STORAGE_KEYS.PRICING_RULES,pricingRules); renderPricingRules(); }
function deletePricingRule(id){ if(!confirm('¿Eliminar regla?'))return; pricingRules=pricingRules.filter(x=>x.id!==id); saveJSON(STORAGE_KEYS.PRICING_RULES,pricingRules); renderPricingRules(); logAudit('delete','pricing_rule',id,{},'warning'); }

/* ---------------- FINANZAS: ingresos / egresos / dashboard ---------------- */
let financeCharts = {};
function financeRange(period) {
  const now = new Date(); let from, to = now;
  if (period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === 'quarter') from = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
  else if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
  else from = new Date(2000,0,1);
  return { from, to };
}
function inRange(dateStr, {from,to}) {
  const d = new Date(dateStr + 'T00:00:00');
  return d >= new Date(from.getFullYear(),from.getMonth(),from.getDate()) && d <= to;
}
function monthKey(dateStr){ return String(dateStr).slice(0,7); }
function monthLabel(ym){ const [y,m]=ym.split('-').map(Number); const names=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${names[m-1]} ${y}`; }

function initFinancesManagement() {
  document.getElementById('finance-period')?.addEventListener('change', renderFinances);
  document.getElementById('btn-export-finances')?.addEventListener('click', exportFinancesCSV);
  document.getElementById('btn-add-income')?.addEventListener('click', () => openIncomeModal());
  document.getElementById('btn-add-expense')?.addEventListener('click', () => openExpenseModal());
  document.getElementById('btn-manage-categories')?.addEventListener('click', () => openCategoryManager());
  document.getElementById('btn-manage-recurring')?.addEventListener('click', () => openRecurringManager());
  document.getElementById('search-incomes')?.addEventListener('input', renderIncomes);
  document.getElementById('filter-income-method')?.addEventListener('change', renderIncomes);
  document.getElementById('filter-income-month')?.addEventListener('change', renderIncomes);
  document.getElementById('search-expenses')?.addEventListener('input', renderExpenses);
  document.getElementById('filter-expense-category')?.addEventListener('change', renderExpenses);
  document.getElementById('filter-expense-space')?.addEventListener('change', renderExpenses);
  document.getElementById('filter-expense-month')?.addEventListener('change', renderExpenses);
  document.getElementById('profitability-period')?.addEventListener('change', renderProfitability);
  // poblar selects de categorías y espacios
  const fc = document.getElementById('filter-expense-category');
  if (fc) fc.innerHTML = '<option value="">Todas las categorías</option>' + expenseCategories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  const fs = document.getElementById('filter-expense-space');
  if (fs) fs.innerHTML = '<option value="">Todos los espacios</option>' + spaces.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}
function financeTotals(period) {
  const range = financeRange(period);
  const inc = incomes.filter(i => inRange(i.date, range));
  const exp = expenses.filter(e => inRange(e.date, range));
  const tInc = inc.reduce((a,x)=>a+(x.amount||0),0);
  const tExp = exp.reduce((a,x)=>a+(x.amount||0),0);
  const pending = reservations.filter(r=>isActiveReservation(r)).reduce((a,r)=>a+((r.totalPrice||0)-(r.paidAmount||0)),0);
  const collected = payments.filter(p=>inRange(p.date,range)).reduce((a,x)=>a+(x.amount||0),0);
  return { tInc, tExp, net: tInc - tExp, pending, collected, inc, exp };
}
function renderFinances() {
  const period = document.getElementById('finance-period')?.value || 'month';
  const t = financeTotals(period);
  const k = document.getElementById('finance-kpis');
  if (k) k.innerHTML = [
    { l:'Ingresos del período', v:formatGs(t.tInc), c:'text-emerald-700', bg:'bg-emerald-50', i:'fa-arrow-down-to-bracket' },
    { l:'Egresos del período', v:formatGs(t.tExp), c:'text-red-700', bg:'bg-red-50', i:'fa-arrow-up-from-bracket' },
    { l:'Resultado neto', v:formatGs(t.net), c: t.net>=0?'text-emerald-700':'text-red-700', bg: t.net>=0?'bg-emerald-50':'bg-red-50', i:'fa-scale-balanced' },
    { l:'Total cobrado', v:formatGs(t.collected), c:'text-forest-900', bg:'bg-forest-50', i:'fa-hand-holding-dollar' },
    { l:'Total pendiente', v:formatGs(t.pending), c:'text-amber-700', bg:'bg-amber-50', i:'fa-hourglass-half' },
  ].map(x=>`<div class="bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between"><div><span class="text-[0.65rem] uppercase font-bold text-gray-500 block">${x.l}</span><span class="font-serif text-lg sm:text-xl font-bold ${x.c}">${x.v}</span></div><div class="w-10 h-10 rounded-xl ${x.bg} flex items-center justify-center"><i class="fa-solid ${x.i}"></i></div></div>`).join('');
  drawFinanceCharts(period);
  renderTopMonths();
}
function lastNMonths(n=12) {
  const out=[]; const now=new Date();
  for(let i=n-1;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }
  return out;
}
function drawFinanceCharts(period) {
  if (typeof Chart === 'undefined') return;
  const months = lastNMonths(period==='year'?12:6);
  const incByM = {}, expByM = {};
  months.forEach(m=>{incByM[m]=0;expByM[m]=0;});
  incomes.forEach(i=>{ const m=monthKey(i.date); if(m in incByM) incByM[m]+=i.amount||0; });
  expenses.forEach(e=>{ const m=monthKey(e.date); if(m in expByM) expByM[m]+=e.amount||0; });
  const labels = months.map(monthLabel);
  const mk = (id, cfg) => {
    const el = document.getElementById(id); if(!el) return;
    if (financeCharts[id]) financeCharts[id].destroy();
    financeCharts[id] = new Chart(el, cfg);
  };
  mk('chart-income-expense', { type:'bar', data:{ labels, datasets:[
    { label:'Ingresos', data: months.map(m=>incByM[m]), backgroundColor:'#059669' },
    { label:'Egresos', data: months.map(m=>expByM[m]), backgroundColor:'#dc2626' } ]},
    options:{ responsive:true, plugins:{legend:{position:'bottom'}}, scales:{y:{ticks:{callback:v=>'Gs.'+(v/1000000)+'M'}}}}});
  // gastos por categoría
  const byCat = {};
  expenses.forEach(e=>{ const cn = expenseCategories.find(c=>c.id===e.categoryId)?.name || 'Otros'; byCat[cn]=(byCat[cn]||0)+(e.amount||0); });
  const topCats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,8);
  mk('chart-expenses-category', { type:'doughnut', data:{ labels: topCats.map(x=>x[0]), datasets:[{ data: topCats.map(x=>x[1]), backgroundColor:['#06b6d4','#f59e0b','#8b5cf6','#ec4899','#10b981','#f97316','#6366f1','#14b8a6'] }]}, options:{responsive:true,plugins:{legend:{position:'bottom'}}}});
  // ingresos por espacio (vía reservationSpaces)
  const bySpace = {};
  reservationSpaces.forEach(rs=>{
    const r = reservations.find(x=>x.id===rs.reservationId); if(!r||!isActiveReservation(r)) return;
    const prim = getPrimaryDateOfReservation(r); const m = prim?monthKey(prim):null;
    if(!m || !months.includes(m)) return;
    const share = 1 / Math.max(1, getSpacesOfReservation(r.id).length);
    const nm = getSpaceById(rs.spaceId)?.shortName || rs.spaceId;
    bySpace[nm]=(bySpace[nm]||0)+(r.totalPrice||0)*share;
  });
  mk('chart-income-space', { type:'bar', data:{ labels:Object.keys(bySpace), datasets:[{label:'Ingresos', data:Object.values(bySpace), backgroundColor:'#2563eb'}]}, options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}}}});
  // rentabilidad por espacio
  const prof = profitabilityData(document.getElementById('profitability-period')?.value || 'month');
  mk('chart-profitability', { type:'bar', data:{ labels: prof.map(p=>p.name), datasets:[{label:'Neto', data: prof.map(p=>p.net), backgroundColor: prof.map(p=>p.net>=0?'#059669':'#dc2626')}]}, options:{responsive:true,plugins:{legend:{display:false}}}});
}
function renderTopMonths() {
  const byRes = {}, byRev = {};
  reservations.forEach(r=>{ const d=getPrimaryDateOfReservation(r); if(!d) return; const m=monthKey(d); byRes[m]=(byRes[m]||0)+1; });
  incomes.forEach(i=>{ const m=monthKey(i.date); byRev[m]=(byRev[m]||0)+(i.amount||0); });
  const topR = Object.entries(byRes).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topV = Object.entries(byRev).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const er = document.getElementById('top-months-reservations');
  if (er) er.innerHTML = topR.length?topR.map(([m,c],i)=>`<div class="flex items-center justify-between p-3 bg-white rounded-xl border"><span class="text-sm font-bold">${i+1}. ${monthLabel(m)}</span><span class="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">${c} reservas</span></div>`).join(''):'<p class="text-xs text-gray-400">Sin datos aún.</p>';
  const ev = document.getElementById('top-months-revenue');
  if (ev) ev.innerHTML = topV.length?topV.map(([m,c],i)=>`<div class="flex items-center justify-between p-3 bg-white rounded-xl border"><span class="text-sm font-bold">${i+1}. ${monthLabel(m)}</span><span class="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">${formatGs(c)}</span></div>`).join(''):'<p class="text-xs text-gray-400">Sin datos aún.</p>';
}
function exportFinancesCSV() {
  const period = document.getElementById('finance-period')?.value || 'month';
  const t = financeTotals(period);
  const rows = [['tipo','fecha','concepto','cliente/proveedor','monto','metodo']];
  t.inc.forEach(i=>rows.push(['ingreso',i.date,i.concept,i.clientName||'',i.amount,i.paymentMethod||'']));
  t.exp.forEach(e=>rows.push(['egreso',e.date,e.description,e.provider||'',e.amount,e.paymentMethod||'']));
  const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`finanzas-${period}.csv`; a.click();
  showToast('CSV exportado','success');
}
/* Ingresos */
function renderIncomes() {
  const c = document.getElementById('incomes-list'); if(!c) return;
  const q = (document.getElementById('search-incomes')?.value||'').toLowerCase();
  const m = document.getElementById('filter-income-method')?.value||'';
  const mo = document.getElementById('filter-income-month')?.value||'';
  let list = incomes.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(q) list=list.filter(i=>(i.clientName||'').toLowerCase().includes(q)||(i.concept||'').toLowerCase().includes(q));
  if(m) list=list.filter(i=>i.paymentMethod===m);
  if(mo) list=list.filter(i=>String(i.date).startsWith(mo));
  if(!list.length){c.innerHTML='<p class="text-sm text-gray-400 p-6 text-center">Sin ingresos con esos filtros.</p>';return;}
  c.innerHTML = `<table class="w-full text-left text-sm"><thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Concepto</th><th class="px-3 py-2">Cliente</th><th class="px-3 py-2">Monto</th><th class="px-3 py-2">Método</th><th class="px-3 py-2 text-right">Acc.</th></tr></thead><tbody class="divide-y">`+
    list.map(i=>`<tr class="hover:bg-gray-50"><td class="px-3 py-2">${i.date}</td><td class="px-3 py-2 font-semibold">${i.concept}${i.reservationId?'<span class="ml-1 text-[0.6rem] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">reserva</span>':''}</td><td class="px-3 py-2">${i.clientName||'-'}</td><td class="px-3 py-2 font-bold text-emerald-700">${formatGs(i.amount)}</td><td class="px-3 py-2">${i.paymentMethod||'-'}</td><td class="px-3 py-2 text-right whitespace-nowrap"><button onclick="deleteIncome('${i.id}')" class="p-2 text-gray-400 hover:text-red-600"><i class="fa-regular fa-trash-can"></i></button></td></tr>`).join('')+`</tbody></table>`;
}
function openIncomeModal() {
  openGenericModal({ title:'Registrar ingreso', subtitle:'Finanzas',
    bodyHtml:`${lbl('Fecha *')}<input name="date" type="date" required value="${getTodayStr()}" class="${inputCls()}">
    ${lbl('Concepto *')}<input name="concept" required placeholder="Ej: Seña reserva..." class="${inputCls()}">
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Cliente')}<input name="clientName" class="${inputCls()}"></div><div>${lbl('Monto Gs *')}<input name="amount" type="number" required step="1000" class="${inputCls()}"></div></div>
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Método')}<select name="paymentMethod" class="${inputCls()}">${settings.defaultPaymentMethods.map(m=>`<option>${m}</option>`).join('')}</select></div><div>${lbl('Reserva asociada (opcional)')}<select name="reservationId" class="${inputCls()}"><option value="">—</option>${reservations.filter(isActiveReservation).map(r=>`<option value="${r.id}">${getPrimaryDateOfReservation(r)||''} · ${r.clientName}</option>`).join('')}</select></div></div>
    ${lbl('Observaciones')}<input name="notes" class="${inputCls()}">`,
    onSubmit:d=>{
      const inc={id:generateId('inc'),date:d.date,concept:d.concept.trim(),clientName:d.clientName,reservationId:d.reservationId||null,amount:parseInt(d.amount)||0,paymentMethod:d.paymentMethod,recordedBy:currentUser?.id,notes:d.notes,createdAt:nowISO()};
      incomes.unshift(inc);saveJSON(STORAGE_KEYS.INCOMES,incomes);logAudit('create','income',inc.id,inc,'info');
      closeGenericModal();renderIncomes();renderFinances();showToast('Ingreso registrado','success');
    }});
}
function deleteIncome(id){ if(!hasPermission('incomes.crud')&&currentUser?.role!=='admin')return showToast('Sin permiso','error'); if(!confirm('¿Eliminar ingreso?'))return; incomes=incomes.filter(x=>x.id!==id);saveJSON(STORAGE_KEYS.INCOMES,incomes);renderIncomes();renderFinances();logAudit('delete','income',id,{},'warning'); }
/* Egresos */
function renderExpenses() {
  const c=document.getElementById('expenses-list');if(!c)return;
  const q=(document.getElementById('search-expenses')?.value||'').toLowerCase();
  const cat=document.getElementById('filter-expense-category')?.value||'';
  const sp=document.getElementById('filter-expense-space')?.value||'';
  const mo=document.getElementById('filter-expense-month')?.value||'';
  let list=expenses.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(q)list=list.filter(e=>(e.description||'').toLowerCase().includes(q)||(e.provider||'').toLowerCase().includes(q));
  if(cat)list=list.filter(e=>e.categoryId===cat||expenseCategories.find(x=>x.id===e.categoryId)?.parentId===cat);
  if(sp)list=list.filter(e=>(e.spaceIds||[]).includes(sp));
  if(mo)list=list.filter(e=>String(e.date).startsWith(mo));
  if(!list.length){c.innerHTML='<p class="text-sm text-gray-400 p-6 text-center">Sin egresos con esos filtros.</p>';return;}
  c.innerHTML=`<table class="w-full text-left text-sm"><thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Categoría</th><th class="px-3 py-2">Descripción</th><th class="px-3 py-2">Espacio</th><th class="px-3 py-2">Monto</th><th class="px-3 py-2 text-right">Acc.</th></tr></thead><tbody class="divide-y">`+
  list.map(e=>{const catN=expenseCategories.find(x=>x.id===e.categoryId)?.name||'-';const spN=(e.spaceIds||[]).map(s=>getSpaceById(s)?.shortName||s).join(', ')||'-';return `<tr class="hover:bg-gray-50"><td class="px-3 py-2">${e.date}</td><td class="px-3 py-2"><span class="text-xs px-2 py-1 rounded-full bg-gray-100 font-bold">${catN}</span></td><td class="px-3 py-2 font-semibold">${e.description} ${e.receipt?'<span title="Con comprobante">🧾</span>':''}<div class="text-xs text-gray-400 font-normal">${e.provider||''}</div></td><td class="px-3 py-2 text-xs">${spN}</td><td class="px-3 py-2 font-bold text-red-700">${formatGs(e.amount)}</td><td class="px-3 py-2 text-right whitespace-nowrap"><button onclick="openExpenseDetail('${e.id}')" title="Ver detalle" class="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"><i class="fa-solid fa-eye"></i></button><button onclick="deleteExpense('${e.id}')" class="p-2 text-gray-400 hover:text-red-600"><i class="fa-regular fa-trash-can"></i></button></td></tr>`}).join('')+`</tbody></table>`;
}
function openExpenseModal() {
  const catOpts = expenseCategories.map(c=>`${c.parentId?'&nbsp;&nbsp;↳ ':''}<option value="${c.id}">${c.parentId?'— ':''}${c.name}</option>`).join('');
  const spChecks = spaces.map(s=>`<label class="flex items-center gap-1.5 text-xs p-2 border rounded-lg"><input type="checkbox" name="spaces" value="${s.id}"> ${s.shortName}</label>`).join('');
  openGenericModal({ title:'Registrar gasto', subtitle:'Egresos',
    bodyHtml:`${lbl('Fecha *')}<input name="date" type="date" required value="${getTodayStr()}" class="${inputCls()}">
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Categoría *')}<select name="categoryId" required class="${inputCls()}">${catOpts}</select></div><div>${lbl('Monto Gs *')}<input name="amount" type="number" required step="1000" class="${inputCls()}"></div></div>
    ${lbl('Descripción *')}<input name="description" required placeholder="Ej: Compra de cloro" class="${inputCls()}">
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Proveedor / persona')}<input name="provider" class="${inputCls()}"></div><div>${lbl('Forma de pago')}<select name="paymentMethod" class="${inputCls()}">${settings.defaultPaymentMethods.map(m=>`<option>${m}</option>`).join('')}</select></div></div>
    ${lbl('Espacio afectado')}<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${spChecks}</div>
    ${lbl('Comprobante (foto ticket, máx. ~900KB)')}<input name="receiptFile" type="file" accept="image/*" class="${inputCls()}">
    <div id="receipt-preview" class="text-xs text-gray-400">Sin comprobante adjunto.</div>
    ${lbl('Observaciones')}<input name="notes" class="${inputCls()}">`,
    onSubmit:d=>{
      const exp={id:generateId('exp'),date:d.date,categoryId:d.categoryId,description:d.description.trim(),amount:parseInt(d.amount)||0,provider:d.provider,spaceIds:d._spaces,paymentMethod:d.paymentMethod,notes:d.notes,receipt:pendingReceiptData||null,recordedBy:currentUser?.id,createdAt:nowISO()};
      pendingReceiptData=null;
      expenses.unshift(exp);saveJSON(STORAGE_KEYS.EXPENSES,expenses);logAudit('create','expense',exp.id,{...exp,receipt:exp.receipt?'[adjunto]':null},'info');
      closeGenericModal();renderExpenses();renderFinances();renderProfitability();showToast('Gasto registrado','success');
    }});
  const rf=document.querySelector('#generic-modal-form input[name="receiptFile"]');
  rf?.addEventListener('change',()=>{
    const f=rf.files?.[0];
    const pv=document.getElementById('receipt-preview');
    if(!f){pendingReceiptData=null;if(pv)pv.textContent='Sin comprobante adjunto.';return;}
    if(f.size>900*1024){rf.value='';pendingReceiptData=null;if(pv)pv.innerHTML='<span class="text-red-600 font-bold">Archivo muy pesado (máx. 900KB). Comprime la foto.</span>';return;}
    const rd=new FileReader();
    rd.onload=()=>{pendingReceiptData=rd.result;if(pv)pv.innerHTML=`<span class="text-emerald-700 font-bold">✓ ${f.name} (${Math.round(f.size/1024)}KB)</span> <img src="${rd.result}" class="mt-2 max-h-32 rounded-xl border" alt="Comprobante">`;};
    rd.readAsDataURL(f);
  });
}
let pendingReceiptData=null;
function openExpenseDetail(id){
  const e=expenses.find(x=>x.id===id);if(!e)return;
  const cat=expenseCategories.find(c=>c.id===e.categoryId);
  openGenericModal({title:'Detalle de gasto',subtitle:`${e.date} · ${formatGs(e.amount)}`,
    bodyHtml:`<div class="grid grid-cols-2 gap-3 text-sm">
      <div class="bg-gray-50 rounded-xl border p-3"><b>Categoría</b><br>${cat?.name||'-'}</div>
      <div class="bg-gray-50 rounded-xl border p-3"><b>Proveedor</b><br>${e.provider||'-'}</div></div>
      <div class="text-sm bg-gray-50 rounded-xl border p-3"><b>Descripción</b><br>${e.description}</div>
      <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="bg-gray-50 rounded-xl border p-3"><b>Espacios</b><br>${(e.spaceIds||[]).map(s=>getSpaceById(s)?.shortName).join(', ')||'General'}</div>
      <div class="bg-gray-50 rounded-xl border p-3"><b>Pago</b><br>${e.paymentMethod||'-'}</div></div>
      ${e.notes?`<div class="text-xs text-gray-500">Obs: ${e.notes}</div>`:''}
      ${e.receipt?`<div>${lbl('Comprobante')}<a href="${e.receipt}" target="_blank"><img src="${e.receipt}" class="max-h-64 rounded-2xl border" alt="Comprobante"></a></div>`:'<p class="text-xs text-gray-400">Sin comprobante.</p>'}
      ${e.recurringId?'<p class="text-xs text-sky-700">Generado automáticamente desde plantilla recurrente.</p>':''}`,
    submitLabel:'Cerrar',onSubmit:()=>closeGenericModal()});
}
function deleteExpense(id){ if(currentUser?.role!=='admin')return showToast('Solo admin puede eliminar egresos','error'); if(!confirm('¿Eliminar gasto?'))return; expenses=expenses.filter(x=>x.id!==id);saveJSON(STORAGE_KEYS.EXPENSES,expenses);renderExpenses();renderFinances();renderProfitability();logAudit('delete','expense',id,{},'warning'); }
/* ---- CRUD categorías de gasto (padre/hija, personalizadas) ---- */
function refreshCategorySelects() {
  const fc = document.getElementById('filter-expense-category');
  if (fc) {
    const v = fc.value;
    fc.innerHTML = '<option value="">Todas las categorías</option>' + expenseCategories.map(c => `<option value="${c.id}">${c.parentId ? '— ' : ''}${c.name}${c.active === false ? ' (inactiva)' : ''}</option>`).join('');
    if ([...fc.options].some(o => o.value === v)) fc.value = v;
  }
}
function openCategoryManager() {
  if (currentUser?.role !== 'admin') return showToast('Solo admin puede gestionar categorías', 'error');
  const roots = expenseCategories.filter(c => !c.parentId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const kids = id => expenseCategories.filter(c => c.parentId === id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const row = c => {
    const used = expenses.filter(e => e.categoryId === c.id).length;
    return `<div class="flex items-center justify-between gap-2 p-2.5 rounded-xl border ${c.active === false ? 'opacity-60 bg-gray-50' : 'bg-white'}">
      <span class="flex items-center gap-2 text-sm"><span class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs" style="background:${c.color}"><i class="${c.icon}"></i></span>
      <b>${c.name}</b><span class="text-[0.65rem] text-gray-400">${used} gasto${used === 1 ? '' : 's'}${c.active === false ? ' · inactiva' : ''}</span></span>
      <span class="flex gap-1">
        <button type="button" onclick="openCategoryModal('${c.id}')" class="px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-bold hover:bg-gray-200">Editar</button>
        <button type="button" onclick="toggleCategory('${c.id}')" class="px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-bold hover:bg-gray-200">${c.active === false ? 'Activar' : 'Pausar'}</button>
        <button type="button" onclick="deleteCategory('${c.id}')" class="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100">Eliminar</button>
      </span></div>`;
  };
  openGenericModal({
    title: 'Categorías de gasto', subtitle: `${expenseCategories.length} categorías`,
    bodyHtml: `<div class="space-y-3 max-h-[46vh] overflow-y-auto">` + (roots.length ? roots.map(r => row(r) + (kids(r.id).length ? `<div class="ml-6 space-y-2 border-l-2 border-gray-100 pl-3">` + kids(r.id).map(row).join('') + `</div>` : '')).join('') : '<p class="text-xs text-gray-400">Sin categorías.</p>') + `</div>
    <div class="pt-3 border-t"><button type="button" onclick="openCategoryModal()" class="btn-forest px-4 py-2 rounded-xl text-xs font-bold w-full"><i class="fa-solid fa-plus mr-1"></i>Nueva categoría / subcategoría</button></div>
    <div class="text-[0.65rem] text-gray-400 pt-1">Pulsa “Cerrar” para salir del gestor.</div>`,
    submitLabel: 'Cerrar', onSubmit: () => closeGenericModal()
  });
  // El botón submit del modal genérico cierra; ocultamos cancel para este caso
  const cancel = document.getElementById('generic-modal-cancel');
  if (cancel) cancel.classList.add('hidden');
}
function openCategoryModal(id = null) {
  const c = id ? expenseCategories.find(x => x.id === id) : { name: '', parentId: '', icon: 'fa-solid fa-tag', color: '#6b7280', active: true, sortOrder: expenseCategories.length + 1 };
  const parentOpts = '<option value="">(ninguno = categoría principal)</option>' + expenseCategories.filter(x => !x.parentId && x.id !== id).map(x => `<option value="${x.id}" ${c.parentId === x.id ? 'selected' : ''}>${x.name}</option>`).join('');
  openGenericModal({
    title: id ? 'Editar categoría' : 'Nueva categoría', subtitle: 'Gastos',
    bodyHtml: `${lbl('Nombre *')}<input name="name" required value="${c.name || ''}" placeholder="Ej: Jardinería" class="${inputCls()}">
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Categoría padre')}<select name="parentId" class="${inputCls()}">${parentOpts}</select></div>
    <div>${lbl('Orden')}<input name="sortOrder" type="number" value="${c.sortOrder || 1}" class="${inputCls()}"></div></div>
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Icono (FontAwesome)')}<input name="icon" value="${c.icon || 'fa-solid fa-tag'}" class="${inputCls()}"></div>
    <div>${lbl('Color')}<input name="color" type="color" value="${c.color || '#6b7280'}" class="w-full h-11 rounded-xl border"></div></div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Activa</label>`,
    onSubmit: (d, form) => {
      const payload = { name: d.name.trim(), parentId: d.parentId || null, icon: d.icon.trim() || 'fa-solid fa-tag', color: d.color, sortOrder: parseInt(d.sortOrder) || 1, active: !!form.querySelector('[name="active"]').checked };
      if (id) { Object.assign(expenseCategories.find(x => x.id === id), payload); logAudit('update', 'expense_category', id, payload, 'info'); }
      else { const nc = { id: generateId('cat'), ...payload }; expenseCategories.push(nc); logAudit('create', 'expense_category', nc.id, payload, 'info'); }
      saveJSON(STORAGE_KEYS.EXPENSE_CATEGORIES, expenseCategories);
      refreshCategorySelects(); renderExpenses(); renderFinances();
      openCategoryManager(); showToast('Categoría guardada', 'success');
    }
  });
}
function toggleCategory(id) {
  const c = expenseCategories.find(x => x.id === id); if (!c) return;
  c.active = c.active === false ? true : false;
  saveJSON(STORAGE_KEYS.EXPENSE_CATEGORIES, expenseCategories);
  refreshCategorySelects(); renderExpenses(); openCategoryManager();
}
function deleteCategory(id) {
  const hasKids = expenseCategories.some(x => x.parentId === id);
  if (hasKids) return showToast('Tiene subcategorías. Elimínalas o muévelas primero.', 'error');
  const used = expenses.filter(e => e.categoryId === id).length;
  if (used) return showToast(`En uso en ${used} gasto(s). Páusala en vez de eliminarla.`, 'error');
  if (!confirm('¿Eliminar categoría?')) return;
  expenseCategories = expenseCategories.filter(x => x.id !== id);
  saveJSON(STORAGE_KEYS.EXPENSE_CATEGORIES, expenseCategories);
  refreshCategorySelects(); renderExpenses(); openCategoryManager();
  logAudit('delete', 'expense_category', id, {}, 'warning');
}
/* ---- Gastos recurrentes: plantillas + generación de vencidos ---- */
const RECURRING_FREQS = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual' };
function parseYMD(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function advanceYMD(dateStr, freq) {
  const d = parseYMD(dateStr);
  if (freq === 'semanal') d.setDate(d.getDate() + 7);
  else if (freq === 'quincenal') d.setDate(d.getDate() + 15);
  else if (freq === 'mensual') d.setMonth(d.getMonth() + 1);
  else if (freq === 'trimestral') d.setMonth(d.getMonth() + 3);
  else if (freq === 'anual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return toDateStr(d);
}
function dueOccurrences(rec, upToStr) {
  const out = [];
  let cur = rec.nextDue;
  let guard = 0;
  while (cur && cur <= upToStr && guard < 24) {
    out.push(cur);
    cur = advanceYMD(cur, rec.frequency);
    guard++;
  }
  return out;
}
function countDueRecurring(upToStr) {
  const up = upToStr || getTodayStr();
  return recurringExpenses.filter(r => r.active !== false).reduce((a, r) => a + dueOccurrences(r, up).length, 0);
}
function updateRecurringBadge() {
  const b = document.getElementById('recurring-due-badge');
  if (!b) return;
  const n = countDueRecurring();
  b.textContent = n;
  b.classList.toggle('hidden', !n);
}
function openRecurringManager() {
  if (currentUser?.role !== 'admin' && !hasPermission('expenses.crud')) return showToast('Sin permiso', 'error');
  const today = getTodayStr();
  const rows = recurringExpenses.length ? recurringExpenses.map(r => {
    const cat = expenseCategories.find(c => c.id === r.categoryId)?.name || '-';
    const due = r.active !== false ? dueOccurrences(r, today).length : 0;
    return `<div class="p-3 rounded-2xl border ${r.active === false ? 'opacity-60 bg-gray-50' : 'bg-white'} space-y-1">
      <div class="flex items-center justify-between gap-2">
        <b class="text-sm">${r.description}</b>
        ${due ? `<span class="text-[0.65rem] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-extrabold">${due} vencido${due === 1 ? '' : 's'}</span>` : ''}
      </div>
      <div class="text-xs text-gray-500">${cat} · ${formatGs(r.amount)} · ${RECURRING_FREQS[r.frequency] || r.frequency} · próx. ${r.nextDue}${r.active === false ? ' · pausado' : ''}</div>
      <div class="flex flex-wrap gap-1.5 pt-1">
        ${due ? `<button type="button" onclick="generateRecurring('${r.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">Generar (${due})</button>` : ''}
        <button type="button" onclick="openRecurringModal('${r.id}')" class="px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-bold">Editar</button>
        <button type="button" onclick="toggleRecurring('${r.id}')" class="px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-bold">${r.active === false ? 'Activar' : 'Pausar'}</button>
        <button type="button" onclick="deleteRecurring('${r.id}')" class="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold">Eliminar</button>
      </div></div>`;
  }).join('') : '<p class="text-xs text-gray-400">Sin plantillas. Crea la primera: limpieza semanal, cloro mensual, etc.</p>';
  const totalDue = countDueRecurring(today);
  openGenericModal({
    title: 'Gastos recurrentes', subtitle: 'Plantillas automáticas',
    bodyHtml: `${totalDue ? `<button type="button" onclick="generateAllDueRecurring()" class="w-full btn-forest px-4 py-2.5 rounded-xl text-xs font-bold mb-3">⚡ Generar todos los vencidos (${totalDue})</button>` : ''}
    <div class="space-y-2 max-h-[46vh] overflow-y-auto">${rows}</div>
    <div class="pt-3 border-t"><button type="button" onclick="openRecurringModal()" class="btn-forest px-4 py-2 rounded-xl text-xs font-bold w-full"><i class="fa-solid fa-plus mr-1"></i>Nueva plantilla</button></div>`,
    submitLabel: 'Cerrar', onSubmit: () => closeGenericModal()
  });
  const cancel = document.getElementById('generic-modal-cancel');
  if (cancel) cancel.classList.add('hidden');
}
function openRecurringModal(id = null) {
  const r = id ? recurringExpenses.find(x => x.id === id) : { description: '', categoryId: '', amount: 0, provider: '', frequency: 'mensual', nextDue: getTodayStr(), paymentMethod: settings.defaultPaymentMethods[0] || 'Efectivo', active: true };
  const spChecks = spaces.map(s => `<label class="flex items-center gap-1.5 text-xs p-2 border rounded-lg"><input type="checkbox" name="spaces" value="${s.id}" ${((r.spaceIds || []).includes(s.id)) ? 'checked' : ''}> ${s.shortName}</label>`).join('');
  openGenericModal({
    title: id ? 'Editar plantilla' : 'Nueva plantilla recurrente', subtitle: 'Gasto automático',
    bodyHtml: `${lbl('Descripción *')}<input name="description" required value="${r.description || ''}" placeholder="Ej: Limpieza semanal del predio" class="${inputCls()}">
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Categoría *')}<select name="categoryId" required class="${inputCls()}">${expenseCategories.map(c => `<option value="${c.id}" ${r.categoryId === c.id ? 'selected' : ''}>${c.parentId ? '— ' : ''}${c.name}</option>`).join('')}</select></div>
    <div>${lbl('Monto Gs *')}<input name="amount" type="number" required step="1000" value="${r.amount || 0}" class="${inputCls()}"></div></div>
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Frecuencia')}<select name="frequency" class="${inputCls()}">${Object.entries(RECURRING_FREQS).map(([k, v]) => `<option value="${k}" ${r.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div>${lbl('Próximo vencimiento *')}<input name="nextDue" type="date" required value="${r.nextDue || getTodayStr()}" class="${inputCls()}"></div></div>
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Proveedor')}<input name="provider" value="${r.provider || ''}" class="${inputCls()}"></div>
    <div>${lbl('Forma de pago')}<select name="paymentMethod" class="${inputCls()}">${settings.defaultPaymentMethods.map(m => `<option ${r.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
    ${lbl('Espacios afectados (vacío = todos)')}<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${spChecks}</div>
    ${lbl('Observaciones')}<input name="notes" value="${r.notes || ''}" class="${inputCls()}">
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${r.active !== false ? 'checked' : ''}> Activa</label>`,
    onSubmit: (d, form) => {
      const payload = { description: d.description.trim(), categoryId: d.categoryId, amount: parseInt(d.amount) || 0, provider: d.provider, frequency: d.frequency, nextDue: d.nextDue, paymentMethod: d.paymentMethod, spaceIds: d._spaces, notes: d.notes, active: !!form.querySelector('[name="active"]').checked, updatedAt: nowISO() };
      if (id) { Object.assign(recurringExpenses.find(x => x.id === id), payload); logAudit('update', 'recurring_expense', id, payload, 'info'); }
      else { const nr = { id: generateId('rec'), ...payload, createdBy: currentUser?.id, createdAt: nowISO() }; recurringExpenses.push(nr); logAudit('create', 'recurring_expense', nr.id, payload, 'info'); }
      saveJSON(STORAGE_KEYS.RECURRING_EXPENSES, recurringExpenses);
      updateRecurringBadge(); openRecurringManager(); showToast('Plantilla guardada', 'success');
    }
  });
}
function toggleRecurring(id) {
  const r = recurringExpenses.find(x => x.id === id); if (!r) return;
  r.active = r.active === false ? true : false;
  saveJSON(STORAGE_KEYS.RECURRING_EXPENSES, recurringExpenses);
  updateRecurringBadge(); openRecurringManager();
}
function deleteRecurring(id) {
  if (!confirm('¿Eliminar plantilla? Los gastos ya generados se conservan.')) return;
  recurringExpenses = recurringExpenses.filter(x => x.id !== id);
  saveJSON(STORAGE_KEYS.RECURRING_EXPENSES, recurringExpenses);
  updateRecurringBadge(); openRecurringManager();
  logAudit('delete', 'recurring_expense', id, {}, 'warning');
}
function generateRecurring(id) {
  const r = recurringExpenses.find(x => x.id === id); if (!r) return;
  const dues = dueOccurrences(r, getTodayStr());
  if (!dues.length) return showToast('Sin vencidos para esta plantilla', 'info');
  dues.forEach(ds => {
    expenses.unshift({ id: generateId('exp'), date: ds, categoryId: r.categoryId, description: `${r.description} (${RECURRING_FREQS[r.frequency] || ''})`, amount: r.amount, provider: r.provider, spaceIds: r.spaceIds || [], paymentMethod: r.paymentMethod, notes: (r.notes ? r.notes + ' · ' : '') + 'Generado automáticamente', recordedBy: currentUser?.id || 'system', recurringId: r.id, createdAt: nowISO() });
  });
  r.nextDue = advanceYMD(dues[dues.length - 1], r.frequency);
  saveJSON(STORAGE_KEYS.EXPENSES, expenses);
  saveJSON(STORAGE_KEYS.RECURRING_EXPENSES, recurringExpenses);
  logAudit('create', 'expense', 'bulk', { recurringId: id, count: dues.length }, 'info');
  updateRecurringBadge(); renderExpenses(); renderFinances(); renderProfitability(); openRecurringManager();
  showToast(`${dues.length} gasto(s) generado(s)`, 'success');
}
function generateAllDueRecurring() {
  const ids = recurringExpenses.filter(r => r.active !== false && dueOccurrences(r, getTodayStr()).length).map(r => r.id);
  if (!ids.length) return showToast('Nada vencido', 'info');
  let n = 0;
  ids.forEach(id => {
    const r = recurringExpenses.find(x => x.id === id);
    const dues = dueOccurrences(r, getTodayStr());
    dues.forEach(ds => {
      expenses.unshift({ id: generateId('exp'), date: ds, categoryId: r.categoryId, description: `${r.description} (${RECURRING_FREQS[r.frequency] || ''})`, amount: r.amount, provider: r.provider, spaceIds: r.spaceIds || [], paymentMethod: r.paymentMethod, notes: (r.notes ? r.notes + ' · ' : '') + 'Generado automáticamente', recordedBy: currentUser?.id || 'system', recurringId: r.id, createdAt: nowISO() });
      n++;
    });
    r.nextDue = advanceYMD(dues[dues.length - 1], r.frequency);
  });
  saveJSON(STORAGE_KEYS.EXPENSES, expenses);
  saveJSON(STORAGE_KEYS.RECURRING_EXPENSES, recurringExpenses);
  logAudit('create', 'expense', 'bulk', { count: n }, 'info');
  updateRecurringBadge(); renderExpenses(); renderFinances(); renderProfitability(); openRecurringManager();
  showToast(`${n} gasto(s) generado(s)`, 'success');
}
/* Rentabilidad */
function profitabilityData(period='month') {
  const range = period==='all'?{from:new Date(2000,0,1),to:new Date()}:financeRange(period);
  return spaces.map(s=>{
    let inc=0;
    reservationSpaces.forEach(rs=>{
      if(rs.spaceId!==s.id)return;
      const r=reservations.find(x=>x.id===rs.reservationId);if(!r||!isActiveReservation(r))return;
      const d=getPrimaryDateOfReservation(r);if(!d||!inRange(d,range))return;
      inc += (r.totalPrice||0) / Math.max(1,getSpacesOfReservation(r.id).length);
    });
    // ingresos manuales vinculados a reservas de ese espacio
    incomes.forEach(i=>{ if(!i.reservationId||!inRange(i.date,range))return; const rs=getSpacesOfReservation(i.reservationId); if(rs.some(x=>x.spaceId===s.id)) inc += i.amount/(rs.length||1); });
    let exp=0;
    expenses.forEach(e=>{ if(!inRange(e.date,range))return; if((e.spaceIds||[]).includes(s.id)) exp+=e.amount||0; else if(!(e.spaceIds||[]).length){ exp += (e.amount||0)/Math.max(1,spaces.length); } });
    return { id:s.id, name:s.name, short:s.shortName, color:s.color, income:Math.round(inc), expense:Math.round(exp), net:Math.round(inc-exp) };
  });
}
function renderProfitability(){
  const period=document.getElementById('profitability-period')?.value||'month';
  const data=profitabilityData(period);
  const t=document.getElementById('profitability-table');
  if(t) t.innerHTML=`<table class="w-full text-sm"><thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2 text-left">Espacio</th><th class="px-3 py-2 text-right">Ingresos</th><th class="px-3 py-2 text-right">Gastos</th><th class="px-3 py-2 text-right">Resultado</th><th class="px-3 py-2 text-right">Margen</th></tr></thead><tbody class="divide-y">`+data.map(d=>{const mg=d.income?Math.round(d.net/d.income*100):0;return `<tr><td class="px-3 py-2 font-bold"><span class="w-2.5 h-2.5 inline-block rounded-full mr-2" style="background:${d.color}"></span>${d.name}</td><td class="px-3 py-2 text-right text-emerald-700 font-bold">${formatGs(d.income)}</td><td class="px-3 py-2 text-right text-red-700">${formatGs(d.expense)}</td><td class="px-3 py-2 text-right font-extrabold ${d.net>=0?'text-emerald-700':'text-red-700'}">${formatGs(d.net)}</td><td class="px-3 py-2 text-right text-xs font-bold">${mg}%</td></tr>`}).join('')+`</tbody></table>`;
  const cards=document.getElementById('profitability-cards');
  if(cards) cards.innerHTML=data.map(d=>`<div class="p-5 rounded-2xl border bg-gray-50/60"><div class="flex items-center gap-2 font-bold text-sm"><span class="w-3 h-3 rounded-full" style="background:${d.color}"></span>${d.short}</div><div class="mt-2 text-xs text-gray-500">Ingresos: <b class="text-emerald-700">${formatGs(d.income)}</b></div><div class="text-xs text-gray-500">Gastos: <b class="text-red-700">${formatGs(d.expense)}</b></div><div class="mt-2 pt-2 border-t font-serif text-xl font-extrabold ${d.net>=0?'text-emerald-700':'text-red-700'}">${formatGs(d.net)}</div></div>`).join('');
}

/* ---------------- USUARIOS / AUDITORÍA / CONFIG ---------------- */
function initUsersManagement(){ document.getElementById('btn-add-user')?.addEventListener('click',()=>openUserModal()); }
function renderUsers(){
  const c=document.getElementById('users-list');if(!c)return;
  c.innerHTML=users.map(u=>`<div class="p-4 rounded-2xl border bg-gray-50/60 flex flex-col sm:flex-row justify-between gap-3">
    <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-forest-800 text-gold-400 flex items-center justify-center"><i class="fa-solid fa-user"></i></div>
    <div><div class="font-bold text-sm">${u.name} ${u.id===currentUser?.id?'<span class="text-[0.6rem] px-2 py-0.5 bg-emerald-100 rounded-full ml-1">tú</span>':''}</div><div class="text-xs text-gray-500">${u.email} · <span class="capitalize font-bold">${u.role}</span> · ${u.active?'Activo':'Inactivo'} ${u.lastLogin?('· último acceso '+new Date(u.lastLogin).toLocaleString('es-PY')):''}</div></div></div>
    <div class="flex gap-2 items-start"><button onclick="openUserModal('${u.id}')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">Editar</button>
    ${u.id!==currentUser?.id?`<button onclick="toggleUser('${u.id}')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">${u.active?'Desactivar':'Activar'}</button>`:''}</div></div>`).join('');
}
function openUserModal(id=null){
  if(currentUser?.role!=='admin')return showToast('Solo admin','error');
  const u=id?users.find(x=>x.id===id):{name:'',email:'',password:'',role:'operativo',active:true};
  openGenericModal({title:id?'Editar usuario':'Nuevo usuario',subtitle:'Permisos',
    bodyHtml:`${lbl('Nombre *')}<input name="name" required value="${u.name||''}" class="${inputCls()}">
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Email *')}<input name="email" type="email" required value="${u.email||''}" class="${inputCls()}"></div><div>${lbl('Contraseña *')}<input name="password" required value="${u.password||''}" class="${inputCls()}"></div></div>
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Rol')}<select name="role" class="${inputCls()}"><option value="admin" ${u.role==='admin'?'selected':''}>admin — acceso total</option><option value="operativo" ${u.role==='operativo'?'selected':''}>operativo — reservas y pagos</option></select></div><div class="flex items-end pb-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${u.active?'checked':''}> Activo</label></div></div>
    <p class="text-xs text-gray-500">Operativo puede: crear/ver reservas, registrar pagos e ingresos/egresos. No ve finanzas, rentabilidad, usuarios, auditoría ni configuración.</p>`,
    onSubmit:d=>{
      if(id){const x=users.find(z=>z.id===id);Object.assign(x,{name:d.name,email:d.email,password:d.password,role:d.role,active:!!d.active});logAudit('update','user',id,{role:d.role},'info');}
      else{const nu={id:generateId('user'),name:d.name,email:d.email,password:d.password,role:d.role,permissions:d.role==='admin'?['*']:['reservations.create','reservations.read','reservations.update','payments.create','payments.read','incomes.create','expenses.create'],active:!!d.active,createdAt:nowISO(),lastLogin:null};users.push(nu);logAudit('create','user',nu.id,{email:d.email},'info');}
      saveJSON(STORAGE_KEYS.USERS,users);closeGenericModal();renderUsers();updateTabsVisibility();showToast('Usuario guardado','success');
    }});
}
function toggleUser(id){const u=users.find(x=>x.id===id);u.active=!u.active;saveJSON(STORAGE_KEYS.USERS,users);renderUsers();}
function renderAudit(){
  const c=document.getElementById('audit-list');if(!c)return;
  const fa=document.getElementById('filter-audit-action')?.value||'';
  const fe=document.getElementById('filter-audit-entity')?.value||'';
  let list=auditLogs.slice().sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp))).slice(0,300);
  if(fa)list=list.filter(l=>l.action===fa||(fa==='update'&&l.action==='update'));
  if(fe)list=list.filter(l=>(l.entityType||'').includes(fe));
  ['filter-audit-action','filter-audit-entity'].forEach(i=>{document.getElementById(i)?.addEventListener('change',renderAudit,{once:true});});
  if(!list.length){c.innerHTML='<p class="text-sm text-gray-400 p-6 text-center">Sin registros.</p>';return;}
  c.innerHTML=`<table class="w-full text-xs"><thead class="bg-gray-50 uppercase text-gray-500"><tr><th class="px-3 py-2 text-left">Fecha</th><th class="px-3 py-2 text-left">Usuario</th><th class="px-3 py-2 text-left">Acción</th><th class="px-3 py-2 text-left">Entidad</th><th class="px-3 py-2 text-left">Detalle</th></tr></thead><tbody class="divide-y">`+
  list.map(l=>`<tr class="hover:bg-gray-50"><td class="px-3 py-2 whitespace-nowrap">${new Date(l.timestamp).toLocaleString('es-PY')}</td><td class="px-3 py-2">${l.userName}</td><td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full font-bold ${l.level==='critical'?'bg-red-100 text-red-700':l.level==='warning'?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-800'}">${l.action}</span></td><td class="px-3 py-2">${l.entityType}:${String(l.entityId).slice(0,18)}</td><td class="px-3 py-2 text-gray-500">${Object.entries(l.details||{}).slice(0,3).map(([k,v])=>`${k}=${String(v).slice(0,30)}`).join(' · ')}</td></tr>`).join('')+`</tbody></table>`;
}
function initSettingsManagement(){
  document.getElementById('btn-save-settings')?.addEventListener('click',()=>{
    settings.companyName=document.getElementById('setting-company-name')?.value||settings.companyName;
    settings.companyAddress=document.getElementById('setting-company-address')?.value||'';
    settings.companyPhone=document.getElementById('setting-company-phone')?.value||'';
    settings.companyEmail=document.getElementById('setting-company-email')?.value||'';
    settings.whatsappNumber=(document.getElementById('setting-whatsapp')?.value||'').replace(/\D/g,'');
    settings.currency=(document.getElementById('setting-currency')?.value||'PYG').toUpperCase();
    settings.currencySymbol=document.getElementById('setting-currency-symbol')?.value||'Gs.';
    settings.timezone=document.getElementById('setting-timezone')?.value||settings.timezone;
    settings.dateFormat=document.getElementById('setting-date-format')?.value||'DD/MM/YYYY';
    settings.alertDaysBefore=parseInt(document.getElementById('setting-alert-days')?.value)||3;
    settings.autoConfirmEnabled=!!document.getElementById('setting-auto-confirm')?.checked;
    settings.maintenanceMode=!!document.getElementById('setting-maintenance')?.checked;
    settings.backupEnabled=!!document.getElementById('setting-backup')?.checked;
    saveJSON(STORAGE_KEYS.SETTINGS,settings);logAudit('update','settings','global',{company:settings.companyName},'info');showToast('Configuración guardada','success');
  });
  document.getElementById('btn-export-all')?.addEventListener('click',()=>{
    const dump={};Object.values(STORAGE_KEYS).forEach(k=>{dump[k]=loadJSON(k,null);});
    const blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=`quinta-backup-${getTodayStr()}.json`;a.click();showToast('Respaldo descargado','success');
  });
  document.getElementById('btn-import-all')?.addEventListener('click',()=>document.getElementById('import-file')?.click());
  document.getElementById('btn-clear-all')?.addEventListener('click',()=>{
    if(!confirm('¿BORRAR TODO? Esta acción es irreversible.'))return;
    if(!confirm('Confirma por segunda vez: se perderán reservas, finanzas y configuración.'))return;
    Object.values(STORAGE_KEYS).forEach(k=>localStorage.removeItem(k));localStorage.removeItem('quinta_migration_v2_done');location.reload();
  });
}
function renderSettings(){
  const s=(id,v)=>{const el=document.getElementById(id);if(el&&el.value!==undefined&&document.activeElement!==el)el.value=v??'';};
  s('setting-company-name',settings.companyName);s('setting-company-address',settings.companyAddress);s('setting-company-phone',settings.companyPhone);s('setting-company-email',settings.companyEmail);s('setting-whatsapp',settings.whatsappNumber);
  s('setting-currency',settings.currency);s('setting-currency-symbol',settings.currencySymbol);s('setting-timezone',settings.timezone);s('setting-date-format',settings.dateFormat);s('setting-alert-days',settings.alertDaysBefore);
  const c=(id,v)=>{const el=document.getElementById(id);if(el)el.checked=!!v;};
  c('setting-auto-confirm',settings.autoConfirmEnabled);c('setting-maintenance',settings.maintenanceMode);c('setting-backup',settings.backupEnabled);
}
function handleImport(e){
  const f=e.target.files?.[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{const dump=JSON.parse(rd.result);Object.entries(dump).forEach(([k,v])=>{if(Object.values(STORAGE_KEYS).includes(k))localStorage.setItem(k,JSON.stringify(v));});showToast('Datos importados. Recargando...','success');setTimeout(()=>location.reload(),1200);}catch(err){showToast('Archivo inválido','error');}};
  rd.readAsText(f);
}

/* ==========================================================================
   FASE 3.4 + 3.6 — WIZARD 7 PASOS + PAGOS
   ========================================================================== */
let wizard = null;
function initWizard() {
  document.getElementById('open-new-res-modal-btn')?.addEventListener('click', () => openWizard());
}
function openWizard(defaultDate = null, presetSpaceId = null, presetTurnId = null) {
  wizard = { step: 1, client: { name:'', phone:'', email:'', notes:'' }, spaceIds: [], date: defaultDate || getTodayStr(), endDate: '', guests: 30, turnId: null, customStart:'', customEnd:'', serviceIds: [], discount: 0, totalOverride: null, status: 'pendiente', priceInfo: { total:0, breakdown:[] } };
  if (presetSpaceId && getSpaceById(presetSpaceId)) wizard.spaceIds = [presetSpaceId];
  if (presetTurnId && getTurnById(presetTurnId)) wizard.turnId = presetTurnId;
  renderWizard();
  const m = document.getElementById('wizard-modal');
  if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
}
function closeWizard() { const m = document.getElementById('wizard-modal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }
function wizStepLabels(){ return ['Cliente','Espacios','Fecha','Horario','Servicios','Resumen','Confirmación']; }
function renderWizard() {
  const body = document.getElementById('wizard-body');
  const foot = document.getElementById('wizard-foot');
  const title = document.getElementById('wizard-title');
  if (!body || !wizard) return;
  const steps = wizStepLabels();
  title.innerHTML = `Nueva reserva <span class="text-xs font-sans font-bold text-gray-400 ml-2">Paso ${wizard.step} de 7 · ${steps[wizard.step-1]}</span>`;
  document.getElementById('wizard-steps').innerHTML = steps.map((s,i)=>`<div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-full text-[0.65rem] font-extrabold flex items-center justify-center ${wizard.step> i+1?'bg-emerald-600 text-white':wizard.step===i+1?'bg-forest-800 text-white':'bg-gray-200 text-gray-500'}">${i+1}</span><span class="text-[0.65rem] font-bold ${wizard.step===i+1?'text-forest-900':'text-gray-400'} hidden sm:inline">${s}</span></div>${i<6?'<span class="w-3 sm:w-6 h-0.5 bg-gray-200 rounded"></span>':''}`).join('');
  let html = '';
  if (wizard.step === 1) {
    const existing = [...new Map(reservations.map(r=>[r.phone+r.clientName,r])).values()].slice(0,50);
    html = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>${lbl('Nombre del cliente *')}<input id="w-name" value="${wizard.client.name}" placeholder="Ej: Patricia Benítez" class="${inputCls()}"></div>
      <div>${lbl('Teléfono *')}<input id="w-phone" value="${wizard.client.phone}" placeholder="0981 123456" class="${inputCls()}"></div>
      <div>${lbl('Email')}<input id="w-email" value="${wizard.client.email}" class="${inputCls()}"></div>
      <div>${lbl('Notas cliente')}<input id="w-cnotes" value="${wizard.client.notes}" class="${inputCls()}"></div></div>
      ${existing.length?`<div class="mt-3">${lbl('O busca existente')}<div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">`+existing.slice(0,12).map(r=>`<button onclick="wizPickClient('${r.id}')" class="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-emerald-100 text-xs font-bold">${r.clientName} · ${r.phone}</button>`).join('')+`</div></div>`:''}`;
  } else if (wizard.step === 2) {
    html = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">` + spaces.filter(s=>s.active).map(s=>`
      <button onclick="wizToggleSpace('${s.id}')" class="p-4 rounded-2xl border-2 text-left transition ${wizard.spaceIds.includes(s.id)?'border-emerald-600 bg-emerald-50':'border-gray-200 hover:border-gray-300'}">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-2" style="background:${s.color}"><i class="${s.icon}"></i></div>
        <div class="font-bold text-sm">${s.name}</div><div class="text-xs text-gray-500">Cap. ${s.capacity||'-'}</div>
        <div class="text-[0.65rem] font-bold mt-1 ${wizard.spaceIds.includes(s.id)?'text-emerald-700':'text-gray-400'}">${wizard.spaceIds.includes(s.id)?'✓ Seleccionado':'Toca para seleccionar'}</div>
      </button>`).join('') + `</div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button onclick="wizSetCombo(['salon','piscina'])" class="px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 text-xs font-bold">Salón + Piscina</button>
        <button onclick="wizSetCombo(['salon','piscina','quincho'])" class="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold">Todo el predio</button>
        <button onclick="wizSetCombo(['piscina'])" class="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold">Solo Piscina</button>
      </div>`;
  } else if (wizard.step === 3) {
    const multi = !!wizard.endDate;
    html = `${lbl('Fecha del evento *')}<input id="w-date" type="date" value="${wizard.date}" min="${getTodayStr()}" class="${inputCls()}">
    <label class="flex items-center gap-2 text-sm text-gray-700 mt-3"><input type="checkbox" id="w-multi" ${multi?'checked':''} class="rounded"> Evento de varios días (ej: boda de 2 días)</label>
    <div id="w-end-wrap" class="${multi?'':'hidden'} mt-2">${lbl('Fecha fin (inclusive)')}<input id="w-end" type="date" value="${wizard.endDate||wizard.date}" min="${wizard.date}" class="${inputCls()}"></div>
    <div id="w-date-hint" class="text-xs mt-2"></div>`;
  } else if (wizard.step === 4) {
    const avail = turns.filter(t=>t.active && (!t.spaces?.length || wizard.spaceIds.some(s=>t.spaces.includes(s))));
    const ds = wizDates();
    html = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">` + avail.map(t=>{
      const perDay = ds.map(d => ({ d, chk: checkMultiAvailability(wizard.spaceIds, d, t.id, null, t.id === 'personalizado' ? (wizard.customStart || null) : null, t.id === 'personalizado' ? (wizard.customEnd || null) : null) }));
      const bad = perDay.filter(x => !x.chk.available);
      const pendingTimes = t.id === 'personalizado' && (!wizard.customStart || !wizard.customEnd);
      const okAll = !bad.length && !pendingTimes;
      const badge = pendingTimes ? '<span class="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">Define horas ↓</span>'
        : okAll ? '<span class="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Disponible' + (ds.length > 1 ? ` ×${ds.length}` : '') + '</span>'
        : '<span class="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Ocupado</span>';
      return `<button onclick="wizPickTurn('${t.id}')" class="p-4 rounded-2xl border-2 text-left ${wizard.turnId===t.id?'border-emerald-600 bg-emerald-50':'border-gray-200'} ${okAll||pendingTimes?'hover:border-emerald-400':'opacity-70 border-red-200 bg-red-50/50'}">
        <div class="flex items-center justify-between"><b class="text-sm">${t.name}</b>${badge}</div>
        <div class="text-xs text-gray-500 mt-1">${t.startTime} – ${t.endTime} · ${turnHours(t.id)}h</div>
        ${bad.length?`<div class="text-[0.65rem] text-red-600 mt-1">Conflicto ${bad.map(x=>x.d).join(', ')} en: ${[...new Set(bad.flatMap(x=>x.chk.conflicts.map(c=>getSpaceById(c.spaceId)?.shortName)))].join(', ')}</div>`:''}
      </button>`;
    }).join('') + `</div>
    <div id="w-custom-time" class="mt-3 ${wizard.turnId==='personalizado'?'':'hidden'} grid grid-cols-2 gap-3">
      <div>${lbl('Hora inicio')}<input id="w-cstart" type="time" value="${wizard.customStart||'10:00'}" class="${inputCls()}"></div>
      <div>${lbl('Hora fin')}<input id="w-cend" type="time" value="${wizard.customEnd||'18:00'}" class="${inputCls()}"></div>
    </div>`;
  } else if (wizard.step === 5) {
    const hrs = turnHours(wizard.turnId, wizard.customStart || null, wizard.customEnd || null);
    html = `<div class="grid grid-cols-2 gap-3 mb-3">
      <div>${lbl('Invitados estimados')}<input id="w-guests" type="number" min="1" max="2000" value="${wizard.guests||30}" class="${inputCls()}"></div>
      <div>${lbl('Duración')}<input value="${hrs} h ${wizard.turnId==='personalizado'&&wizard.customStart?`(${wizard.customStart}–${wizard.customEnd})`:''}" disabled class="${inputCls()} opacity-70"></div>
    </div>
    ${lbl('Servicios adicionales')}<div class="space-y-2">` + services.filter(s=>s.active).map(s=>`
      <label class="flex items-center justify-between p-3 rounded-xl border cursor-pointer ${wizard.serviceIds.includes(s.id)?'border-emerald-500 bg-emerald-50':'border-gray-200'}">
        <span class="flex items-center gap-3"><input type="checkbox" ${wizard.serviceIds.includes(s.id)?'checked':''} onchange="wizToggleService('${s.id}')" class="rounded"><span><b class="text-sm">${s.name}</b><br><span class="text-xs text-gray-500">${s.description||''}</span></span></span>
        <b class="text-sm">${formatGs(s.price)}</b>
      </label>`).join('') + `</div>
      <div class="mt-3">${lbl('Descuento (Gs)')}<input id="w-disc" type="number" step="1000" value="${wizard.discount||0}" class="${inputCls()}"></div>`;
  } else if (wizard.step === 6) {
    const calc = calcWizardTotal();
    html = `<div class="bg-gray-50 rounded-2xl border p-4 space-y-2 text-sm">
      <div><b>Cliente:</b> ${wizard.client.name} (${wizard.client.phone}) · <b>${wizard.guests||30} invitados</b></div>
      <div><b>Fecha:</b> ${wizDateLabel()} · <b>Turno:</b> ${getTurnById(wizard.turnId)?.name||'-'} ${wizard.turnId==='personalizado'?`(${wizard.customStart}–${wizard.customEnd})`:''}</div>
      <div><b>Espacios:</b> ${wizard.spaceIds.map(s=>getSpaceById(s)?.name).join(', ')}</div>
      <div class="pt-2 border-t space-y-1">${calc.breakdown.map(b=>`<div class="flex justify-between text-xs"><span>${b.label}</span><b>${formatGs(b.price)}</b></div>`).join('')}
      ${calc.services.map(s=>`<div class="flex justify-between text-xs text-purple-700"><span>+ ${s.name}</span><b>${formatGs(s.price)}</b></div>`).join('')}
      ${wizard.discount?`<div class="flex justify-between text-xs text-emerald-700"><span>Descuento</span><b>−${formatGs(wizard.discount)}</b></div>`:''}</div>
      <div class="flex justify-between pt-2 border-t font-serif text-xl font-extrabold"><span>Total</span><span>${formatGs(calc.total)}</span></div>
      <div>${lbl('Ajuste manual del total (opcional, deja vacío para usar cálculo)')}<input id="w-total-override" type="number" step="1000" value="${wizard.totalOverride||''}" placeholder="${calc.total}" class="${inputCls()}"></div>
      <div>${lbl('Estado inicial')}<select id="w-status" class="${inputCls()}">
        <option value="pendiente" ${wizard.status==='pendiente'?'selected':''}>Pendiente (no bloquea agenda hasta confirmar)</option>
        <option value="confirmada" ${wizard.status==='confirmada'?'selected':''}>Confirmada (bloquea espacios)</option>
        <option value="solicitud" ${wizard.status==='solicitud'?'selected':''}>Solicitud web</option>
      </select></div></div>`;
  } else {
    const calc = calcWizardTotal();
    const finalTotal = wizard.totalOverride || calc.total;
    html = `<div class="text-center py-2"><div class="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl mb-2"><i class="fa-solid fa-check"></i></div>
      <h4 class="font-serif text-xl font-bold">¿Confirmar reserva?</h4>
      <p class="text-sm text-gray-500 mt-1">${wizard.client.name} · ${wizDateLabel()} · ${wizard.spaceIds.map(s=>getSpaceById(s)?.shortName).join(' + ')} · ${getTurnById(wizard.turnId)?.shortName} · ${wizard.guests||30} pers.</p>
      <div class="font-serif text-3xl font-extrabold mt-2">${formatGs(finalTotal)}</div>
      <p class="text-xs text-gray-400 mt-1">Se validará disponibilidad en frontend y al guardar.</p></div>`;
  }
  body.innerHTML = html;
  if (wizard.step === 3) {
    const di = document.getElementById('w-date');
    const mu = document.getElementById('w-multi');
    const ew = document.getElementById('w-end-wrap');
    const en = document.getElementById('w-end');
    di?.addEventListener('change', () => { wizard.date = di.value; if (en) en.min = di.value; paintDateHint(); });
    mu?.addEventListener('change', () => {
      wizard.endDate = mu.checked ? (en?.value || wizard.date) : '';
      ew?.classList.toggle('hidden', !mu.checked);
      paintDateHint();
    });
    en?.addEventListener('change', () => { wizard.endDate = en.value; paintDateHint(); });
    paintDateHint();
  }
  foot.innerHTML = `
    ${wizard.step>1?`<button onclick="wizNav(-1)" class="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">← Atrás</button>`:''}
    <span class="flex-1"></span>
    <button onclick="closeWizard()" class="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-600">Cancelar</button>
    ${wizard.step<7?`<button onclick="wizNav(1)" class="btn-forest px-6 py-2.5 rounded-xl text-xs font-bold shadow">Siguiente →</button>`:`<button onclick="wizSave()" class="btn-gold px-6 py-2.5 rounded-xl text-xs font-bold shadow">✓ Crear reserva</button>`}`;
}
/* Fechas del wizard: día único o rango inclusivo (máx. 30 días) */
function wizDates() {
  const out = [wizard.date];
  if (wizard.endDate && wizard.endDate > wizard.date) {
    let d = parseYMD(wizard.date);
    const end = parseYMD(wizard.endDate);
    let guard = 0;
    while (d < end && guard < 29) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      out.push(toDateStr(d));
      guard++;
    }
  }
  return out;
}
function wizDateLabel() {
  const ds = wizDates();
  return ds.length > 1 ? `${ds[0]} → ${ds[ds.length - 1]} (${ds.length} días)` : ds[0];
}
function paintDateHint(){
  const h=document.getElementById('w-date-hint');if(!h)return;
  const ds=wizDates();
  const busy=ds.map(d=>({d,rs:reservationsOnDate(d).filter(isActiveReservation)})).filter(x=>x.rs.length);
  if(!busy.length){h.innerHTML=`<span class="text-emerald-700 font-bold">🟢 ${ds.length>1?`Rango libre (${ds.length} días)`:'Día libre en todos los espacios'}.</span>`;return;}
  h.innerHTML='<span class="text-amber-700 font-bold">⚠️ Ocupado:</span> '+busy.map(x=>`${x.d}: ${x.rs.map(r=>`${r.clientName} (${getSpacesOfReservation(r.id).map(s=>getSpaceById(s.spaceId)?.shortName).join('+')})`).join(', ')}`).join(' · ');
}
function wizPickClient(id){ const r=reservations.find(x=>x.id===id); if(!r)return; wizard.client={name:r.clientName,phone:r.phone,email:r.email||'',notes:''}; renderWizard(); }
function wizToggleSpace(id){ wizard.spaceIds=wizard.spaceIds.includes(id)?wizard.spaceIds.filter(x=>x!==id):[...wizard.spaceIds,id]; renderWizard(); }
function wizSetCombo(ids){ wizard.spaceIds=ids; renderWizard(); }
function wizPickTurn(id){
  if (wizard.turnId === 'personalizado') {
    wizard.customStart = document.getElementById('w-cstart')?.value || wizard.customStart;
    wizard.customEnd = document.getElementById('w-cend')?.value || wizard.customEnd;
  }
  wizard.turnId = id; renderWizard();
}
function wizToggleService(id){ wizard.serviceIds=wizard.serviceIds.includes(id)?wizard.serviceIds.filter(x=>x!==id):[...wizard.serviceIds,id]; renderWizard(); }
function wizNav(dir){
  // capturar campos del paso actual
  if (wizard.step===1){ wizard.client.name=document.getElementById('w-name')?.value.trim()||''; wizard.client.phone=document.getElementById('w-phone')?.value.trim()||''; wizard.client.email=document.getElementById('w-email')?.value.trim()||''; wizard.client.notes=document.getElementById('w-cnotes')?.value.trim()||'';
    if(dir>0&&(!wizard.client.name||!wizard.client.phone))return showToast('Completa nombre y teléfono','error'); }
  if (wizard.step===2&&dir>0&&!wizard.spaceIds.length)return showToast('Selecciona al menos un espacio','error');
  if (wizard.step===3){
    wizard.date=document.getElementById('w-date')?.value||wizard.date;
    wizard.endDate=document.getElementById('w-multi')?.checked?(document.getElementById('w-end')?.value||wizard.date):'';
    if(dir>0&&!wizard.date)return showToast('Elige fecha','error');
    if(dir>0&&wizard.endDate&&wizard.endDate<wizard.date)return showToast('La fecha fin es anterior al inicio','error');
  }
  if (wizard.step===4){
    if(wizard.turnId==='personalizado'){wizard.customStart=document.getElementById('w-cstart')?.value||'';wizard.customEnd=document.getElementById('w-cend')?.value||'';}
    if(dir>0){ if(!wizard.turnId)return showToast('Elige un horario','error');
      if(wizard.turnId==='personalizado'&&(!wizard.customStart||!wizard.customEnd))return showToast('Define hora de inicio y fin','error');
      const badDay=wizDates().find(d=>!checkMultiAvailability(wizard.spaceIds,d,wizard.turnId,null,wizard.customStart||null,wizard.customEnd||null).available);
      if(badDay){const chk=checkMultiAvailability(wizard.spaceIds,badDay,wizard.turnId,null,wizard.customStart||null,wizard.customEnd||null);return showToast(`Conflicto el ${badDay}: `+chk.conflicts.map(c=>getSpaceById(c.spaceId)?.shortName).join(', ')+' ocupado(s)','error');} } }
  if (wizard.step===5){ wizard.discount=parseInt(document.getElementById('w-disc')?.value)||0; wizard.guests=Math.max(1,parseInt(document.getElementById('w-guests')?.value)||30); }
  if (wizard.step===6){ const ov=parseInt(document.getElementById('w-total-override')?.value)||null; wizard.totalOverride=ov; wizard.status=document.getElementById('w-status')?.value||'pendiente'; }
  wizard.step=Math.min(7,Math.max(1,wizard.step+dir)); renderWizard();
}
function calcWizardTotal(){
  const guests=wizard.guests||30;
  const ds=wizDates();
  const agg={};
  ds.forEach(d=>{
    const price=evaluatePrice(wizard.spaceIds,wizard.turnId,d,guests,null,wizard.customStart||null,wizard.customEnd||null);
    price.breakdown.forEach(b=>{ agg[b.spaceId]=agg[b.spaceId]||{label:b.label.split(' · ')[0],price:0,days:0}; agg[b.spaceId].price+=b.price; agg[b.spaceId].days++; });
  });
  const breakdown=Object.entries(agg).map(([sid,a])=>({spaceId:sid,label:`${a.label} × ${a.days} día${a.days===1?'':'s'}`,price:a.price}));
  const subtotal=breakdown.reduce((a,b)=>a+b.price,0);
  const svc=wizard.serviceIds.map(id=>services.find(s=>s.id===id)).filter(Boolean);
  const svcTotal=svc.reduce((a,s)=>a+(s.price||0),0);
  return { breakdown, services:svc, total: Math.max(0, subtotal+svcTotal-(wizard.discount||0)) };
}
function wizSave(){
  const calc=calcWizardTotal();
  const total=wizard.totalOverride||calc.total;
  const ds=wizDates();
  const badDay=ds.find(d=>!checkMultiAvailability(wizard.spaceIds,d,wizard.turnId,null,wizard.customStart||null,wizard.customEnd||null).available);
  if(badDay){ renderWizard(); return showToast(`Doble reserva evitada el ${badDay}`,'error'); }
  const res={id:generateId('res'),clientName:wizard.client.name,phone:wizard.client.phone,email:wizard.client.email,status:wizard.status,totalPrice:total,paidAmount:0,balance:total,discount:wizard.discount||0,guests:wizard.guests||30,notes:wizard.client.notes||'',source:'admin',createdBy:currentUser?.id||'admin',createdAt:nowISO(),updatedAt:nowISO(),services:wizard.serviceIds.map(id=>({serviceId:id,price:services.find(s=>s.id===id)?.price||0}))};
  reservations.unshift(res);
  ds.forEach(d=>wizard.spaceIds.forEach(sid=>reservationSpaces.push({id:generateId('rs'),reservationId:res.id,spaceId:sid,turnId:wizard.turnId,date:d,price:0,customStart:wizard.customStart,customEnd:wizard.customEnd})));
  saveJSON(STORAGE_KEYS.RESERVATIONS,reservations);saveJSON(STORAGE_KEYS.RESERVATION_SPACES,reservationSpaces);
  logAudit('create','reservation',res.id,{client:res.clientName,dates:wizDateLabel(),total},'info');
  closeWizard();renderDashboard();showToast(`Reserva creada · ${wizDateLabel()} · ${formatGs(total)}`,'success');
}
/* ---- Pagos ---- */
function openPaymentModal(resId){
  const r=reservations.find(x=>x.id===resId);if(!r)return;
  recalcReservationTotals(resId);
  const list=payments.filter(p=>p.reservationId===resId);
  openGenericModal({title:`Pagos · ${r.clientName}`,subtitle:`Total ${formatGs(r.totalPrice)} · Pagado ${formatGs(r.paidAmount)} · Saldo ${formatGs(r.balance)}`,
    bodyHtml:`<div class="space-y-2 max-h-40 overflow-y-auto">${list.length?list.map(p=>`<div class="flex justify-between items-center text-xs p-2 bg-gray-50 rounded-lg border"><span>${p.date} · ${p.method} ${p.status==='anulado'?'(ANULADO)':''}<br><span class="text-gray-400">${p.notes||''}</span></span><span class="flex items-center gap-2"><b class="${p.status==='anulado'?'line-through text-gray-400':'text-emerald-700'}">${formatGs(p.amount)}</b><button type="button" onclick="openReceipt('${resId}','${p.id}')" title="Imprimir recibo" class="p-1.5 rounded-lg bg-white border hover:bg-gray-100"><i class="fa-solid fa-print"></i></button></span></div>`).join(''):'<p class="text-xs text-gray-400">Sin pagos aún.</p>'}</div>
    <div class="grid grid-cols-2 gap-3 pt-2 border-t"><div>${lbl('Monto Gs *')}<input name="amount" type="number" required step="1000" max="${r.balance}" value="${r.balance}" class="${inputCls()}"></div><div>${lbl('Fecha')}<input name="date" type="date" value="${getTodayStr()}" class="${inputCls()}"></div></div>
    <div class="grid grid-cols-2 gap-3"><div>${lbl('Método')}<select name="method" class="${inputCls()}">${settings.defaultPaymentMethods.map(m=>`<option>${m}</option>`).join('')}</select></div><div>${lbl('Observaciones')}<input name="notes" placeholder="Seña / saldo..." class="${inputCls()}"></div></div>`,
    submitLabel:'Registrar pago',
    onSubmit:d=>{
      const amt=parseInt(d.amount)||0;
      if(amt<=0)return showToast('Monto inválido','error');
      if(amt>r.balance)return showToast('Supera el saldo','error');
      const p={id:generateId('pay'),reservationId:resId,amount:amt,date:d.date,method:d.method,notes:d.notes,status:'cobrado',recordedBy:currentUser?.id,createdAt:nowISO()};
      payments.unshift(p);saveJSON(STORAGE_KEYS.PAYMENTS,payments);
      // ingreso automático
      const inc={id:generateId('inc'),date:d.date,concept:`Pago reserva · ${r.clientName}`,reservationId:resId,clientName:r.clientName,amount:amt,paymentMethod:d.method,recordedBy:currentUser?.id,notes:d.notes||'',createdAt:nowISO()};
      incomes.unshift(inc);saveJSON(STORAGE_KEYS.INCOMES,incomes);
      recalcReservationTotals(resId);
      logAudit('create','payment',p.id,{reservation:resId,amount:amt},'info');
      closeGenericModal();renderDashboard();showToast(`Pago registrado · Saldo ${formatGs(reservations.find(x=>x.id===resId).balance)}`,'success');
    }});
}
/* ---- Recibo imprimible (reserva o pago individual) ---- */
function openReceipt(resId, paymentId = null) {
  const r = reservations.find(x => x.id === resId); if (!r) return;
  const sps = getSpacesOfReservation(resId);
  const pays = payments.filter(p => p.reservationId === resId && p.status !== 'anulado');
  const focus = paymentId ? pays.find(p => p.id === paymentId) : null;
  const total = r.totalPrice ?? r.estimatedPrice ?? 0;
  const paid = r.paidAmount || 0;
  const bal = Math.max(0, total - paid);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return showToast('Permite ventanas emergentes para imprimir', 'error');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Recibo · ${esc(r.clientName)}</title>
  <style>body{font-family:Arial,sans-serif;color:#111;max-width:640px;margin:24px auto;padding:0 16px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#555}table{width:100%;border-collapse:collapse;font-size:14px}td,th{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.tot{font-size:16px;font-weight:bold}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b4332;padding-bottom:10px}.muted{color:#666;font-size:12px}.sign{display:flex;gap:40px;margin-top:48px}.sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px;text-align:center}@media print{.noprint{display:none}}</style></head><body>
  <div class="head"><div><h1>${esc(settings.companyName)}</h1><div class="muted">${esc(settings.companyAddress)} · ${esc(settings.companyPhone)}</div></div>
  <div style="text-align:right"><b>${focus ? 'RECIBO DE PAGO' : 'CONFIRMACIÓN DE RESERVA'}</b><br><span class="muted">${esc(getTodayStr())} · N° ${esc((focus?.id || r.id).slice(-6).toUpperCase())}</span></div></div>
  <h2>Cliente</h2><table><tr><th>Nombre</th><td>${esc(r.clientName)}</td></tr><tr><th>Teléfono</th><td>${esc(r.phone)}${r.email ? ' · ' + esc(r.email) : ''}</td></tr></table>
  <h2>Reserva</h2><table><tr><th>Fecha</th><td>${esc(getPrimaryDateOfReservation(r) || r.date || '-')}</td></tr>
  <tr><th>Espacios / turnos</th><td>${sps.length ? sps.map(x => esc(`${getSpaceById(x.spaceId)?.name || x.spaceId} · ${getTurnById(x.turnId)?.name || x.turnId}`)).join('<br>') : esc(r.eventType || '-')}</td></tr>
  <tr><th>Estado</th><td>${esc(STATUS_META[normStatus(r.status)]?.l || r.status)}</td></tr></table>
  ${focus ? `<h2>Pago</h2><table><tr><th>Fecha</th><td>${esc(focus.date)}</td></tr><tr><th>Monto</th><td class="tot">${formatGs(focus.amount)}</td></tr><tr><th>Método</th><td>${esc(focus.method)}</td></tr>${focus.notes ? `<tr><th>Obs.</th><td>${esc(focus.notes)}</td></tr>` : ''}</table>` : ''}
  <h2>Resumen</h2><table><tr><th>Total</th><td class="tot">${formatGs(total)}</td></tr><tr><th>Pagado</th><td>${formatGs(paid)}</td></tr><tr><th>Saldo</th><td class="tot">${formatGs(bal)}</td></tr></table>
  ${!focus && pays.length ? `<h2>Historial de pagos</h2><table><tr><th>Fecha</th><th>Método</th><th>Monto</th></tr>` + pays.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.method)}</td><td>${formatGs(p.amount)}</td></tr>`).join('') + `</table>` : ''}
  ${r.notes ? `<p class="muted">Notas: ${esc(r.notes)}</p>` : ''}
  <p class="muted">Documento interno no válido como factura fiscal.</p>
  <div class="sign"><div>Firma cliente / aclaración</div><div>Firma administración</div></div>
  <div class="noprint" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:10px 28px;font-weight:bold;cursor:pointer">Imprimir</button></div>
  </body></html>`);
  w.document.close();
  logAudit('print', 'receipt', focus?.id || r.id, { reservation: resId }, 'info');
}
/* ---- Compat: eliminar con cascada + WhatsApp con fecha primaria ---- */
function deleteReservation(id){
  const r=reservations.find(x=>x.id===id);
  if(!r)return;
  if(!confirm(`¿Eliminar reserva de ${r.clientName}? Se quitarán espacios asociados (los pagos/ingresos se conservan por auditoría).`))return;
  reservations=reservations.filter(x=>x.id!==id);
  reservationSpaces=reservationSpaces.filter(x=>x.reservationId!==id);
  saveJSON(STORAGE_KEYS.RESERVATIONS,reservations);saveJSON(STORAGE_KEYS.RESERVATION_SPACES,reservationSpaces);
  logAudit('delete','reservation',id,{client:r.clientName},'warning');
  renderDashboard();showToast('Reserva eliminada','info');
}
function getWhatsAppLinkForClient(r){
  const cleanPhone=String(r.phone||'').replace(/[^0-9]/g,'');
  const targetPhone=cleanPhone.startsWith('595')?cleanPhone:'595'+(cleanPhone.startsWith('0')?cleanPhone.substring(1):cleanPhone);
  const dStr=getPrimaryDateOfReservation(r)||r.date||'';
  const formattedDate=dStr?new Date(dStr+'T00:00:00').toLocaleDateString('es-PY',{weekday:'long',day:'numeric',month:'long'}):'fecha a coordinar';
  const bal=Math.max(0,(r.totalPrice??r.estimatedPrice??0)-(r.paidAmount||0));
  let message='';
  if(['confirmada','pagado_parcial','pagado'].includes(normStatus(r.status))){
    message=`¡Hola ${r.clientName}! 🌿 Te saludamos desde *${settings.companyName}*.\nTu reserva del *${formattedDate}* está confirmada. Total ${formatGs(r.totalPrice??r.estimatedPrice)} · Pagado ${formatGs(r.paidAmount||0)} · Saldo ${formatGs(bal)}. ¿Coordinamos detalles?`;
  } else {
    message=`¡Hola ${r.clientName}! 🌿 Te saludamos desde *${settings.companyName}*.\nRecibimos tu solicitud para el *${formattedDate}*. ¿Seguís interesado/a? Te confirmamos disponibilidad y precio.`;
  }
  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
}
// El botón "Nueva Reserva" abre el wizard (el modal legacy queda como fallback)
function openNewReservationModal(defaultDate=null, presetSpaceId=null, presetTurnId=null){ openWizard(defaultDate, presetSpaceId, presetTurnId); }
// Modal de día enriquecido: lista todas las reservas del día + espacios
function openDayDetailModal(dateStr, status, res, isBlocked){
  const modal=document.getElementById('day-modal');if(!modal)return;
  const title=document.getElementById('day-modal-title');const body=document.getElementById('day-modal-body');const actions=document.getElementById('day-modal-actions');
  const formattedDate=new Date(dateStr+'T00:00:00').toLocaleDateString('es-PY',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  title.textContent=formattedDate.charAt(0).toUpperCase()+formattedDate.slice(1);
  const dayRes=reservationsOnDate(dateStr);
  let badge=status==='past'?'<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">Fecha pasada</span>'
    :isBlocked?'<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">🔒 Bloqueada</span>'
    :dayRes.some(r=>['confirmada','pagado_parcial','pagado','en_curso'].includes(normStatus(r.status)))?'<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">🔴 Ocupada</span>'
    :dayRes.length?'<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">🟡 Con solicitudes</span>'
    :'<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">🟢 Disponible</span>';
  let html=`<div class="mb-3 flex items-center gap-2"><span class="text-xs text-gray-500 font-semibold">Estado:</span>${badge}</div>`;
  // disponibilidad por espacio/turno
  html+=`<div class="grid grid-cols-2 gap-2 mb-3">`+spaces.filter(s=>s.active).map(s=>{
    const occ=reservationSpaces.filter(rs=>rs.spaceId===s.id&&rs.date===dateStr&&isActiveReservation(reservations.find(r=>r.id===rs.reservationId)||{}));
    return `<div class="text-xs p-2 rounded-xl border ${occ.length?'bg-red-50 border-red-200':'bg-emerald-50 border-emerald-200'}"><b>${s.shortName}</b><br>${occ.length?('🔴 '+occ.map(o=>getTurnById(o.turnId)?.shortName).join(', ')):'🟢 Libre'}</div>`;
  }).join('')+`</div>`;
  if(dayRes.length){ html+=dayRes.map(r=>{const sps=getSpacesOfReservation(r.id);const bal=Math.max(0,(r.totalPrice??r.estimatedPrice??0)-(r.paidAmount||0));return `<div class="bg-gray-50 p-3 rounded-xl border text-sm space-y-1"><div class="flex justify-between items-center"><b>${r.clientName}</b>${statusBadge(r.status)}</div><div class="text-xs text-gray-500">${r.phone} · ${sps.map(x=>`${getSpaceById(x.spaceId)?.shortName}·${getTurnById(x.turnId)?.shortName}`).join(' + ')||r.eventType||''}</div><div class="text-xs">Total <b>${formatGs(r.totalPrice??r.estimatedPrice)}</b> · Saldo <b class="${bal>0?'text-red-600':'text-emerald-600'}">${formatGs(bal)}</b></div><div class="flex gap-1.5 pt-1"><button onclick="openReservationDetail('${r.id}')" class="px-2.5 py-1 rounded-lg bg-white border text-xs font-bold">Detalle</button><button onclick="openPaymentModal('${r.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">Pago</button><a href="${getWhatsAppLinkForClient(r)}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">WhatsApp</a></div></div>`;}).join(''); }
  else if(!isBlocked){ html+=`<p class="text-sm text-gray-500 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">Día libre. Puedes crear una reserva o bloquear la fecha.</p>`; }
  body.innerHTML=html;
  actions.innerHTML='';
  const mk=(label,cls,fn)=>{const b=document.createElement('button');b.className=cls;b.innerHTML=label;b.onclick=fn;actions.appendChild(b);};
  if(res&&['pendiente','solicitud'].includes(normStatus(res.status)))mk('<i class="fa-solid fa-check mr-1"></i>Confirmar','btn-forest px-4 py-2 rounded-xl text-xs font-bold',()=>{updateReservationStatus(res.id,'confirmada');closeDayDetailModal();});
  if(!isBlocked&&!dayRes.length){mk('<i class="fa-solid fa-plus mr-1"></i>Reservar','btn-forest px-4 py-2 rounded-xl text-xs font-bold',()=>{closeDayDetailModal();openWizard(dateStr);});mk('<i class="fa-solid fa-lock mr-1"></i>Bloquear','bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold',()=>{toggleBlockDate(dateStr,true);closeDayDetailModal();});}
  if(isBlocked)mk('<i class="fa-solid fa-lock-open mr-1"></i>Liberar','bg-gray-800 text-white px-4 py-2 rounded-xl text-xs font-bold',()=>{toggleBlockDate(dateStr,false);closeDayDetailModal();});
  modal.classList.remove('hidden');modal.classList.add('flex');
}
// Alertas útiles y visibles (solicitudes, próximas reservas, saldos)
let dismissedAlerts = new Set();
function checkAlerts(){ renderAlerts(); }
function dismissAlert(key){ dismissedAlerts.add(key); renderAlerts(); }
function gotoTab(tab){
  const btn=document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
  if(btn)btn.click();
}
function renderAlerts(){
  const panel=document.getElementById('alerts-panel');
  if(!panel)return;
  const days=settings.alertDaysBefore||3;
  const today=getTodayStr();
  const limit=new Date();limit.setDate(limit.getDate()+days);
  const limitStr=toDateStr(limit);
  const pending=reservations.filter(r=>['pendiente','solicitud'].includes(normStatus(r.status)));
  const upcoming=reservations.filter(r=>{const d=getPrimaryDateOfReservation(r);return d&&d>=today&&d<=limitStr&&isActiveReservation(r);}).sort((a,b)=>String(getPrimaryDateOfReservation(a)).localeCompare(String(getPrimaryDateOfReservation(b))));
  const balOf=r=>((r.totalPrice??r.estimatedPrice??0)-(r.paidAmount||0));
  const debts=reservations.filter(r=>isActiveReservation(r)&&balOf(r)>0).sort((a,b)=>balOf(b)-balOf(a));
  let html='';
  if(pending.length&&!dismissedAlerts.has('pending')){
    html+=`<div class="flex flex-col sm:flex-row sm:items-center gap-2 p-4 rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
      <div class="flex items-center gap-3 flex-1"><div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><i class="fa-solid fa-bell"></i></div>
      <div class="text-sm"><b>${pending.length} solicitud${pending.length===1?'':'es'} pendiente${pending.length===1?'':'s'}</b><span class="text-gray-500"> · la más antigua: ${pending.map(r=>getPrimaryDateOfReservation(r)||'').filter(Boolean).sort()[0]||'—'} (${pending.map(r=>r.clientName).slice(0,2).join(', ')}${pending.length>2?'…':''})</span></div></div>
      <div class="flex gap-2"><button onclick="gotoTab('reservations')" class="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">Revisar</button>
      <button onclick="dismissAlert('pending')" class="px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-600">Ocultar</button></div></div>`;
  }
  if(upcoming.length&&!dismissedAlerts.has('upcoming')){
    html+=`<div class="p-4 rounded-2xl border border-sky-200 bg-sky-50 shadow-sm">
      <div class="flex items-center justify-between gap-2 mb-2"><span class="text-sm font-bold text-sky-900"><i class="fa-solid fa-calendar-day mr-1"></i>${upcoming.length} reserva${upcoming.length===1?'':'s'} en los próximos ${days} días</span>
      <button onclick="dismissAlert('upcoming')" class="text-xs font-bold text-gray-400 hover:text-gray-600">Ocultar</button></div>
      <div class="flex flex-wrap gap-2">`+upcoming.slice(0,6).map(r=>{const d=getPrimaryDateOfReservation(r);const sps=getSpacesOfReservation(r.id).map(x=>getSpaceById(x.spaceId)?.shortName).join('+')||'';return `<button onclick="openReservationDetail('${r.id}')" class="px-3 py-1.5 rounded-xl bg-white border border-sky-200 text-xs font-bold hover:bg-sky-100">${d} · ${r.clientName.split(' ').slice(0,2).join(' ')}${sps?' · '+sps:''}</button>`;}).join('')+(upcoming.length>6?`<span class="text-xs text-gray-400 self-center">+${upcoming.length-6} más</span>`:'')+`</div></div>`;
  }
  if(debts.length&&!dismissedAlerts.has('debts')){
    const top=debts.slice(0,4);
    const total=debts.reduce((a,r)=>a+((r.totalPrice??r.estimatedPrice??0)-(r.paidAmount||0)),0);
    html+=`<div class="p-4 rounded-2xl border border-red-200 bg-red-50 shadow-sm">
      <div class="flex items-center justify-between gap-2 mb-2"><span class="text-sm font-bold text-red-900"><i class="fa-solid fa-hourglass-half mr-1"></i>${debts.length} saldo${debts.length===1?'':'s'} pendiente${debts.length===1?'':'s'} · Total ${formatGs(total)}</span>
      <button onclick="dismissAlert('debts')" class="text-xs font-bold text-gray-400 hover:text-gray-600">Ocultar</button></div>
      <div class="flex flex-wrap gap-2">`+top.map(r=>{const bal=(r.totalPrice??r.estimatedPrice??0)-(r.paidAmount||0);return `<button onclick="openPaymentModal('${r.id}')" class="px-3 py-1.5 rounded-xl bg-white border border-red-200 text-xs font-bold hover:bg-red-100">${r.clientName.split(' ').slice(0,2).join(' ')} · ${formatGs(bal)}</button>`;}).join('')+(debts.length>4?`<span class="text-xs text-gray-400 self-center">+${debts.length-4} más</span>`:'')+`</div></div>`;
  }
  panel.innerHTML=html;
}
/* ---- Tabla reservas mejorada + estados ---- */
const STATUS_META={
  solicitud:{l:'Solicitud',c:'bg-sky-100 text-sky-800'},pendiente:{l:'Pendiente',c:'bg-amber-100 text-amber-800'},
  confirmada:{l:'Confirmada',c:'bg-red-100 text-red-700'},pagado_parcial:{l:'Pagado parcial',c:'bg-orange-100 text-orange-800'},
  pagado:{l:'Pagado',c:'bg-emerald-100 text-emerald-800'},en_curso:{l:'En curso',c:'bg-blue-100 text-blue-800'},
  finalizada:{l:'Finalizada',c:'bg-gray-200 text-gray-600'},cancelada:{l:'Cancelada',c:'bg-gray-100 text-gray-500'}};
function statusBadge(st){const m=STATUS_META[normStatus(st)]||STATUS_META.pendiente;return `<span class="px-2.5 py-1 rounded-full text-xs font-bold ${m.c}">${m.l}</span>`;}
let resFilterSpace = '', resFilterTurn = '', resFilterFrom = '', resFilterTo = '';
function populateResFilterSelects() {
  const ss = document.getElementById('filter-res-space');
  if (ss && !ss.dataset.populated) {
    ss.innerHTML = '<option value="">Todos los espacios</option>' + spaces.filter(s => s.active).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    ss.dataset.populated = '1';
  }
  const st = document.getElementById('filter-res-turn');
  if (st && !st.dataset.populated) {
    st.innerHTML = '<option value="">Todos los turnos</option>' + turns.filter(t => t.active).map(t => `<option value="${t.id}">${t.name} (${t.startTime}–${t.endTime})</option>`).join('');
    st.dataset.populated = '1';
  }
}
function renderReservationsTable(){
  const container=document.getElementById('reservations-list-container');if(!container)return;
  populateResFilterSelects();
  let list=reservations.slice();
  if(activeFilter!=='todas'){
    if(activeFilter==='confirmada')list=list.filter(r=>['confirmada','pagado_parcial','pagado','en_curso'].includes(normStatus(r.status)));
    else if(activeFilter==='pendiente')list=list.filter(r=>['pendiente','solicitud'].includes(normStatus(r.status)));
    else if(activeFilter==='cancelada')list=list.filter(r=>['cancelada','finalizada'].includes(normStatus(r.status)));
    else list=list.filter(r=>normStatus(r.status)===activeFilter);
  }
  if(searchQuery)list=list.filter(r=>(r.clientName||'').toLowerCase().includes(searchQuery)||(r.phone||'').includes(searchQuery));
  if(resFilterSpace)list=list.filter(r=>getSpacesOfReservation(r.id).some(x=>x.spaceId===resFilterSpace));
  if(resFilterTurn)list=list.filter(r=>getSpacesOfReservation(r.id).some(x=>x.turnId===resFilterTurn));
  if(resFilterFrom||resFilterTo)list=list.filter(r=>{
    const dates=getSpacesOfReservation(r.id).map(x=>x.date);
    if(!dates.length&&r.date)dates.push(r.date);
    return dates.some(d=>(!resFilterFrom||d>=resFilterFrom)&&(!resFilterTo||d<=resFilterTo));
  });
  list.sort((a,b)=>String(getPrimaryDateOfReservation(a)||'').localeCompare(String(getPrimaryDateOfReservation(b)||'')));
  if(!list.length){container.innerHTML='<div class="p-8 text-center text-gray-400 text-sm">Sin reservas con esos filtros.</div>';return;}
  container.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-left text-sm text-gray-600"><thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b"><tr><th class="px-4 py-3">Cliente</th><th class="px-4 py-3">Fecha / Espacios</th><th class="px-4 py-3">Total / Saldo</th><th class="px-4 py-3 text-center">Estado</th><th class="px-4 py-3 text-right">Acciones</th></tr></thead><tbody class="divide-y">`+
  list.map(r=>{
    const allDates=[...new Set(getSpacesOfReservation(r.id).map(x=>x.date).concat(r.date?[r.date]:[]))].sort();
    const d=allDates.length>1?`${allDates[0]} → ${allDates[allDates.length-1]} (${allDates.length}d)`:(allDates[0]||'-');
    const sps=getSpacesOfReservation(r.id);
    const spTxt=sps.length?sps.map(x=>`${getSpaceById(x.spaceId)?.shortName||x.spaceId}·${getTurnById(x.turnId)?.shortName||x.turnId}`).join('<br>'):(r.eventType||'-');
    const bal=(r.totalPrice??r.estimatedPrice??0)-(r.paidAmount||0);
    return `<tr class="hover:bg-gray-50/80"><td class="px-4 py-3"><div class="font-bold text-gray-900">${r.clientName}</div><a href="tel:${r.phone}" class="text-xs text-forest-700">${r.phone}</a></td>
    <td class="px-4 py-3"><div class="font-semibold text-gray-800">${d}</div><div class="text-xs text-gray-400">${spTxt}</div></td>
    <td class="px-4 py-3"><div class="font-bold text-gray-900">${formatGs(r.totalPrice??r.estimatedPrice)}</div><div class="text-xs ${bal>0?'text-red-600 font-bold':'text-emerald-600'}">Saldo ${formatGs(Math.max(0,bal))}</div></td>
    <td class="px-4 py-3 text-center">${statusBadge(r.status)}</td>
    <td class="px-4 py-3 text-right whitespace-nowrap space-x-1">
      <button onclick="openReservationDetail('${r.id}')" title="Ver detalle" class="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"><i class="fa-solid fa-eye"></i></button>
      <button onclick="openPaymentModal('${r.id}')" title="Registrar pago" class="p-2 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200"><i class="fa-solid fa-money-bill-wave"></i></button>
      ${['pendiente','solicitud'].includes(normStatus(r.status))?`<button onclick="updateReservationStatus('${r.id}','confirmada')" title="Confirmar" class="p-2 rounded-lg bg-emerald-600 text-white"><i class="fa-solid fa-check"></i></button>`:''}
      ${!['cancelada','finalizada'].includes(normStatus(r.status))?`<button onclick="updateReservationStatus('${r.id}','cancelada')" title="Cancelar" class="p-2 rounded-lg bg-red-100 text-red-700"><i class="fa-solid fa-ban"></i></button>`:''}
      <a href="${getWhatsAppLinkForClient(r)}" target="_blank" class="inline-block p-2 rounded-lg bg-emerald-600 text-white"><i class="fa-brands fa-whatsapp"></i></a>
      <button onclick="deleteReservation('${r.id}')" class="p-2 text-gray-400 hover:text-red-600"><i class="fa-regular fa-trash-can"></i></button>
    </td></tr>`;
  }).join('')+`</tbody></table></div>`;
}
function openReservationDetail(id){
  const r=reservations.find(x=>x.id===id);if(!r)return;
  const sps=getSpacesOfReservation(id);
  const pays=payments.filter(p=>p.reservationId===id);
  const hist=auditLogs.filter(l=>l.entityId===id).slice(0,8);
  const nextStates={solicitud:['pendiente','cancelada'],pendiente:['confirmada','cancelada'],confirmada:['pagado_parcial','pagado','en_curso','cancelada'],pagado_parcial:['pagado','en_curso','cancelada'],pagado:['en_curso','finalizada'],en_curso:['finalizada'],finalizada:[],cancelada:['pendiente']}[normStatus(r.status)]||[];
  openGenericModal({title:`Reserva · ${r.clientName}`,subtitle:`${getPrimaryDateOfReservation(r)||''} · ${formatGs(r.totalPrice??r.estimatedPrice)}`,
    bodyHtml:`<div class="grid grid-cols-2 gap-3 text-sm">
      <div class="bg-gray-50 rounded-xl border p-3"><b>Cliente</b><br>${r.clientName}<br><span class="text-gray-500">${r.phone} ${r.email||''}</span></div>
      <div class="bg-gray-50 rounded-xl border p-3"><b>Financiero</b><br>Total ${formatGs(r.totalPrice??r.estimatedPrice)}<br>Pagado <b class="text-emerald-700">${formatGs(r.paidAmount||0)}</b> · Saldo <b class="text-red-600">${formatGs(Math.max(0,(r.totalPrice??0)-(r.paidAmount||0)))}</b></div></div>
      <div class="text-sm"><b>Espacios / turnos</b>${sps.length?sps.map(x=>`<div class="text-xs p-2 border rounded-lg mt-1">${getSpaceById(x.spaceId)?.name} · ${getTurnById(x.turnId)?.name} · ${x.date}</div>`).join(''):'<div class="text-xs text-gray-400">Legacy: '+(r.eventType||'-')+'</div>'}</div>
      <div class="text-sm"><b>Pagos (${pays.length})</b>${pays.map(p=>`<div class="text-xs flex justify-between p-2 bg-gray-50 rounded-lg border mt-1"><span>${p.date} · ${p.method}</span><b>${formatGs(p.amount)}</b></div>`).join('')||'<div class="text-xs text-gray-400">Sin pagos</div>'}</div>
      ${r.notes?`<div class="text-xs text-gray-500">Notas: ${r.notes}</div>`:''}
      <div class="flex flex-wrap gap-2"><button type="button" onclick="openReceipt('${r.id}')" class="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold hover:bg-gray-100"><i class="fa-solid fa-print mr-1"></i>Imprimir recibo / confirmación</button></div>
      ${nextStates.length?`${lbl('Cambiar estado')}<div class="flex flex-wrap gap-2">`+nextStates.map(s=>`<button type="button" onclick="updateReservationStatus('${r.id}','${s}');closeGenericModal();openReservationDetail('${r.id}')" class="px-3 py-1.5 rounded-lg border text-xs font-bold hover:bg-gray-100">${STATUS_META[s]?.l||s}</button>`).join('')+`</div>`:''}
      <div class="text-xs"><b>Historial</b>${hist.map(h=>`<div class="text-gray-500">· ${new Date(h.timestamp).toLocaleString('es-PY')} — ${h.userName}: ${h.action} ${h.entityType}</div>`).join('')||'<div class="text-gray-400">Sin historial</div>'}</div>`,
    submitLabel:'Registrar pago', onSubmit:()=>{closeGenericModal();openPaymentModal(id);}});
}
// updateReservationStatus extendido (mantiene firma legacy)
function updateReservationStatus(id, newStatus){
  const r=reservations.find(x=>x.id===id);if(!r)return;
  const old=normStatus(r.status); const nx=normStatus(newStatus);
  // validar conflictos al confirmar
  if(nx==='confirmada'){
    const sps=getSpacesOfReservation(id);
    for(const sp of sps){ const chk=checkAvailability(sp.spaceId,sp.date,sp.turnId,id); if(!chk.available){ showToast('No se puede confirmar: '+getSpaceById(sp.spaceId)?.shortName+' ocupado','error'); return; } }
  }
  r.status=newStatus; r.updatedAt=nowISO();
  recalcReservationTotals(id);
  saveJSON(STORAGE_KEYS.RESERVATIONS,reservations);
  logAudit('update','reservation',id,{from:old,to:nx}, nx==='cancelada'?'warning':'info');
  // liberar = nada que borrar; el estado inactivo ya excluye de disponibilidad
  renderDashboard();
  showToast(nx==='confirmada'?`Confirmada · ${r.clientName}`:nx==='cancelada'?'Reserva cancelada. Espacios liberados.':`Estado → ${STATUS_META[nx]?.l||nx}`,'success');
}

