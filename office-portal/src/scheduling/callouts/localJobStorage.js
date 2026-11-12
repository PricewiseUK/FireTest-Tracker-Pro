import { DEMO_APPOINTMENTS } from '../demoSchedule.js';
import { calloutJobDetails, draftFromJob, emptyLocalJobs, LOCAL_JOB_VERSION, validateAllocation } from './localJobModel.js';

export const LOCAL_JOBS_KEY = 'instafirepilot:local-demo-jobs:v1';
// Contact fields are deliberately session-only. Never persist personal names/numbers.
const savedJob = job => {
  const { contactName: _name, contactTelephone: _phone, date: _date, start: _start, end: _end, endDate: _endDate, scheduledDurationMinutes: _duration, ...record } = job;
  return record;
};
export const encodeLocalJobs = state => JSON.stringify({ ...state, jobs: state.jobs.map(savedJob) });

export function decodeLocalJobs(raw) {
  if (raw === null) return emptyLocalJobs();
  const value = JSON.parse(raw);
  if (value?.version !== LOCAL_JOB_VERSION || !Number.isSafeInteger(value.nextNumber) || value.nextNumber < 77689 || !Array.isArray(value.jobs) || !Array.isArray(value.overrides)) throw new Error('Unsupported or damaged local demonstration storage.');
  const ids = new Set(DEMO_APPOINTMENTS.map(job => job.id));
  const numbers = new Set(DEMO_APPOINTMENTS.map(job => job.jobReference));
  const jobs = value.jobs.map(record => {
    if (!record || typeof record.id !== 'string' || !/^local-job-[a-zA-Z0-9-]{8,}$/.test(record.id) || ids.has(record.id) || !/^T\d+$/.test(record.jobNumber) || numbers.has(record.jobNumber) || record.status !== 'Scheduled' || record.localDemo !== true) throw new Error('Invalid or duplicate saved demonstration job.');
    ids.add(record.id); numbers.add(record.jobNumber);
    const details = calloutJobDetails(draftFromJob({ ...record, contactName: '', contactTelephone: '' }));
    if (details.customerId !== record.customerId || details.siteId !== record.siteId) throw new Error('Invalid saved customer/site reference.');
    const allocation = record.startAt || record.endAt || record.engineerId ? { engineerId: record.engineerId, startAt: record.startAt, endAt: record.endAt, timeZone: record.timeZone } : {};
    if (Object.keys(allocation).length) validateAllocation(allocation);
    if (typeof record.originalReportedFault !== 'string' || record.originalReportedFault.length > 4000) throw new Error('Invalid saved original fault report.');
    return { ...details, originalReportedFault: record.originalReportedFault, id: record.id, jobNumber: record.jobNumber, jobReference: record.jobNumber, status: 'Scheduled', localDemo: true, timeZone: 'Europe/London', ...allocation };
  });
  const overrideIds = new Set();
  const overrides = value.overrides.map(record => {
    if (!record || overrideIds.has(record.id) || !DEMO_APPOINTMENTS.some(job => job.id === record.id)) throw new Error('Invalid saved fixture override.');
    overrideIds.add(record.id); validateAllocation(record);
    return { id: record.id, engineerId: record.engineerId, startAt: record.startAt, endAt: record.endAt, timeZone: record.timeZone };
  });
  const nextNumber = Math.max(value.nextNumber, ...jobs.map(job => Number(job.jobNumber.slice(1)) + 1));
  if (!Number.isSafeInteger(nextNumber)) throw new Error('Invalid saved job number counter.');
  return { version: LOCAL_JOB_VERSION, nextNumber, jobs, overrides };
}

export function loadLocalJobs(storage) {
  try { const raw = storage.getItem(LOCAL_JOBS_KEY); return { state: decodeLocalJobs(raw), raw, error: '' }; }
  catch { return { state: emptyLocalJobs(), raw: null, error: 'Saved demo jobs could not be read. Nothing has been overwritten. Restore valid browser storage before saving changes.' }; }
}

export function saveLocalJobs(storage, state, previousRaw) {
  if (storage.getItem(LOCAL_JOBS_KEY) !== previousRaw) throw new Error('Demo jobs changed in another tab. Refresh before saving to avoid overwriting them.');
  const raw = encodeLocalJobs(state);
  storage.setItem(LOCAL_JOBS_KEY, raw); // Commit the complete snapshot before updating React state.
  return raw;
}
