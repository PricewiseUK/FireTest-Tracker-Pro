import { overlaps, withAppointmentTimes } from './appointmentTime.js';
import { moveTimes } from './scheduleMove.js';

export const appointmentsOverlap = overlaps;

export function createReassignmentProposal({ appointments, jobId, targetEngineerId, targetDate, engineers, week }) {
  const job = appointments.find(item => item.id === jobId);
  if (!job) throw new Error('The selected appointment is no longer available.');
  if (!engineers.some(engineer => engineer.id === targetEngineerId)) throw new Error('Choose a valid destination engineer.');
  if (!week.some(day => day.isoDate === targetDate)) throw new Error('Choose a date in the displayed week.');
  if (job.engineerId === targetEngineerId && job.date === targetDate) throw new Error('Choose a different engineer or day.');
  const updated = withAppointmentTimes(targetDate === job.date ? job : moveTimes(job, job.start, targetDate), { engineerId: targetEngineerId });
  const conflicts = appointments.filter(item => item.id !== job.id && item.engineerId === targetEngineerId && overlaps(updated, item));
  return { job, targetEngineerId, targetDate, startAt: updated.startAt, endAt: updated.endAt, conflicts };
}

export function applyReassignment(appointments, proposal) {
  if (!appointments.some(job => job.id === proposal.job.id)) throw new Error('The selected appointment is no longer available.');
  return appointments.map(job => job.id === proposal.job.id ? withAppointmentTimes(job, { engineerId: proposal.targetEngineerId, startAt: proposal.startAt, endAt: proposal.endAt }) : job);
}
