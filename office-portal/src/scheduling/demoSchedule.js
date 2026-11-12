import { appointmentRecord, localToInstant, occursOnDay, UK_TIME_ZONE } from './appointmentTime.js';
// Deterministic fictional fixtures. Clock fields are input to this one-time local migration only.
export const SCHEDULING_WEEK = Object.freeze([
  { isoDate: '2026-10-12', day: 'Monday', shortDay: 'Mon', dateLabel: '12 Oct' },
  { isoDate: '2026-10-13', day: 'Tuesday', shortDay: 'Tue', dateLabel: '13 Oct' },
  { isoDate: '2026-10-14', day: 'Wednesday', shortDay: 'Wed', dateLabel: '14 Oct' },
  { isoDate: '2026-10-15', day: 'Thursday', shortDay: 'Thu', dateLabel: '15 Oct' },
  { isoDate: '2026-10-16', day: 'Friday', shortDay: 'Fri', dateLabel: '16 Oct' },
  { isoDate: '2026-10-17', day: 'Saturday', shortDay: 'Sat', dateLabel: '17 Oct' },
  { isoDate: '2026-10-18', day: 'Sunday', shortDay: 'Sun', dateLabel: '18 Oct' },
]);

export const DEMO_ENGINEERS = Object.freeze([
  { id: 'eng-david', name: 'David', initials: 'DA', trade: 'Fire systems engineer' },
  { id: 'eng-john', name: 'John', initials: 'JO', trade: 'Service engineer' },
  { id: 'eng-dan', name: 'Dan', initials: 'DN', trade: 'Fire door inspector' },
  { id: 'eng-alan', name: 'Alan', initials: 'AL', trade: 'Alarm engineer' },
  { id: 'eng-kim', name: 'Kim', initials: 'KI', trade: 'Service engineer' },
  { id: 'eng-ollie', name: 'Ollie', initials: 'OL', trade: 'Emergency lighting engineer' },
]);

