import { appointmentRecord, instantMs, localToInstant, UK_TIME_ZONE } from '../appointmentTime.js';
import { createMoveProposal, applyMove, moveFromGeometry } from '../scheduleMove.js';
import { DEMO_ENGINEERS } from '../demoSchedule.js';
import { applyReshuffle, createReshuffleProposal } from '../scheduleReshuffle.js';

export function createAssignmentProposal(appointments, job, request) {
  if (appointments.some(item => item.id === job.id) || job.startAt) throw new Error('This job is already assigned.');
  const duration = Number(request.duration);
  if (!Number.isSafeInteger(duration) || duration < 15) throw new Error('Use an allocated duration of at least 15 whole minutes.');
  const startAt = request.startAt || localToInstant(request.date, request.start, UK_TIME_ZONE, request.occurrence || 'reject');
  const endAt = new Date(instantMs(startAt) + duration * 60000).toISOString();
  // A temporary canonical interval lets the existing move/conflict/reshuffle tools
  // handle a new allocation. It is never committed until explicit confirmation.
  const seed = appointmentRecord({ ...job, engineerId: '', startAt, endAt, timeZone: UK_TIME_ZONE });
  const base = [...appointments, seed];
  const proposal = createMoveProposal(base, job.id, request.engineerId, request.start, DEMO_ENGINEERS, request.date, request.occurrence, startAt);
  return { ...proposal, base, sourceJob: job };
}

export function reshuffleAssignment(proposal) {
  return createReshuffleProposal(proposal.base, { jobId: proposal.job.id, engineerId: proposal.engineerId, startAt: proposal.startAt, endAt: proposal.endAt });
}

export function applyAssignment(appointments, unassigned, proposal, acknowledged = false, reshuffle = null) {
  if (!unassigned.some(job => job === proposal.sourceJob) || appointments.length !== proposal.base.length - 1 || appointments.some(job => !proposal.base.includes(job))) throw new Error('The schedule changed. Cancel and review this assignment again.');
  return reshuffle ? applyReshuffle(proposal.base, reshuffle) : applyMove(proposal.base, proposal, DEMO_ENGINEERS, acknowledged);
}

export function unassignedDrop(job, event, scroller, selectedDate, rangeStart, quarterHeight) {
  const seed = appointmentRecord({ ...job, startAt: localToInstant(selectedDate, '00:00'), endAt: new Date(instantMs(localToInstant(selectedDate, '00:00')) + Math.max(15, job.estimatedDurationMinutes || 60) * 60000).toISOString(), timeZone: UK_TIME_ZONE });
  const viewport = scroller.getBoundingClientRect();
  const clock = scroller.querySelector('.daily-corner').getBoundingClientRect();
  const columns = [...scroller.querySelectorAll('.daily-column')].map(column => ({ engineerId: column.dataset.engineer, rect: column.getBoundingClientRect() }));
  return moveFromGeometry(seed, event.clientX, event.clientY, columns, { left: Math.max(viewport.left, clock.right), right: viewport.right, top: viewport.top, bottom: viewport.bottom, contentTop: Math.max(viewport.top, clock.bottom) }, 0, rangeStart, quarterHeight, selectedDate);
}
