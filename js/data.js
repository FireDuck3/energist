// Усі ціни, константи й засіяні дані демо. Перед пітчем цифри правляться тут.

// Збільште після зміни засіяних даних: збережений у браузері стан старої версії скинеться сам.
export const DATA_VERSION = 1;

export const COMMISSION = 0.10;          // комісія ЕнерГостя
export const HOME_TARIFF = 4.32;         // домашній тариф, грн/кВт·год
export const COMMERCIAL_PRICE = 35;      // типова комерційна зарядка, грн/кВт·год
export const COMMERCIAL_RANGE = [30, 40];
export const WEEKS_PER_MONTH = 4.33;
export const SIM_DURATION_MS = 20000;    // скільки триває симуляція зарядки в реальному часі

// Скільки кВт·год пристрій може взяти за одну сесію.
export const DEVICE_CAPACITY = { ev: 40, ecoflow: 1, gadget: 0.1 };

export const DEVICES = [
  { id: 'ev', label: 'Електромобіль' },
  { id: 'ecoflow', label: 'EcoFlow' },
  { id: 'gadget', label: 'Телефон / ноутбук' },
];

export const SOURCES = {
  solar: { label: 'Сонячна станція', icon: '☀️' },
  battery: { label: 'Батарея', icon: '🔋' },
  grid: { label: 'Мережа', icon: '⚡' },
};

export const CONNECTORS = {
  type2: 'Type 2 (для авто)',
  socket220: 'Розетка 220 В',
  usb: 'USB',
};

export const VINNYTSIA_CENTER = [49.2331, 28.4682];
export const VINNYTSIA_BOUNDS = [[49.17, 28.35], [49.29, 28.60]];

export const DEMO_HOST_ID = 'oleh';
export const DEMO_GUEST_NAME = 'Саша';