const APPOINTMENT_FIXTURES = [
  { id: 'job-001', engineerId: 'eng-david', date: '2026-10-12', start: '08:30', end: '09:30', customer: 'Emberfield Estates', site: 'Emberfield House', serviceType: 'Fire alarm service', status: 'In Progress' },
  { id: 'job-002', engineerId: 'eng-david', date: '2026-10-12', start: '11:30', end: '12:30', customer: 'Beacon Court Management', site: 'Beacon Court', serviceType: 'Extinguisher inspection', status: 'Scheduled' },
  { id: 'job-021', engineerId: 'eng-david', date: '2026-10-12', start: '07:15', end: '08:00', customer: 'Northstar Facilities', site: 'Northstar Annex', serviceType: 'Fire blanket service', status: 'Completed' },
  { id: 'job-022', engineerId: 'eng-david', date: '2026-10-12', start: '10:00', end: '11:00', customer: 'Sampleton Property Group', site: 'Sampleton Arcade', serviceType: 'Alarm call-point test', status: 'Approved' },
  { id: 'job-023', engineerId: 'eng-david', date: '2026-10-12', start: '13:00', end: '14:00', customer: 'Example Housing Trust', site: 'Example Lodge', serviceType: 'Emergency lighting test', status: 'Scheduled' },
  { id: 'job-024', engineerId: 'eng-david', date: '2026-10-12', start: '14:15', end: '15:15', customer: 'Beacon Court Management', site: 'Beacon Annex', serviceType: 'Extinguisher service', status: 'In Progress' },
  { id: 'job-025', engineerId: 'eng-david', date: '2026-10-12', start: '15:30', end: '16:30', customer: 'Emberfield Estates', site: 'Emberfield Depot', serviceType: 'Fire alarm inspection', status: 'Awaiting Approval' },
  { id: 'job-026', engineerId: 'eng-david', date: '2026-10-12', start: '17:00', end: '18:00', customer: 'Northstar Facilities', site: 'Northstar House', serviceType: 'Panel battery check', status: 'Scheduled', flag: 'Awaiting parts' },
  { id: 'job-003', engineerId: 'eng-john', date: '2026-10-12', start: '09:00', end: '12:00', customer: 'Northstar Facilities', site: 'Northstar Offices', serviceType: 'Emergency lighting test', status: 'Completed' },
  { id: 'job-030', engineerId: 'eng-john', date: '2026-10-12', start: '06:30', end: '07:15', customer: 'Fictional Borough Council', site: 'Demo Civic Hall', serviceType: 'Fire panel reset', status: 'Scheduled' },
  { id: 'job-031', engineerId: 'eng-john', date: '2026-10-12', start: '11:45', end: '12:00', customer: 'Example Workspace Ltd', site: 'Example Reception', serviceType: 'Call-point check', status: 'In Progress' },
  { id: 'job-004', engineerId: 'eng-dan', date: '2026-10-12', start: '13:00', end: '16:00', customer: 'Example Wharf Management', site: 'Example Wharf', serviceType: 'Fire door survey', status: 'Awaiting Approval' },
  { id: 'job-005', engineerId: 'eng-alan', date: '2026-10-13', start: '08:00', end: '10:00', customer: 'Sampleton Council', site: 'Sampleton Library', serviceType: 'Alarm fault visit', status: 'Scheduled', flag: 'Awaiting parts' },
  { id: 'job-006', engineerId: 'eng-alan', date: '2026-10-13', start: '14:00', end: '16:30', customer: 'Emberfield Manufacturing', site: 'Emberfield Works', serviceType: 'Panel commissioning', status: 'Scheduled' },
  { id: 'job-007', engineerId: 'eng-kim', date: '2026-10-13', start: '09:30', end: '11:30', customer: 'Beacon Retail Group', site: 'Beacon Retail Park', serviceType: 'Extinguisher service', status: 'In Progress' },
  { id: 'job-008', engineerId: 'eng-ollie', date: '2026-10-13', start: '12:30', end: '15:30', customer: 'Example Property Services', site: 'Example Court', serviceType: 'Emergency lighting test', status: 'Completed' },
  { id: 'job-009', engineerId: 'eng-david', date: '2026-10-14', start: '09:00', end: '12:00', customer: 'Northstar Facilities', site: 'Northstar House', serviceType: 'Fire alarm inspection', status: 'Completed' },
  { id: 'job-010', engineerId: 'eng-john', date: '2026-10-14', start: '08:30', end: '10:30', customer: 'Sampleton Catering', site: 'Sampleton Kitchens', serviceType: 'Fire blanket service', status: 'Scheduled' },
  { id: 'job-011', engineerId: 'eng-john', date: '2026-10-14', start: '13:30', end: '16:30', customer: 'Example Commercial Estates', site: 'Example Trading Estate', serviceType: 'Remedial works', status: 'Approved', flag: 'Awaiting parts' },
  { id: 'job-027', engineerId: 'eng-john', date: '2026-10-14', start: '07:30', end: '08:15', customer: 'Beacon Court Management', site: 'Beacon Mews', serviceType: 'Extinguisher inspection', status: 'Completed' },
  { id: 'job-028', engineerId: 'eng-john', date: '2026-10-14', start: '10:45', end: '12:00', customer: 'Emberfield Estates', site: 'Emberfield Annex', serviceType: 'Alarm sounder test', status: 'In Progress' },
  { id: 'job-029', engineerId: 'eng-john', date: '2026-10-14', start: '16:45', end: '17:45', customer: 'Northstar Facilities', site: 'Northstar Warehouse', serviceType: 'Emergency light repair', status: 'Scheduled' },
  { id: 'job-012', engineerId: 'eng-dan', date: '2026-10-14', start: '10:00', end: '14:00', customer: 'Beacon Residential', site: 'Beacon Apartments', serviceType: 'Fire door inspection', status: 'In Progress' },
  { id: 'job-013', engineerId: 'eng-alan', date: '2026-10-15', start: '09:00', end: '11:00', customer: 'Example Health Partnership', site: 'Example Medical Centre', serviceType: 'Alarm maintenance', status: 'In Progress' },
  { id: 'job-014', engineerId: 'eng-kim', date: '2026-10-15', start: '08:00', end: '10:30', customer: 'Emberfield Logistics', site: 'Emberfield Depot', serviceType: 'Extinguisher inspection', status: 'Completed' },
  { id: 'job-015', engineerId: 'eng-kim', date: '2026-10-15', start: '13:00', end: '15:00', customer: 'Northstar Hospitality', site: 'Northstar Cafe', serviceType: 'Fire blanket service', status: 'Scheduled' },
  { id: 'job-016', engineerId: 'eng-ollie', date: '2026-10-15', start: '10:30', end: '14:30', customer: 'Beacon Business Group', site: 'Beacon Business Centre', serviceType: 'Lighting remedials', status: 'Scheduled', flag: 'Awaiting parts' },
  { id: 'job-017', engineerId: 'eng-david', date: '2026-10-16', start: '08:30', end: '12:30', customer: 'Example Education Trust', site: 'Example Academy', serviceType: 'Fire alarm service', status: 'Approved' },
  { id: 'job-018', engineerId: 'eng-dan', date: '2026-10-16', start: '12:00', end: '15:30', customer: 'Emberfield Estates', site: 'Emberfield Court', serviceType: 'Fire door survey', status: 'Scheduled' },
  { id: 'job-019', engineerId: 'eng-ollie', date: '2026-10-17', start: '09:00', end: '12:00', customer: 'Sampleton Arts Trust', site: 'Sampleton Theatre', serviceType: 'Emergency lighting test', status: 'In Progress' },
  { id: 'job-020', engineerId: 'eng-john', date: '2026-10-18', start: '10:00', end: '12:00', customer: 'Beacon Hospitality', site: 'Beacon Hotel', serviceType: 'Extinguisher service', status: 'Scheduled' },
  { id: 'job-032', engineerId: 'eng-alan', date: '2026-10-15', start: '23:00', endDate: '2026-10-16', end: '01:00', customer: 'Fictional Night Facilities', site: 'Demo Night Depot', serviceType: 'Emergency alarm callout', status: 'Scheduled' },
  { id: 'job-033', engineerId: 'eng-kim', date: '2026-10-17', start: '22:30', endDate: '2026-10-18', end: '00:30', customer: 'Example Overnight Services', site: 'Example Night Warehouse', serviceType: 'Emergency lighting repair', status: 'In Progress' },
];

