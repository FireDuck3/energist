// Усі ціни, константи й засіяні дані демо. Перед пітчем цифри правляться тут.

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
