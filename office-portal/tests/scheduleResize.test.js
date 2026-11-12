import { describe, expect, it } from 'vitest';
import { DEMO_APPOINTMENTS } from '../src/scheduling/demoSchedule.js';
import { applyResize, createResizeProposal, resizeEndFromPixels } from '../src/scheduling/scheduleResize.js';
import { localParts, localToInstant, withAppointmentTimes } from '../src/scheduling/appointmentTime.js';

describe('local duration resizing', () => {
  const job = DEMO_APPOINTMENTS.find(item => item.id === 'job-001');
  it('snaps upward and downward pointer movement using each density scale', () => {
    expect(localParts(resizeEndFromPixels(job, 23, 15)).time).toBe('10:00');
    expect(localParts(resizeEndFromPixels(job, -21, 15)).time).toBe('09:15');
    expect(localParts(resizeEndFromPixels(job, 40, 20)).time).toBe('10:00');
    expect(localParts(resizeEndFromPixels(job, -9999, 15)).time).toBe('08:45');
    expect(localParts(resizeEndFromPixels(job, 9999, 15)).date > job.date).toBe(true);
  });
  it('changes only end and preserves all references, status and arbitrary metadata', () => {
    const source = [{ ...job, systemReference: 'fictional-system', extra: { keep: true } }];
    const before = structuredClone(source);
    const proposal = createResizeProposal(source, job.id, '09:45');
    expect(applyResize(source, proposal)).toEqual([withAppointmentTimes(source[0], { endAt: localToInstant(job.date, '09:45') })]);
    expect(source).toEqual(before);
    expect(applyResize(source, proposal)[0].extra).toBe(source[0].extra);
  });
  it('rejects invalid, unchanged, negative, too short and non-quarter-hour times', () => {
    for (const end of ['', '25:00', '09:67', '08:00', '08:30', '08:40', '09:31', '09:30']) {
      expect(() => createResizeProposal(DEMO_APPOINTMENTS, job.id, end)).toThrow();
    }
  });
  it('detects conflicts only for the same engineer and date and requires acknowledgement', () => {
    const proposal = createResizeProposal(DEMO_APPOINTMENTS, job.id, '10:30');
    expect(proposal.conflicts.map(item => item.id)).toEqual(['job-022']);
    expect(() => applyResize(DEMO_APPOINTMENTS, proposal)).toThrow(/Confirm/);
    const updated = applyResize(DEMO_APPOINTMENTS, proposal, true);
    expect(updated.find(item => item.id === job.id).end).toBe('10:30');
    expect(updated.filter(item => item.id !== job.id)).toEqual(DEMO_APPOINTMENTS.filter(item => item.id !== job.id));
    expect(createResizeProposal(DEMO_APPOINTMENTS, job.id, '10:00').conflicts).toHaveLength(0);
  });
});
