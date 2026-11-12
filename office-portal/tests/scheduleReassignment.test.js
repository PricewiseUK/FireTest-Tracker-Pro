import { describe, expect, it } from 'vitest';
import { DEMO_APPOINTMENTS, DEMO_ENGINEERS, SCHEDULING_WEEK } from '../src/scheduling/demoSchedule.js';
import { applyReassignment, appointmentsOverlap, createReassignmentProposal } from '../src/scheduling/scheduleReassignment.js';
import { appointmentFixture } from './appointmentFixture.js';

const proposalFor = (jobId, targetEngineerId, targetDate) => createReassignmentProposal({
  appointments: DEMO_APPOINTMENTS,
  jobId,
  targetEngineerId,
  targetDate,
  engineers: DEMO_ENGINEERS,
  week: SCHEDULING_WEEK,
});

describe('local schedule reassignment', () => {
  it('moves the existing appointment exactly once and preserves every other property', () => {
    const original = DEMO_APPOINTMENTS.find(job => job.id === 'job-001');
    const proposal = proposalFor(original.id, 'eng-kim', '2026-10-16');
    const updated = applyReassignment(DEMO_APPOINTMENTS, proposal);
    const moved = updated.find(job => job.id === original.id);

    expect(updated.filter(job => job.id === original.id)).toHaveLength(1);
    expect(moved.engineerId).toBe('eng-kim');
    expect(moved.date).toBe('2026-10-16');
    for (const [key, value] of Object.entries(original)) {
      if (!['engineerId', 'date', 'endDate', 'startAt', 'endAt'].includes(key)) expect(moved[key]).toEqual(value);
    }
    expect(original.engineerId).toBe('eng-david');
    expect(original.date).toBe('2026-10-12');
  });

  it('preserves stable references, service information, duration, notes and unknown metadata', () => {
    const original = DEMO_APPOINTMENTS.find(job => job.id === 'job-001');
    const moved = applyReassignment(DEMO_APPOINTMENTS, proposalFor(original.id, 'eng-ollie', '2026-10-17')).find(job => job.id === original.id);
    expect({
      id: moved.id,
      customerReference: moved.customerReference,
      siteReference: moved.siteReference,
      serviceList: moved.serviceList,
      jobReference: moved.jobReference,
      scheduledDurationMinutes: moved.scheduledDurationMinutes,
      notes: moved.notes,
      instructions: moved.instructions,
      metadata: moved.metadata,
      status: moved.status,
    }).toEqual({
      id: original.id,
      customerReference: original.customerReference,
      siteReference: original.siteReference,
      serviceList: original.serviceList,
      jobReference: original.jobReference,
      scheduledDurationMinutes: original.scheduledDurationMinutes,
      notes: original.notes,
      instructions: original.instructions,
      metadata: original.metadata,
      status: original.status,
    });
  });

  it('detects true overlaps but permits appointments that only touch at an endpoint', () => {
    expect(appointmentsOverlap(appointmentFixture({ start: '08:30', end: '09:30' }), appointmentFixture({ start: '09:00', end: '12:00' }))).toBe(true);
    expect(appointmentsOverlap(appointmentFixture({ start: '08:00', end: '09:00' }), appointmentFixture({ start: '09:00', end: '12:00' }))).toBe(false);
    const proposal = proposalFor('job-001', 'eng-john', '2026-10-12');
    expect(proposal.conflicts.map(job => job.id)).toEqual(['job-003']);
  });

  it('rejects the current cell and unknown engineers, dates and appointments', () => {
    expect(() => proposalFor('job-001', 'eng-david', '2026-10-12')).toThrow(/different engineer or day/);
    expect(() => proposalFor('job-001', 'eng-unknown', '2026-10-12')).toThrow(/valid destination engineer/);
    expect(() => proposalFor('job-001', 'eng-john', '2027-01-01')).toThrow(/displayed week/);
    expect(() => proposalFor('job-unknown', 'eng-john', '2026-10-12')).toThrow(/no longer available/);
  });

  it('does not mutate the local schedule when a proposal is only reviewed or cancelled', () => {
    const before = JSON.stringify(DEMO_APPOINTMENTS);
    const proposal = proposalFor('job-001', 'eng-kim', '2026-10-16');
    expect(proposal.job.id).toBe('job-001');
    expect(JSON.stringify(DEMO_APPOINTMENTS)).toBe(before);
  });
});
