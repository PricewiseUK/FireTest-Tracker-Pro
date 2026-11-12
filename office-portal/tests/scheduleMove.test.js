import { describe, expect, it } from 'vitest';
import { DEMO_APPOINTMENTS, DEMO_ENGINEERS } from '../src/scheduling/demoSchedule.js';
import { applyMove, createMoveProposal, moveFromGeometry, moveTimes } from '../src/scheduling/scheduleMove.js';
import { localToInstant, withAppointmentTimes } from '../src/scheduling/appointmentTime.js';

const job = DEMO_APPOINTMENTS.find(item => item.id === 'job-001');
describe('appointment movement rules', () => {
  it('preserves actual duration, including after a prior resize', () => {
    expect(moveTimes(job, '11:00')).toMatchObject({ start: '11:00', end: '12:00' });
    expect(moveTimes(withAppointmentTimes(job, { endAt: localToInstant(job.date, '10:00', job.timeZone) }), '11:00')).toMatchObject({ start: '11:00', end: '12:30' });
  });
  it('changes only the engineer and times, retaining ID, references and arbitrary metadata', () => {
    const source = [{ ...job, systemReference: 'demo-system', metadata: { custom: true } }, ...DEMO_APPOINTMENTS.filter(item => item.id !== job.id)];
    const original = structuredClone(source);
    const proposal = createMoveProposal(source, job.id, 'eng-kim', '12:00', DEMO_ENGINEERS);
    const result = applyMove(source, proposal, DEMO_ENGINEERS);
    expect(result).toHaveLength(source.length);
    expect(result.filter(item => item.id === job.id)).toHaveLength(1);
    expect(result.find(item => item.id === job.id)).toEqual(withAppointmentTimes(source[0], { engineerId: 'eng-kim', startAt: localToInstant(job.date, '12:00'), endAt: localToInstant(job.date, '13:00') }));
    expect(result[0].metadata).toBe(source[0].metadata);
    expect(result.slice(1)).toEqual(source.slice(1));
    expect(source).toEqual(original);
  });
  it('requires overlap acknowledgement and leaves consecutive bookings conflict-free', () => {
    const proposal = createMoveProposal(DEMO_APPOINTMENTS, job.id, 'eng-john', '09:00', DEMO_ENGINEERS);
    expect(proposal.conflicts.map(item => item.id)).toEqual(['job-003']);
    expect(() => applyMove(DEMO_APPOINTMENTS, proposal, DEMO_ENGINEERS)).toThrow(/acknowledge/);
    expect(applyMove(DEMO_APPOINTMENTS, proposal, DEMO_ENGINEERS, true).find(item => item.id === job.id).engineerId).toBe('eng-john');
    expect(createMoveProposal(DEMO_APPOINTMENTS, job.id, 'eng-john', '12:00', DEMO_ENGINEERS).conflicts).toHaveLength(0);
  });
  it('rejects invalid destinations and unsnapped times while permitting crossing midnight', () => {
    expect(moveTimes(job, '23:30')).toMatchObject({ start: '23:30', end: '00:30', endDate: '2026-10-13' });
    for (const start of ['24:00', '09:07', '']) expect(() => moveTimes(job, start)).toThrow();
    expect(() => createMoveProposal(DEMO_APPOINTMENTS, job.id, 'missing', '12:00', DEMO_ENGINEERS)).toThrow();
    expect(() => createMoveProposal(DEMO_APPOINTMENTS, job.id, job.engineerId, job.start, DEMO_ENGINEERS)).toThrow();
  });
  it('uses current column rectangles with scrolling and snaps against the ruler', () => {
    const columns = [{ engineerId: 'eng-kim', rect: { left: 150, right: 330, top: -42, width: 180 } }];
    const viewport = { left: 40, right: 500, top: 50, bottom: 700, contentTop: 108 };
    // At 1 px/minute, top -42 + 150 minutes + 12 px grab offset = y120.
    expect(moveFromGeometry(job, 200, 143, columns, viewport, 12, 360, 15)).toMatchObject({ engineerId: 'eng-kim', start: '09:00', end: '10:00' });
    expect(moveFromGeometry(job, 600, 143, columns, viewport, 12, 360, 15).error).toBeTruthy();
    expect(moveFromGeometry(job, 200, 60, columns, viewport, 12, 360, 15).error).toBeTruthy();
  });
});
