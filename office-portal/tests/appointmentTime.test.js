import { describe, expect, it } from 'vitest';
import { addDays, allocationLabel, appointmentDuration, appointmentRecord, axisLabel, dayBounds, daySegment, instantMs, localParts, localToInstant, occursOnDay, overlaps, withAppointmentTimes } from '../src/scheduling/appointmentTime.js';
import { applyMove, createMoveProposal, moveFromGeometry, moveTimes } from '../src/scheduling/scheduleMove.js';
import { applyResize, createResizeProposal, resizeEndFromPixels } from '../src/scheduling/scheduleResize.js';
import { createReassignmentProposal, applyReassignment } from '../src/scheduling/scheduleReassignment.js';
import { positionAppointment, timelineRange } from '../src/scheduling/timelineLayout.js';
import { DEMO_APPOINTMENTS, DEMO_ENGINEERS, SCHEDULING_WEEK } from '../src/scheduling/demoSchedule.js';
import { appointmentFixture } from './appointmentFixture.js';

const night = DEMO_APPOINTMENTS.find(job => job.id === 'job-032');
describe('canonical timezone-aware scheduling', () => {
  it('migrates every fixture to UTC instants and retains unique original identities', () => {
    expect(DEMO_APPOINTMENTS).toHaveLength(33);
    expect(new Set(DEMO_APPOINTMENTS.map(job => job.id)).size).toBe(33);
    for (const job of DEMO_APPOINTMENTS) {
      expect(job.timeZone).toBe('Europe/London');
      expect(job.startAt).toMatch(/Z$/);
      expect(appointmentDuration(job)).toBeGreaterThan(0);
      expect(Object.getOwnPropertyDescriptor(job, 'date').get).toBeTypeOf('function');
    }
    const migrated = DEMO_APPOINTMENTS.find(job => job.id === 'job-001');
    expect(migrated.startAt).toBe('2026-10-12T07:30:00.000Z');
    expect(migrated.start).toBe('08:30');
    expect(migrated.customerReference).toBe('DEMO-C001');
  });
  it('calculates overnight duration and clips both dates without creating extra jobs', () => {
    expect(appointmentDuration(night)).toBe(120);
    expect(occursOnDay(night, '2026-10-15')).toBe(true);
    expect(occursOnDay(night, '2026-10-16')).toBe(true);
    expect(daySegment(night, '2026-10-15')).toEqual({ start: 1380, end: 1440, continuesBefore: false, continuesAfter: true });
    expect(daySegment(night, '2026-10-16')).toEqual({ start: 0, end: 60, continuesBefore: true, continuesAfter: false });
    expect(positionAppointment(night, 0, 15, '2026-10-16').height).toBe(60);
    expect(allocationLabel(night)).toContain('2026-10-16 01:00');
  });
  it('treats midnight endings as half-open boundaries', () => {
    const job = withAppointmentTimes(night, { endAt: localToInstant('2026-10-16', '00:00') });
    expect(occursOnDay(job, '2026-10-16')).toBe(false);
  });
  it('moves across midnight preserving duration and all business metadata', () => {
    const source = [appointmentRecord({ ...night, systemReference: 'existing-test-system', extra: { preserved: true } })];
    const before = structuredClone(source);
    const proposal = createMoveProposal(source, night.id, 'eng-kim', '23:30', DEMO_ENGINEERS, '2026-10-17');
    const moved = applyMove(source, proposal, DEMO_ENGINEERS)[0];
    expect(moved).toMatchObject({ id: night.id, date: '2026-10-17', endDate: '2026-10-18', start: '23:30', end: '01:30', engineerId: 'eng-kim' });
    expect(appointmentDuration(moved)).toBe(120);
    for (const key of ['customerReference', 'siteReference', 'systemReference', 'serviceList', 'notes', 'instructions', 'status', 'metadata', 'extra']) expect(moved[key]).toEqual(source[0][key]);
    expect(source).toEqual(before);
    expect(applyMove(source, proposal, DEMO_ENGINEERS)).toHaveLength(1);
  });
  it('reassigns an overnight job to a different date without changing its elapsed duration', () => {
    const proposal = createReassignmentProposal({ appointments: [night], jobId: night.id, targetEngineerId: 'eng-john', targetDate: '2026-10-17', engineers: DEMO_ENGINEERS, week: SCHEDULING_WEEK });
    const moved = applyReassignment([night], proposal)[0];
    expect(moved).toMatchObject({ date: '2026-10-17', endDate: '2026-10-18', start: '23:00', end: '01:00' });
    expect(appointmentDuration(moved)).toBe(120);
  });
  it('resizes into the next date by exact editing and dragging', () => {
    const proposal = createResizeProposal([night], night.id, '02:00', '2026-10-16');
    const resized = applyResize([night], proposal)[0];
    expect(resized.startAt).toBe(night.startAt);
    expect(appointmentDuration(resized)).toBe(180);
    expect(resizeEndFromPixels(night, 60, 15)).toBe(resized.endAt);
    expect(resizeEndFromPixels(night, 80, 20)).toBe(resized.endAt);
    const sameDay = DEMO_APPOINTMENTS.find(job => job.id === 'job-001');
    expect(createResizeProposal([sameDay], sameDay.id, '01:00', '2026-10-13').endDate).toBe('2026-10-13');
  });
  it('detects conflicts spanning adjacent dates and leaves touching endpoints free', () => {
    const next = appointmentFixture({ id: 'next', engineerId: night.engineerId, date: '2026-10-16', start: '00:30', end: '02:00' });
    expect(overlaps(night, next)).toBe(true);
    expect(createResizeProposal([night, next], night.id, '01:30', '2026-10-16').conflicts.map(job => job.id)).toEqual(['next']);
    const proposal = createMoveProposal([night, next], night.id, night.engineerId, '23:30', DEMO_ENGINEERS);
    expect(proposal.conflicts.map(job => job.id)).toEqual(['next']);
    expect(() => applyMove([night, next], proposal, DEMO_ENGINEERS)).toThrow(/acknowledge/);
    expect(overlaps(night, withAppointmentTimes(next, { startAt: night.endAt }))).toBe(false);
  });
  it('converts GMT and BST explicitly regardless of the host timezone', () => {
    expect(localToInstant('2026-01-12', '09:00')).toBe('2026-01-12T09:00:00.000Z');
    expect(localToInstant('2026-07-12', '09:00')).toBe('2026-07-12T08:00:00.000Z');
    expect(localParts('2026-07-12T23:30:00.000Z')).toMatchObject({ date: '2026-07-13', time: '00:30' });
  });
  it('handles spring forward as a 23-hour elapsed day and rejects nonexistent times', () => {
    expect(dayBounds('2026-03-29').minutes).toBe(1380);
    expect(() => localToInstant('2026-03-29', '01:30')).toThrow(/does not exist/);
    expect(() => localToInstant('2026-03-29', '01:30', 'Europe/London', 'later')).toThrow(/does not exist/);
    const spring = appointmentFixture({ date: '2026-03-29', start: '00:30', end: '02:30' });
    expect(appointmentDuration(spring)).toBe(60);
    expect(axisLabel('2026-03-29', 120)).toBe('03:00 BST');
    expect(timelineRange([spring], '2026-03-29', true)).toEqual({ start: 0, end: 1380 });
  });
  it('handles autumn as a 25-hour day and requires an explicit repeated-hour choice', () => {
    expect(dayBounds('2026-10-25').minutes).toBe(1500);
    expect(() => localToInstant('2026-10-25', '01:30')).toThrow(/ambiguous/);
    expect(localToInstant('2026-10-25', '01:30', 'Europe/London', 'earlier')).toBe('2026-10-25T00:30:00.000Z');
    expect(localToInstant('2026-10-25', '01:30', 'Europe/London', 'later')).toBe('2026-10-25T01:30:00.000Z');
    const autumn = appointmentRecord({ startAt: '2026-10-25T00:30:00Z', endAt: '2026-10-25T01:30:00Z', timeZone: 'Europe/London' });
    expect(appointmentDuration(autumn)).toBe(60);
    expect(allocationLabel(autumn)).toBe('01:30 BST–01:30 GMT');
    expect(axisLabel('2026-10-25', 60)).toBe('01:00 BST');
    expect(axisLabel('2026-10-25', 120)).toBe('01:00 GMT');
    expect(positionAppointment(autumn, 0, 15, '2026-10-25').height).toBe(60);
    expect(timelineRange([autumn], '2026-10-25', true).end).toBe(1500);
  });
  it('preserves elapsed duration when moving across a DST transition', () => {
    const moved = moveTimes(night, '00:30', '2026-03-29');
    expect(moved.end).toBe('03:30');
    expect(appointmentDuration(moved)).toBe(120);
    expect(() => moveTimes(night, '01:30', '2026-10-25')).toThrow(/ambiguous/);
    expect(moveTimes(night, '01:30', '2026-10-25', 'later').startAt).toBe('2026-10-25T01:30:00.000Z');
  });
  it('uses an elapsed ruler to drag into either occurrence of a repeated hour', () => {
    const viewport = { left: 0, right: 300, top: 0, bottom: 1000, contentTop: 0 };
    const columns = [{ engineerId: 'eng-kim', rect: { width: 100, left: 0, right: 100, top: 0 } }];
    const first = moveFromGeometry(night, 50, 90, columns, viewport, 0, 0, 15, '2026-10-25');
    const second = moveFromGeometry(night, 50, 150, columns, viewport, 0, 0, 15, '2026-10-25');
    expect(first.start).toBe('01:30'); expect(second.start).toBe('01:30');
    expect(instantMs(second.startAt) - instantMs(first.startAt)).toBe(3600000);
  });
  it('rejects invalid dates, timestamps, zones and non-positive allocations', () => {
    for (const stamp of ['2026-02-30T00:00:00Z', '2026-10-15T25:00:00Z', '2026-10-15T12:00:00', 'invalid']) expect(() => instantMs(stamp)).toThrow();
    expect(() => localToInstant('2026-02-30', '12:00')).toThrow();
    expect(() => localToInstant('2026-10-15', '12:00', 'Invalid/Zone')).toThrow();
    expect(() => withAppointmentTimes(night, { endAt: night.startAt })).toThrow();
    expect(() => withAppointmentTimes(night, { endAt: '2026-10-01T00:00:00Z' })).toThrow();
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('never accepts conflicting legacy clock fields as a separate source of truth', () => {
    const rebuilt = appointmentRecord({ ...night, date: '1999-01-01', start: '12:00', end: '12:00', endDate: '1999-01-01', scheduledDurationMinutes: -1 });
    expect(rebuilt.date).toBe('2026-10-15'); expect(rebuilt.start).toBe('23:00');
    expect(rebuilt.endDate).toBe('2026-10-16'); expect(rebuilt.scheduledDurationMinutes).toBe(120);
  });
});
