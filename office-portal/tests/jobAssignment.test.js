import { describe, expect, it } from 'vitest';
import { applyAssignment, createAssignmentProposal, reshuffleAssignment, unassignedDrop } from '../src/scheduling/callouts/jobAssignment.js';
import { createLocalJob, emptyLocalJobs } from '../src/scheduling/callouts/localJobModel.js';
import { initialCalloutDraft } from '../src/scheduling/callouts/calloutValidation.js';
import { appointmentDuration, overlaps } from '../src/scheduling/appointmentTime.js';
import { appointmentFixture } from './appointmentFixture.js';

const job = () => createLocalJob(emptyLocalJobs(), { ...initialCalloutDraft(), siteId: 'demo-site-emberfield-depot', reportedFault: 'Original fault', priority: 'Urgent' }, 'local-job-12345678').job;
const existing = (id, start, end, status = 'Scheduled', extra = {}) => appointmentFixture({ id, engineerId: 'eng-john', start, end, status, site: id, ...extra });
const request = (extra = {}) => ({ engineerId: 'eng-john', date: '2026-10-12', start: '14:00', duration: 60, occurrence: 'reject', ...extra });

describe('new-job assignment through existing scheduling utilities', () => {
  it('assigns a canonical interval to the selected engineer and preserves callout metadata', () => {
    const source = job(); const proposal = createAssignmentProposal([], source, request());
    const schedule = applyAssignment([], [source], proposal);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({ id: source.id, jobNumber: source.jobNumber, engineerId: 'eng-john', date: '2026-10-12', start: '14:00', end: '15:00', startAt: '2026-10-12T13:00:00.000Z', reportedFault: 'Original fault', originalReportedFault: 'Original fault', priority: 'Urgent', status: 'Scheduled' });
    expect(source.startAt).toBeUndefined(); // Review/cancel never mutates the job.
    expect(() => applyAssignment(schedule, [], proposal)).toThrow(/changed/);
  });
  it('detects overlaps using the move utility and requires explicit acknowledgement', () => {
    const source = job(); const appointments = [existing('conflict', '14:30', '15:30')];
    const proposal = createAssignmentProposal(appointments, source, request());
    expect(proposal.conflicts).toEqual(appointments);
    expect(() => applyAssignment(appointments, [source], proposal)).toThrow(/acknowledge/);
    expect(applyAssignment(appointments, [source], proposal, true)).toHaveLength(2);
  });
  it('reshuffles a cascade atomically and leaves a later gap/other engineers untouched', () => {
    const source = job(); const appointments = [existing('first', '14:15', '15:15'), existing('second', '15:30', '16:30'), existing('later', '18:00', '19:00'), existing('other', '14:00', '15:00', 'Scheduled', { engineerId: 'eng-kim' })];
    const proposal = createAssignmentProposal(appointments, source, request());
    const reshuffle = reshuffleAssignment(proposal);
    expect(source.startAt).toBeUndefined();
    const result = applyAssignment(appointments, [source], proposal, false, reshuffle);
    expect(result.find(item => item.id === 'first').start).toBe('15:00');
    expect(result.find(item => item.id === 'second').start).toBe('16:00');
    expect(result.find(item => item.id === 'later')).toBe(appointments[2]);
    expect(result.find(item => item.id === 'other')).toBe(appointments[3]);
    expect(new Set(result.map(item => item.id)).size).toBe(5);
    const incoming = result.find(item => item.id === source.id);
    expect(result.filter(item => item.id !== source.id && item.engineerId === incoming.engineerId && overlaps(incoming, item))).toHaveLength(0);
  });
  it.each(['Completed', 'Awaiting Approval', 'Approved'])('blocks a cascade into protected %s without assigning anything', status => {
    const source = job(); const appointments = [existing('first', '14:15', '15:15'), existing('protected', '15:30', '16:30', status)];
    const snapshot = JSON.stringify(appointments);
    const proposal = createAssignmentProposal(appointments, source, request());
    const reshuffle = reshuffleAssignment(proposal);
    expect(reshuffle.blocked).toBe(true);
    expect(() => applyAssignment(appointments, [source], proposal, false, reshuffle)).toThrow(/protected/);
    expect(JSON.stringify(appointments)).toBe(snapshot); expect(source.startAt).toBeUndefined();
  });
  it('rejects stale previews and cancelled/deleted/already-assigned jobs', () => {
    const source = job(); const proposal = createAssignmentProposal([], source, request());
    expect(() => applyAssignment([existing('new', '12:00', '13:00')], [source], proposal)).toThrow(/changed/);
    expect(() => applyAssignment([], [], proposal)).toThrow(/changed/);
    expect(() => createAssignmentProposal([{ ...source, startAt: proposal.startAt }], source, request())).toThrow(/already assigned/);
  });
  it('supports overnight allocation and a cascade into the following date', () => {
    const source = job(); const appointments = [existing('night', '23:45', '00:45', 'Scheduled', { endDate: '2026-10-13' })];
    const proposal = createAssignmentProposal(appointments, source, request({ start: '23:30', duration: 120 }));
    expect(proposal.endDate).toBe('2026-10-13'); expect(proposal.end).toBe('01:30');
    const reshuffle = reshuffleAssignment(proposal);
    const result = applyAssignment(appointments, [source], proposal, false, reshuffle);
    expect(result[0]).toMatchObject({ date: '2026-10-13', start: '01:30', end: '02:30' });
    expect(reshuffle.warnings.some(item => item.message.includes('midnight'))).toBe(true);
  });
  it('handles BST/GMT gaps and explicit repeated-hour occurrences with elapsed duration', () => {
    const source = job();
    expect(() => createAssignmentProposal([], source, request({ date: '2026-03-29', start: '01:30' }))).toThrow(/does not exist/);
    expect(() => createAssignmentProposal([], source, request({ date: '2026-10-25', start: '01:30' }))).toThrow(/ambiguous/);
    const early = createAssignmentProposal([], source, request({ date: '2026-10-25', start: '01:30', occurrence: 'earlier' }));
    const later = createAssignmentProposal([], source, request({ date: '2026-10-25', start: '01:30', occurrence: 'later' }));
    expect(Date.parse(later.startAt) - Date.parse(early.startAt)).toBe(3600000);
    expect(appointmentDuration(early)).toBe(60); expect(appointmentDuration(later)).toBe(60);
  });
  it.each([{ engineerId: 'unknown' }, { start: '14:07' }, { duration: 0 }, { duration: 14 }, { duration: 'invalid' }, { date: '2026-02-30' }])('validates assignment fields %j', changes => {
    expect(() => createAssignmentProposal([], job(), request(changes))).toThrow();
  });
  it('reuses scroll-aware 15-minute drop geometry, including the full-day final quarter', () => {
    const column = document.createElement('div'); column.className = 'daily-column'; column.dataset.engineer = 'eng-john';
    column.getBoundingClientRect = () => ({ left: 100, right: 300, width: 200, top: 100 });
    const header = document.createElement('div'); header.className = 'daily-corner'; header.getBoundingClientRect = () => ({ bottom: 80, right: 100 });
    const scroller = document.createElement('div'); scroller.append(header, column); scroller.getBoundingClientRect = () => ({ left: 30, right: 300, top: 20, bottom: 1600 });
    expect(unassignedDrop(job(), { clientX: 150, clientY: 125 }, scroller, '2026-10-12', 7 * 60, 15).start).toBe('07:30');
    expect(unassignedDrop(job(), { clientX: 150, clientY: 60 }, scroller, '2026-10-12', 0, 15).error).toBeTruthy();
    const last = unassignedDrop(job(), { clientX: 150, clientY: 1525 }, scroller, '2026-10-12', 0, 15);
    expect(last.start).toBe('23:45'); expect(last.endDate).toBe('2026-10-13');
    column.getBoundingClientRect = () => ({ left: 100, right: 300, width: 200, top: -200 });
    expect(unassignedDrop(job(), { clientX: 150, clientY: 125 }, scroller, '2026-10-12', 0, 15).start).toBe('05:30');
    column.getBoundingClientRect = () => ({ left: 20, right: 220, width: 200, top: 100 });
    expect(unassignedDrop(job(), { clientX: 60, clientY: 125 }, scroller, '2026-10-12', 0, 15).error).toBeTruthy();
  });
});