export const DEMO_APPOINTMENTS = Object.freeze(APPOINTMENT_FIXTURES.map((job, index) => Object.freeze(appointmentRecord({
  ...job,
  startAt: localToInstant(job.date, job.start, UK_TIME_ZONE),
  endAt: localToInstant(job.endDate || job.date, job.end, UK_TIME_ZONE),
  timeZone: UK_TIME_ZONE,
  customerReference: `DEMO-C${String(index + 1).padStart(3, '0')}`,
  siteReference: `DEMO-S${String(index + 1).padStart(3, '0')}`,
  jobReference: `DEMO-J${String(index + 1).padStart(3, '0')}`,
  serviceList: Object.freeze([job.serviceType]),
  notes: 'Fictional Phase 2 scheduling demonstration.',
  instructions: 'Report to the fictional site contact on arrival.',
  metadata: Object.freeze({ source: 'local-demo', fixtureVersion: 2 }),
}))));

export const APPOINTMENT_STATUSES = Object.freeze([
  { label: 'Scheduled', className: 'scheduled' },
  { label: 'In Progress', className: 'in-progress' },
  { label: 'Completed', className: 'completed' },
  { label: 'Awaiting Approval', className: 'awaiting-approval' },
  { label: 'Approved', className: 'approved' },
]);

/** @param {ReadonlyArray<ReturnType<typeof appointmentRecord> & {jobNumber?: string}>} appointments */
export function appointmentsForCell(engineerId, isoDate, appointments = DEMO_APPOINTMENTS) {
  return appointments
    .filter(job => job.engineerId === engineerId && occursOnDay(job, isoDate))
    .sort((left, right) => left.startAt.localeCompare(right.startAt) || left.id.localeCompare(right.id));
}
