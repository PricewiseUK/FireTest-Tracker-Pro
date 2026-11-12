import { appointmentDuration, dayBounds, instantMs, localParts, localToInstant, overlaps, withAppointmentTimes } from './appointmentTime.js';

export function moveTimes(job, start, date = localParts(job.startAt, job.timeZone).date, occurrence = 'reject') {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || Number(start.slice(3)) % 15) throw new Error('Choose a start time in 15-minute increments.');
  const startAt = localToInstant(date, start, job.timeZone, occurrence);
  const duration = appointmentDuration(job);
  if (duration < 15) throw new Error('Allocated duration must be at least 15 minutes.');
  return withAppointmentTimes(job, { startAt, endAt: new Date(instantMs(startAt) + duration * 60000).toISOString() });
}

export function createMoveProposal(appointments, jobId, engineerId, start, engineers, date, occurrence = 'reject', exactStartAt) {
  const job = appointments.find(item => item.id === jobId);
  if (!job) throw new Error('The selected appointment is no longer available.');
  if (!engineers.some(engineer => engineer.id === engineerId)) throw new Error('Choose a valid destination engineer.');
  if (appointmentDuration(job) < 15) throw new Error('Allocated duration must be at least 15 minutes.');
  if (exactStartAt && instantMs(exactStartAt) % (15 * 60000)) throw new Error('Choose a start time in 15-minute increments.');
  const times = exactStartAt ? withAppointmentTimes(job, { startAt: exactStartAt, endAt: new Date(instantMs(exactStartAt) + appointmentDuration(job) * 60000).toISOString() }) : moveTimes(job, start, date, occurrence);
  if (job.engineerId === engineerId && job.startAt === times.startAt) throw new Error('Choose a different engineer or start time.');
  const updated = withAppointmentTimes(times, { engineerId });
  const conflicts = appointments.filter(item => item.id !== jobId && item.engineerId === engineerId && overlaps(updated, item));
  return { job, engineerId, start: times.start, end: times.end, date: times.date, endDate: times.endDate, startAt: times.startAt, endAt: times.endAt, conflicts };
}

export function applyMove(appointments, proposal, engineers, acknowledged = false) {
  const checked = createMoveProposal(appointments, proposal.job.id, proposal.engineerId, proposal.start, engineers, proposal.date, 'reject', proposal.startAt);
  if (checked.conflicts.length && !acknowledged) throw new Error('Explicitly acknowledge the overlapping appointments.');
  return appointments.map(job => job.id === checked.job.id ? withAppointmentTimes(job, { engineerId: checked.engineerId, startAt: checked.startAt, endAt: checked.endAt }) : job);
}

export function moveFromGeometry(job, x, y, columns, viewport, grabOffset, rangeStart, quarterHeight, selectedDate = job.date) {
  if (x < viewport.left || x >= viewport.right || y < (viewport.contentTop ?? viewport.top) || y >= viewport.bottom) return { error: 'Drop inside a visible engineer column below its header.' };
  const column = columns.find(item => item.rect.width > 0 && x >= item.rect.left && x < item.rect.right);
  if (!column) return { error: 'Drop inside an engineer column.' };
  const startMinutes = Math.round((rangeStart + (y - column.rect.top - grabOffset) * 15 / quarterHeight) / 15) * 15;
  const bounds = dayBounds(selectedDate, job.timeZone);
  if (startMinutes < rangeStart || startMinutes < 0 || startMinutes >= bounds.minutes) return { error: 'Choose a start inside this date, or use Move/Reassign Appointment.' };
  const startAt = new Date(bounds.start + startMinutes * 60000).toISOString();
  const endAt = new Date(instantMs(startAt) + appointmentDuration(job) * 60000).toISOString();
  const times = withAppointmentTimes(job, { startAt, endAt });
  return { engineerId: column.engineerId, startAt, endAt, start: times.start, end: times.end, date: times.date, endDate: times.endDate, timeZone: job.timeZone, error: '' };
}
