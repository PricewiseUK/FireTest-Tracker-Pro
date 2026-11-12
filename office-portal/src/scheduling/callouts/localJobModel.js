import { appointmentRecord, UK_TIME_ZONE } from '../appointmentTime.js';
import { DEMO_APPOINTMENTS, DEMO_ENGINEERS } from '../demoSchedule.js';
import { createCalloutPreview, initialCalloutDraft } from './calloutValidation.js';

export const LOCAL_JOB_VERSION = 1;
export const emptyLocalJobs = () => ({ version: LOCAL_JOB_VERSION, nextNumber: 77689, jobs: [], overrides: [] });
export const schedulingFields = job => ({ engineerId: job.engineerId, startAt: job.startAt, endAt: job.endAt, timeZone: UK_TIME_ZONE });

export function draftFromJob(job) {
  return { ...initialCalloutDraft(), siteId: job.siteId, natureOfJob: job.natureOfJob, reportedFault: job.reportedFault, contactName: job.contactName || '', contactTelephone: job.contactTelephone || '', accessInstructions: job.accessInstructions, priority: job.priority, equipmentId: job.equipment?.id || '', estimatedDuration: job.estimatedDurationMinutes === null ? '' : String(job.estimatedDurationMinutes) };
}

export function calloutJobDetails(draft) {
  const { preview, errors } = createCalloutPreview(draft);
  if (!preview) throw new Error(Object.values(errors).join(' '));
  return { ...preview, customer: preview.customerName, site: preview.siteName, serviceType: preview.natureOfJob };
}

export function createLocalJob(state, draft, id) {
  const previous = state.jobs.find(job => job.id === id);
  if (previous) return { state, job: previous }; // Idempotent form submission token.
  if (!/^local-job-[a-zA-Z0-9-]{8,}$/.test(id)) throw new Error('Unable to generate a unique local job ID.');
  const used = new Set([...DEMO_APPOINTMENTS, ...state.jobs].map(job => job.jobNumber || job.jobReference));
  let nextNumber = state.nextNumber;
  while (used.has(`T${nextNumber}`)) nextNumber++;
  if (!Number.isSafeInteger(nextNumber + 1)) throw new Error('The demonstration job number counter is exhausted.');
  const details = calloutJobDetails(draft);
  const job = { ...details, originalReportedFault: details.reportedFault, id, jobNumber: `T${nextNumber}`, jobReference: `T${nextNumber}`, status: 'Scheduled', timeZone: UK_TIME_ZONE, localDemo: true };
  return { job, state: { ...state, nextNumber: nextNumber + 1, jobs: [...state.jobs, job] } };
}

export function editLocalJob(state, id, draft) {
  if (!state.jobs.some(job => job.id === id)) throw new Error('This local job is no longer available.');
  const details = calloutJobDetails(draft);
  return { ...state, jobs: state.jobs.map(job => job.id === id ? { ...job, ...details } : job) };
}

export function mergedAppointments(state) {
  const overrides = new Map(state.overrides.map(job => [job.id, job]));
  return [...DEMO_APPOINTMENTS.map(job => appointmentRecord({ ...job, ...overrides.get(job.id) })), ...state.jobs.filter(job => job.startAt).map(job => appointmentRecord(job))];
}

export function updateLocalSchedule(state, appointments) {
  const ids = new Set(appointments.map(job => job.id));
  if (ids.size !== appointments.length || DEMO_APPOINTMENTS.some(job => !ids.has(job.id)) || state.jobs.some(job => job.startAt && !ids.has(job.id))) throw new Error('The schedule contains duplicate or missing appointments.');
  const known = new Set([...DEMO_APPOINTMENTS, ...state.jobs].map(job => job.id));
  for (const job of appointments) {
    if (!known.has(job.id)) throw new Error('This job is no longer available.');
    validateAllocation(job);
  }
  const byId = new Map(appointments.map(job => [job.id, job]));
  return { ...state,
    jobs: state.jobs.map(job => byId.has(job.id) ? { ...job, ...schedulingFields(byId.get(job.id)) } : job),
    overrides: DEMO_APPOINTMENTS.flatMap(original => {
      const updated = byId.get(original.id);
      return ['engineerId', 'startAt', 'endAt'].some(field => updated[field] !== original[field]) ? [{ id: original.id, ...schedulingFields(updated) }] : [];
    }),
  };
}

export function validateAllocation(job) {
  if (job.timeZone !== UK_TIME_ZONE || !DEMO_ENGINEERS.some(engineer => engineer.id === job.engineerId)) throw new Error('Invalid saved engineer or timezone.');
  appointmentRecord(job);
}
