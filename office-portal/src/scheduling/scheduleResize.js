import { appointmentDuration, instantMs, localParts, localToInstant, overlaps, withAppointmentTimes } from './appointmentTime.js';

export function resizeEndFromPixels(job, pixelDelta, quarterHeight) {
  const proposed = instantMs(job.endAt) + Math.round(pixelDelta / quarterHeight) * 15 * 60000;
  return new Date(Math.max(instantMs(job.startAt) + 15 * 60000, proposed)).toISOString();
}

export function createResizeProposal(appointments, jobId, end, endDate, occurrence = 'reject') {
  const job = appointments.find(item => item.id === jobId);
  if (!job) throw new Error('The selected appointment is no longer available.');
  const endAt = end.includes('T') ? new Date(instantMs(end)).toISOString() : localToInstant(endDate || localParts(job.endAt, job.timeZone).date, end, job.timeZone, occurrence);
  if (instantMs(endAt) % (15 * 60000)) throw new Error('Choose a finish time in 15-minute increments.');
  if ((instantMs(endAt) - instantMs(job.startAt)) / 60000 < 15) throw new Error('Allocated duration must be at least 15 minutes.');
  const updated = withAppointmentTimes(job, { endAt });
  if (endAt === job.endAt) throw new Error('Choose a different finish time.');
  const conflicts = appointments.filter(item => item.id !== job.id && item.engineerId === job.engineerId && overlaps(updated, item));
  return { job, end: updated.end, endDate: updated.endDate, endAt, conflicts };
}

export function applyResize(appointments, proposal, overlapAcknowledged = false) {
  const checked = createResizeProposal(appointments, proposal.job.id, proposal.endAt);
  if (checked.conflicts.length && !overlapAcknowledged) throw new Error('Confirm the overlapping appointments before applying this change.');
  return appointments.map(job => job.id === checked.job.id ? withAppointmentTimes(job, { endAt: checked.endAt }) : job);
}

export function allocatedDuration(job) {
  const minutes = appointmentDuration(job);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '', remainder ? `${remainder} minutes` : ''].filter(Boolean).join(' ');
}
