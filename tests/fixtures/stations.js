// Фікстури за формою відповідей Open Charge Map та Overpass (без мережі).
export const OCM_POI = {
  ID: 4242,
  UsageType: { Title: 'Public - Membership Required' },
  OperatorInfo: { Title: 'ЕКО', WebsiteURL: 'https://eco.example/' },
  DateLastStatusUpdate: '2026-11-01T10:00:00Z',
  AddressInfo: { Title: 'ЕКО Вінниця', AddressLine1: 'вул. Келецька 1', Town: 'Вінниця', Latitude: 49.2331, Longitude: 28.4682 },
  Connections: [
    { ConnectionType: { Title: 'Type 2 (Socket Only)' }, PowerKW: 22, Quantity: 2 },
    { ConnectionType: { Title: 'IEC 62196-3 Configuration FF (CCS Type 2)' }, PowerKW: 50, Quantity: 1 },
    { ConnectionType: { Title: 'Щось нове' }, PowerKW: null, Quantity: null },
  ],
};
export const OCM_NO_COORDS = { ID: 1, AddressInfo: { Title: 'x' }, Connections: [] };

export const OSM_NODE = {
  type: 'node', id: 123, lat: 49.2332, lon: 28.4683,
  tags: { amenity: 'charging_station', name: 'ЕКО Вінниця', operator: 'ЕКО', 'socket:type2': '2', 'socket:type2:output': '22 kW',
    opening_hours: '24/7', access: 'yes', website: 'https://eco.example/' },
};
export const OSM_WAY = { type: 'way', id: 77, center: { lat: 49.1, lon: 28.1 }, tags: { amenity: 'charging_station' } };
export const OSM_NO_COORDS = { type: 'relation', id: 5, tags: { amenity: 'charging_station' } };
