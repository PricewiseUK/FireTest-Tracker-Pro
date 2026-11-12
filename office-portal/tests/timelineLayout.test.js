import { describe, expect, it } from 'vitest';
import { assignOverlapLanes, minutesToTime, positionAppointment, timelineRange, timeToMinutes } from '../src/scheduling/timelineLayout.js';
import { appointmentFixture } from './appointmentFixture.js';

describe('daily timeline layout', () => {
  it('converts clock values and positions appointments at a quarter-hour scale', () => {
    expect(timeToMinutes('11:30')).toBe(690);
    expect(minutesToTime(690)).toBe('11:30');
    expect(positionAppointment(appointmentFixture({ start: '11:30', end: '12:15' }), 420, 15)).toEqual({
      top: 270,
      height: 45,
      startMinutes: 690,
      durationMinutes: 45,
    });
  });

  it('extends the default day so out-of-hours work remains accessible', () => {
    expect(timelineRange([{ start: '06:30', end: '07:15' }, { start: '18:15', end: '18:45' }].map(appointmentFixture))).toEqual({ start: 360, end: 1140 });
  });

  it('assigns overlapping jobs to separate lanes without changing them', () => {
    const jobs = [
      { id: 'long', start: '09:00', end: '12:00' },
      { id: 'overlap', start: '11:45', end: '12:00' },
      { id: 'later', start: '12:00', end: '12:30' },
    ].map(appointmentFixture);
    const placed = assignOverlapLanes(jobs);
    expect(placed.find(item => item.job.id === 'long')).toMatchObject({ lane: 0, laneCount: 2 });
    expect(placed.find(item => item.job.id === 'overlap')).toMatchObject({ lane: 1, laneCount: 2 });
    expect(placed.find(item => item.job.id === 'later')).toMatchObject({ lane: 0, laneCount: 1 });
    expect(jobs).toEqual([
      { id: 'long', start: '09:00', end: '12:00' },
      { id: 'overlap', start: '11:45', end: '12:00' },
      { id: 'later', start: '12:00', end: '12:30' },
    ].map(appointmentFixture));
  });
});
