// Fictional local directory. ZZ postcodes/addresses are deliberately non-deliverable.
// Telephone numbers use the UK drama ranges; email domains are reserved examples.
export const DEMO_CUSTOMERS = Object.freeze([
  Object.freeze({ id: 'demo-customer-emberfield', customerName: 'Emberfield Estates', contactEmail: 'office@emberfield.example', contactPhone: '01632 960001' }),
  Object.freeze({ id: 'demo-customer-beacon', customerName: 'Beacon Court Management', contactEmail: 'office@beacon.example', contactPhone: '01632 960002' }),
  Object.freeze({ id: 'demo-customer-northstar', customerName: 'Northstar Facilities', contactEmail: 'office@northstar.example', contactPhone: '01632 960003' }),
]);

export const DEMO_SITES = Object.freeze([
  { id: 'demo-site-emberfield-house', customerId: 'demo-customer-emberfield', name: 'Emberfield House', address: '10 Example Lane, Sampleton', postcode: 'ZZ1 1AA', equipment: [{ id: 'demo-equipment-house-panel', name: 'Demonstration reception panel', natureOfJob: 'Fire Alarm Panel' }, { id: 'demo-equipment-house-lights', name: 'Demonstration emergency lighting system', natureOfJob: 'Emergency Lighting' }] },
  { id: 'demo-site-emberfield-depot', customerId: 'demo-customer-emberfield', name: 'Emberfield Depot', address: '22 Fictional Way, Sampleton', postcode: 'ZZ1 2BB', equipment: [] },
  { id: 'demo-site-beacon-court', customerId: 'demo-customer-beacon', name: 'Beacon Court', address: '3 Example Square, Demo Borough', postcode: 'ZZ2 3CC', equipment: [{ id: 'demo-equipment-court-extinguishers', name: 'Demonstration lobby extinguishers', natureOfJob: 'Fire Extinguishers' }, { id: 'demo-equipment-court-doors', name: 'Demonstration communal fire doors', natureOfJob: 'Fire Doors' }] },
  { id: 'demo-site-beacon-annex', customerId: 'demo-customer-beacon', name: 'Beacon Annex', address: '5 Example Square, Demo Borough', postcode: 'ZZ2 4DD', equipment: [] },
  { id: 'demo-site-northstar-offices', customerId: 'demo-customer-northstar', name: 'Northstar Offices', address: '7 Sample Crescent, Fictional Green', postcode: 'ZZ3 5EE', equipment: [{ id: 'demo-equipment-offices-devices', name: 'Demonstration office alarm devices', natureOfJob: 'Fire Alarm Devices' }] },
  { id: 'demo-site-northstar-annex', customerId: 'demo-customer-northstar', name: 'Northstar Annex', address: '9 Sample Crescent, Fictional Green', postcode: 'ZZ3 6FF', equipment: [] },
].map(site => Object.freeze({ ...site, equipment: Object.freeze(site.equipment.map(equipment => Object.freeze(equipment))) })));
