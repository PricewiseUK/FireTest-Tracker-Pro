import { describe, expect, it } from 'vitest';
import { createLocalJob, draftFromJob, editLocalJob, emptyLocalJobs, mergedAppointments, updateLocalSchedule } from '../src/scheduling/callouts/localJobModel.js';
import { decodeLocalJobs, encodeLocalJobs, loadLocalJobs, LOCAL_JOBS_KEY, saveLocalJobs } from '../src/scheduling/callouts/localJobStorage.js';
import { initialCalloutDraft } from '../src/scheduling/callouts/calloutValidation.js';
import { DEMO_APPOINTMENTS } from '../src/scheduling/demoSchedule.js';
import { DEMO_CUSTOMERS, DEMO_SITES } from '../src/scheduling/callouts/demoCustomers.js';
import { withAppointmentTimes } from '../src/scheduling/appointmentTime.js';

const draft = () => ({ ...initialCalloutDraft(), siteId: DEMO_SITES[0].id, natureOfJob: 'Fire Alarm Panel', reportedFault: 'Panel bleeping', contactName: 'Session Contact', contactTelephone: '01632 960001', accessInstructions: 'Use demo entrance', priority: 'Urgent', equipmentId: DEMO_SITES[0].equipment[0].id });
const create = () => createLocalJob(emptyLocalJobs(), draft(), 'local-job-12345678');