// Дата відносно сьогодні у форматі YYYY-MM-DD — засіяні бронювання завжди «свіжі».
export function isoDay(offset = 0, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const HOSTS = [
  // pastMonths — заробіток за 5 попередніх місяців, від найстарішого (для графіка в кабінеті).
  { id: 'oleh', name: 'Олег', vocative: 'Олеже', chargesCount: 47, sinceYear: 2025, sesCost: 190000,
    pastMonths: [1890, 3120, 3480, 3260, 2410] },
  { id: 'iryna', name: 'Ірина', chargesCount: 112, sinceYear: 2025 },
  { id: 'maksym', name: 'Максим', chargesCount: 63, sinceYear: 2025 },
  { id: 'oksana', name: 'Оксана', chargesCount: 28, sinceYear: 2026 },
  { id: 'andrii', name: 'Андрій', chargesCount: 54, sinceYear: 2025 },
  { id: 'natalia', name: 'Наталія', chargesCount: 39, sinceYear: 2026 },
  { id: 'taras', name: 'Тарас', chargesCount: 71, sinceYear: 2025 },
  { id: 'yulia', name: 'Юлія', chargesCount: 22, sinceYear: 2026 },
  { id: 'bohdan', name: 'Богдан', chargesCount: 85, sinceYear: 2025 },
  { id: 'kateryna', name: 'Катерина', chargesCount: 17, sinceYear: 2026 },
  { id: 'serhii', name: 'Сергій', chargesCount: 140, sinceYear: 2025 },
  { id: 'roman', name: 'Роман', chargesCount: 33, sinceYear: 2026 },
  { id: 'olena', name: 'Олена', chargesCount: 12, sinceYear: 2026 },
  { id: 'vasyl', name: 'Василь', chargesCount: 46, sinceYear: 2025 },
];

const r = (author, stars, text, daysAgo) => ({ author, stars, text, date: isoDay(-daysAgo) });

export const SPOTS = [
  { id: 'oleh-ses', title: 'Сонячний дах Олега', district: 'Вишенька', lat: 49.2262, lng: 28.409,
    hostId: 'oleh', source: 'solar', powerKw: 7.4, connector: 'type2', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 12, schedule: { from: '08:00', to: '20:00' }, blackoutHours: 6,
    reviews: [
      r('Ірина К.', 5, 'Заряджала Tesla, поки була на роботі. Олег сам усе показав, дуже зручно.', 3),
      r('Андрій П.', 5, 'Під час відключень — просто порятунок. Ціна втричі нижча, ніж на заправці.', 9),
      r('Марія', 4, 'Трохи складно знайти заїзд, але далі все чудово.', 21),
    ] },
  { id: 'oleh-garage', title: 'Гараж Олега: розетка 220 В', district: 'Вишенька', lat: 49.2245, lng: 28.4128,
    hostId: 'oleh', source: 'battery', powerKw: 3.6, connector: 'socket220', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 10, schedule: { from: '07:00', to: '22:00' }, blackoutHours: 8,
    reviews: [
      r('Максим', 5, 'Зарядив EcoFlow за годину, поки пив каву.', 2),
      r('Тарас', 4, 'Повільно для авто, але для павербанка ідеально.', 14),
    ] },
  { id: 'centre-cafe', title: 'Кав\'ярня з батареєю', district: 'Центр', lat: 49.2335, lng: 28.4689,
    hostId: 'iryna', source: 'battery', powerKw: 2, connector: 'socket220', devices: ['ecoflow', 'gadget'],
    pricePerKwh: 14, schedule: { from: '09:00', to: '21:00' }, blackoutHours: 5,
    reviews: [
      r('Оля', 5, 'Ноутбук і телефон заряджені, ще й капучино смачне.', 1),
      r('Влад', 5, 'Працює навіть коли весь центр без світла.', 6),
      r('Данило', 4, 'Іноді всі розетки зайняті, краще бронювати.', 12),
    ] },
  { id: 'old-town-house', title: 'Будинок біля Південного Бугу', district: 'Старе місто', lat: 49.2195, lng: 28.484,
    hostId: 'maksym', source: 'solar', powerKw: 7.4, connector: 'type2', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 11, schedule: { from: '08:00', to: '19:00' }, blackoutHours: 7,
    reviews: [
      r('Наталя', 5, 'Максим — найкращий господар. Навіть чай запропонував.', 4),
      r('Сергій', 5, 'Leaf зарядив з 20 до 80% за день.', 11),
    ] },
  { id: 'zamostia-yard', title: 'Двір на Замості', district: 'Замостя', lat: 49.2401, lng: 28.4935,
    hostId: 'oksana', source: 'grid', powerKw: 3.6, connector: 'socket220', devices: ['ev', 'ecoflow'],
    pricePerKwh: 9, schedule: { from: '06:00', to: '23:00' }, blackoutHours: 0,
    reviews: [
      r('Ігор', 4, 'Дешево і близько до дому. Але при відключеннях не працює.', 5),
      r('Катя', 5, 'Оксана дуже привітна, все пояснила.', 18),
    ] },
  { id: 'slovianka-cottage', title: 'СЕС на даху котеджу', district: 'Слов\'янка', lat: 49.229, lng: 28.442,
    hostId: 'andrii', source: 'solar', powerKw: 11, connector: 'type2', devices: ['ev'],
    pricePerKwh: 13, schedule: { from: '08:00', to: '20:00' }, blackoutHours: 9,
    reviews: [
      r('Роман', 5, '11 кВт — швидко, як на комерційній станції, але дешевше.', 2),
      r('Юля', 5, 'Чисто, безпечно, є навіс від дощу.', 8),
      r('Петро', 4, 'Тільки для авто, EcoFlow не підключиш.', 15),
      r('Олена', 5, 'Користуюсь щотижня.', 25),
    ] },
  { id: 'tiazhyliv-garage', title: 'Гараж з Type 2', district: 'Тяжилів', lat: 49.251, lng: 28.562,
    hostId: 'natalia', source: 'solar', powerKw: 7.4, connector: 'type2', devices: ['ev', 'ecoflow'],
    pricePerKwh: 10, schedule: { from: '07:00', to: '21:00' }, blackoutHours: 6,
    reviews: [
      r('Богдан', 5, 'Ідеально, коли живеш на Тяжилові без власного гаража.', 3),
      r('Аня', 4, 'Добре, але взимку сонця менше — уточнюйте наперед.', 20),
    ] },
  { id: 'piatnychany-battery', title: 'Будинок з батареями', district: 'П\'ятничани', lat: 49.2488, lng: 28.4575,
    hostId: 'taras', source: 'battery', powerKw: 5, connector: 'socket220', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 12, schedule: { from: '06:00', to: '22:00' }, blackoutHours: 10,
    reviews: [
      r('Ірина', 5, 'Тарас тримає світло навіть у найдовші відключення.', 1),
      r('Микола', 5, 'Зарядив два EcoFlow за раз.', 7),
      r('Світлана', 4, 'Трохи далеко від центру, але воно того варте.', 16),
    ] },
  { id: 'academic-parking', title: 'Сонячний паркінг', district: 'Академічний', lat: 49.2055, lng: 28.421,
    hostId: 'yulia', source: 'solar', powerKw: 11, connector: 'type2', devices: ['ev'],
    pricePerKwh: 13, schedule: { from: '08:00', to: '19:00' }, blackoutHours: 5,
    reviews: [
      r('Андрій', 5, 'Залишаю авто на день і забираю повним.', 5),
      r('Віка', 4, 'Добре, але закривається о 19:00.', 13),
    ] },
  { id: 'sabariv-estate', title: 'Садиба з СЕС', district: 'Сабарів', lat: 49.1985, lng: 28.453,
    hostId: 'bohdan', source: 'solar', powerKw: 7.4, connector: 'type2', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 9, schedule: { from: '08:00', to: '20:00' }, blackoutHours: 8,
    reviews: [
      r('Олег', 5, 'Найдешевша зарядка в місті, а Богдан ще й показав свою станцію.', 4),
      r('Ліза', 5, 'Діти гралися у дворі, поки заряджалось авто.', 10),
      r('Степан', 5, 'Рекомендую!', 30),
    ] },
  { id: 'podillia-office', title: 'Офіс з резервним живленням', district: 'Поділля', lat: 49.2195, lng: 28.446,
    hostId: 'kateryna', source: 'battery', powerKw: 3.6, connector: 'socket220', devices: ['ecoflow', 'gadget'],
    pricePerKwh: 15, schedule: { from: '09:00', to: '18:00' }, blackoutHours: 4,
    reviews: [
      r('Дмитро', 4, 'Можна попрацювати і зарядити все одразу.', 6),
      r('Марта', 5, 'Затишно і є Wi-Fi.', 17),
    ] },
  { id: 'centre-cowork', title: 'Коворкінг на Соборній', district: 'Центр', lat: 49.2318, lng: 28.4735,
    hostId: 'serhii', source: 'grid', powerKw: 2, connector: 'usb', devices: ['gadget'],
    pricePerKwh: 15, schedule: { from: '08:00', to: '22:00' }, blackoutHours: 0,
    reviews: [
      r('Ната', 4, 'Для телефона і ноутбука — норм. Під час відключень не працює.', 2),
      r('Артем', 5, 'Зручно в центрі.', 9),
    ] },
  { id: 'vyshenka-private', title: 'СЕС у приватному секторі', district: 'Вишенька', lat: 49.2278, lng: 28.404,
    hostId: 'roman', source: 'solar', powerKw: 7.4, connector: 'type2', devices: ['ev', 'ecoflow'],
    pricePerKwh: 11, schedule: { from: '08:00', to: '20:00' }, blackoutHours: 7,
    reviews: [
      r('Максим', 5, 'Роман допоміг підключити, хоча я вперше заряджав не на станції.', 3),
      r('Інна', 4, 'Все ок.', 19),
    ] },
  { id: 'near-zamostia-parking', title: 'Стоянка біля дому', district: 'Ближнє Замостя', lat: 49.2312, lng: 28.4892,
    hostId: 'olena', source: 'grid', powerKw: 3.6, connector: 'socket220', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 8, schedule: { from: '07:00', to: '23:00' }, blackoutHours: 0,
    reviews: [
      r('Василь', 4, 'Найдешевше, але тільки коли є світло.', 4),
      r('Тетяна', 5, 'Олена завжди на зв\'язку.', 11),
      r('Кирило', 4, 'Повільно, краще на ніч.', 22),
    ] },
  { id: 'tiazhyliv-roof', title: 'Станція на даху гаража', district: 'Тяжилів', lat: 49.247, lng: 28.556,
    hostId: 'vasyl', source: 'solar', powerKw: 3.6, connector: 'socket220', devices: ['ev', 'ecoflow', 'gadget'],
    pricePerKwh: 10, schedule: { from: '08:00', to: '20:00' }, blackoutHours: 6,
    reviews: [
      r('Олександр', 5, 'Василь — справжній ентузіаст сонячної енергії.', 5),
      r('Яна', 4, 'Заряджала EcoFlow перед відключенням. Все чітко.', 12),
    ] },
];

// Бронювання гостей на точках Олега (демо-господаря). Два чекають на підтвердження.
const booking = (o) => ({ actualKwh: null, total: null, fee: null, hostPayout: null, ...o });
export const SEED_BOOKINGS = [
  booking({ id: 'seed-1', spotId: 'oleh-ses', guestName: 'Ірина К.', device: 'ev', date: isoDay(-3), start: '18:00',
    hours: 3, estimatedKwh: 22.2, heldAmount: 266.4, status: 'reviewed', actualKwh: 20.5, total: 246, fee: 24.6,
    hostPayout: 221.4, createdAt: isoDay(-4) }),
  booking({ id: 'seed-2', spotId: 'oleh-garage', guestName: 'Максим', device: 'ecoflow', date: isoDay(-2), start: '20:00',
    hours: 1, estimatedKwh: 1, heldAmount: 10, status: 'reviewed', actualKwh: 1, total: 10, fee: 1, hostPayout: 9,
    createdAt: isoDay(-2) }),
  booking({ id: 'seed-3', spotId: 'oleh-ses', guestName: 'Андрій П.', device: 'ev', date: isoDay(-1), start: '09:00',
    hours: 4, estimatedKwh: 29.6, heldAmount: 355.2, status: 'paid', actualKwh: 29.6, total: 355.2, fee: 35.52,
    hostPayout: 319.68, createdAt: isoDay(-2) }),
  booking({ id: 'seed-4', spotId: 'oleh-ses', guestName: 'Юлія', device: 'ev', date: isoDay(1), start: '10:00',
    hours: 2, estimatedKwh: 14.8, heldAmount: 177.6, status: 'pending', createdAt: isoDay(0) }),
  booking({ id: 'seed-5', spotId: 'oleh-garage', guestName: 'Тарас', device: 'ecoflow', date: isoDay(1), start: '19:00',
    hours: 1, estimatedKwh: 1, heldAmount: 10, status: 'pending', createdAt: isoDay(0) }),
];
