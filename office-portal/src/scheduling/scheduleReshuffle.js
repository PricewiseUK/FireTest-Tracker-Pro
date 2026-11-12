import { appointmentRecord, instantMs, localParts, overlaps, withAppointmentTimes } from './appointmentTime.js';

export const PROTECTED_RESHUFFLE_STATUSES = Object.freeze(['Completed', 'Awaiting Approval', 'Approved']);

function warningsFor(changes) {
  return changes.flatMap(({ original, proposed }) => {
    const beforeStart = localParts(original.startAt, original.timeZone);
    const beforeEnd = localParts(original.endAt, original.timeZone);
    const start = localParts(proposed.startAt, proposed.timeZone);
    const end = localParts(proposed.endAt, proposed.timeZone);
    const warnings = [];
    if (beforeStart.date !== start.date || beforeEnd.date !== end.date) warnings.push({ jobId: original.id, message: `${original.site || original.id}: calendar date changes to ${start.date}–${end.date}.` });
    if (start.date !== end.date) warnings.push({ jobId: original.id, message: `${original.site || original.id}: crosses midnight (${start.date}–${end.date}).` });
    if (start.date !== end.date || start.time < '07:00' || end.time > '18:00' || end.time < '07:00') warnings.push({ jobId: original.id, message: `${original.site || original.id}: allocation extends outside normal working hours (07:00–18:00).` });
    return warnings;
  });
}

// Only the incoming allocation and intervals shifted by it drive the cascade.
// Existing, unrelated overlaps are left untouched rather than silently repaired.
export function createReshuffleProposal(appointments, request) {
  const ids = new Set();
  for (const job of appointments) {
    if (!job.id || ids.has(job.id)) throw new Error('Appointments must have unique stable IDs.');
    ids.add(job.id);
    appointmentRecord(job); // Validate canonical intervals without mutating the caller.
  }
  const original = appointments.find(job => job.id === request.jobId);
  if (!original) throw new Error('The incoming appointment is no longer available.');
  if (typeof request.engineerId !== 'string' || !request.engineerId) throw new Error('Choose a destination engineer.');
  const incoming = withAppointmentTimes(original, { engineerId: request.engineerId, startAt: request.startAt, endAt: request.endAt });
  const changes = [{ original, proposed: incoming }];
  const reserved = [incoming];
  const targetJobs = appointments.filter(job => job.id !== original.id && job.engineerId === request.engineerId)
    .sort((left, right) => instantMs(left.startAt) - instantMs(right.startAt) || left.id.localeCompare(right.id));

  for (const job of targetJobs) {
    let candidate = job;
    let conflicts = reserved.filter(interval => overlaps(candidate, interval));
    if (!conflicts.length) continue;
    if (PROTECTED_RESHUFFLE_STATUSES.includes(job.status)) {
      return {
        request: { ...request }, base: [...appointments], incoming, changes: [], warnings: [], schedule: null,
        blocked: true, protectedJobs: [job],
        reason: `${job.site || job.id} is ${job.status}. Resolving this cascade would move protected work. Cancel and choose another time.`,
      };
    }
    const durationMs = instantMs(job.endAt) - instantMs(job.startAt);
    while (conflicts.length) {
      const start = Math.max(...conflicts.map(interval => instantMs(interval.endAt)));
      candidate = withAppointmentTimes(job, { startAt: new Date(start).toISOString(), endAt: new Date(start + durationMs).toISOString() });
      conflicts = reserved.filter(interval => overlaps(candidate, interval));
    }
    changes.push({ original: job, proposed: candidate });
    reserved.push(candidate);
  }

  const byId = new Map(changes.map(change => [change.original.id, change.proposed]));
  const schedule = appointments.map(job => byId.get(job.id) || job);
  // Reject, rather than partially apply, any unexpected collision involving a changed record.
  for (const { proposed } of changes) {
    if (schedule.some(job => job.id !== proposed.id && job.engineerId === proposed.engineerId && overlaps(job, proposed))) throw new Error('The complete proposed schedule could not be resolved without overlaps.');
  }
  return { request: { ...request }, base: [...appointments], incoming, changes, warnings: warningsFor(changes), schedule, blocked: false, protectedJobs: [], reason: '' };
}

export function applyReshuffle(appointments, proposal) {
  if (proposal.blocked || !proposal.schedule) throw new Error(proposal.reason || 'This reshuffle cannot be applied.');
  const current = new Map(appointments.map(job => [job.id, job]));
  if (appointments.length !== proposal.base.length || proposal.base.some(job => current.get(job.id) !== job)) throw new Error('The schedule changed after this preview. Calculate a new reshuffle before confirming.');
  // Recalculate from current records so modified preview objects cannot bypass protection.
  const checked = createReshuffleProposal(appointments, proposal.request);
  if (checked.blocked || !checked.schedule) throw new Error(checked.reason);
  const signature = changes => JSON.stringify(changes.map(({ proposed }) => [proposed.id, proposed.engineerId, proposed.startAt, proposed.endAt]));
  if (signature(checked.changes) !== signature(proposal.changes)) throw new Error('The proposed changes no longer match the preview. Calculate a new reshuffle.');
  return checked.schedule;
}
