import { appointmentRecord, localToInstant } from '../src/scheduling/appointmentTime.js';

export function appointmentFixture({ date = '2026-10-12', start, end, endDate = date, timeZone = 'Europe/London', ...metadata }) {
  return appointmentRecord({ ...metadata, timeZone, startAt: localToInstant(date, start, timeZone), endAt: localToInstant(endDate, end, timeZone) });
}