describe('local demonstration job model and storage', () => {
  it('creates an unassigned Scheduled job with separate stable ID and number and all callout information', () => {
    const { state, job } = create();
    expect(job).toMatchObject({ id: 'local-job-12345678', jobNumber: 'T77689', jobReference: 'T77689', status: 'Scheduled', customerId: DEMO_CUSTOMERS[0].id, siteId: DEMO_SITES[0].id, natureOfJob: 'Fire Alarm Panel', reportedFault: 'Panel bleeping', originalReportedFault: 'Panel bleeping', contactName: 'Session Contact', contactTelephone: '01632 960001', accessInstructions: 'Use demo entrance', priority: 'Urgent', equipment: DEMO_SITES[0].equipment[0], estimatedDurationMinutes: 60 });
    expect(job.startAt).toBeUndefined();
    expect(mergedAppointments(state)).toHaveLength(DEMO_APPOINTMENTS.length);
  });
  it('validates before creation and accepts blank optional details', () => {
    expect(() => createLocalJob(emptyLocalJobs(), initialCalloutDraft(), 'local-job-12345678')).toThrow(/Select an existing/);
    const { job } = createLocalJob(emptyLocalJobs(), { ...initialCalloutDraft(), siteId: DEMO_SITES[1].id, estimatedDuration: '' }, 'local-job-12345678');
    expect(job.estimatedDurationMinutes).toBeNull(); expect(job.equipment).toBeNull();
  });
  it('deduplicates repeat submission tokens and allocates distinct numbers after restoration/deletion', () => {
    const first = create();
    expect(createLocalJob(first.state, draft(), first.job.id).state).toBe(first.state);
    const restored = decodeLocalJobs(encodeLocalJobs(first.state));
    const second = createLocalJob(restored, draft(), 'local-job-87654321');
    expect(second.job.jobNumber).toBe('T77690');
    const deleted = { ...second.state, jobs: [] };
    expect(createLocalJob(decodeLocalJobs(encodeLocalJobs(deleted)), draft(), 'local-job-11223344').job.jobNumber).toBe('T77691');
  });
  it('does not duplicate an existing number even when the in-memory counter lags', () => {
    const first = create();
    const second = createLocalJob({ ...first.state, nextNumber: 77689 }, draft(), 'local-job-87654321');
    expect(second.job.jobNumber).toBe('T77690');
    expect(new Set(second.state.jobs.map(job => job.id)).size).toBe(2);
  });
  it('persists canonical assignment timestamps and fixture overrides separately without changing fixtures', () => {
    const fixturesBefore = JSON.stringify(DEMO_APPOINTMENTS);
    const { state, job } = create();
    const appointments = mergedAppointments(state);
    const assigned = withAppointmentTimes({ ...job, engineerId: 'eng-john', timeZone: 'Europe/London', startAt: '2026-10-12T13:00:00.000Z', endAt: '2026-10-12T14:00:00.000Z' }, {});
    const moved = appointments.map((item, index) => index === 0 ? withAppointmentTimes(item, { startAt: '2026-10-12T17:00:00.000Z', endAt: '2026-10-12T18:00:00.000Z' }) : item);
    const next = updateLocalSchedule(state, [...moved, assigned]);
    const raw = encodeLocalJobs(next);
    const persisted = JSON.parse(raw);
    expect(persisted.overrides).toHaveLength(1);
    for (const field of ['date', 'start', 'end', 'endDate', 'scheduledDurationMinutes']) expect(persisted.jobs[0]).not.toHaveProperty(field);
    const restored = mergedAppointments(decodeLocalJobs(raw));
    expect(restored.find(item => item.id === job.id)).toMatchObject({ start: '14:00', end: '15:00', engineerId: 'eng-john', jobNumber: 'T77689', reportedFault: 'Panel bleeping' });
    expect(restored[0].startAt).toBe(moved[0].startAt);
    expect(JSON.stringify(DEMO_APPOINTMENTS)).toBe(fixturesBefore);
  });
  it('omits contact names/numbers from storage while retaining them in the live job', () => {
    const { state, job } = create();
    const raw = encodeLocalJobs(state);
    expect(raw).not.toContain('Session Contact'); expect(raw).not.toContain('01632');
    const restored = decodeLocalJobs(raw).jobs[0];
    expect(restored.contactName).toBe(''); expect(restored.contactTelephone).toBe('');
    expect(job.contactName).toBe('Session Contact'); expect(job.contactTelephone).toBe('01632 960001');
  });
  it('edits a job in place without changing numbers, scheduling or the original caller report', () => {
    const { state, job } = create();
    const scheduled = { ...job, engineerId: 'eng-john', startAt: '2026-10-12T13:00:00.000Z', endAt: '2026-10-12T14:00:00.000Z' };
    const result = editLocalJob({ ...state, jobs: [scheduled] }, job.id, { ...draftFromJob(job), reportedFault: 'Updated report', priority: 'Emergency' });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ id: job.id, jobNumber: job.jobNumber, startAt: scheduled.startAt, endAt: scheduled.endAt, engineerId: scheduled.engineerId, priority: 'Emergency', originalReportedFault: 'Panel bleeping', reportedFault: 'Updated report' });
    expect(DEMO_CUSTOMERS).toHaveLength(3); expect(DEMO_SITES).toHaveLength(6);
  });
  it('rejects missing/duplicate/unknown schedule records and invalid engineers', () => {
    const { state } = create(); const appointments = mergedAppointments(state);
    expect(() => updateLocalSchedule(state, appointments.slice(1))).toThrow(/missing/);
    expect(() => updateLocalSchedule(state, [...appointments, appointments[0]])).toThrow(/duplicate/);
    expect(() => updateLocalSchedule(state, [...appointments, { ...appointments[0], id: 'unknown' }])).toThrow(/no longer/);
    expect(() => updateLocalSchedule(state, appointments.map((item, index) => index ? item : { ...item, engineerId: 'unknown' }))).toThrow(/engineer/);
  });
  it.each(['{', '{"version":99}', '{"version":1,"nextNumber":-1,"jobs":[],"overrides":[]}'])('does not overwrite invalid storage %s', raw => {
    localStorage.setItem(LOCAL_JOBS_KEY, raw);
    expect(loadLocalJobs(localStorage).error).toContain('Nothing has been overwritten');
    expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBe(raw);
  });
  it('rejects duplicate numbers, forged references, noncanonical intervals and invalid overrides during restoration', () => {
    const good = JSON.parse(encodeLocalJobs(create().state));
    const corruptions = [
      value => value.jobs.push({ ...value.jobs[0], id: 'local-job-87654321' }),
      value => { value.jobs[0].siteId = 'unknown'; },
      value => { value.jobs[0].customerId = 'unknown'; },
      value => { value.jobs[0].status = 'Approved'; },
      value => { value.jobs[0].startAt = 'tomorrow'; },
      value => value.overrides.push({ id: 'unknown' }),
    ];
    for (const corrupt of corruptions) { const value = structuredClone(good); corrupt(value); expect(() => decodeLocalJobs(JSON.stringify(value))).toThrow(); }
  });
  it('commits a full snapshot and refuses stale-tab overwrites or failed writes', () => {
    const { state } = create();
    const raw = saveLocalJobs(localStorage, state, null);
    expect(loadLocalJobs(localStorage).state.jobs[0].jobNumber).toBe('T77689');
    expect(() => saveLocalJobs(localStorage, state, null)).toThrow(/another tab/);
    const storage = { getItem: () => raw, setItem: () => { throw new Error('quota'); } };
    expect(() => saveLocalJobs(storage, state, raw)).toThrow('quota');
    expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBe(raw);
  });
});
