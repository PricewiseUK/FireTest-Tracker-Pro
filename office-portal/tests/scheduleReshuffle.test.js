import { describe, expect, it } from 'vitest';
import { createReshuffleProposal, applyReshuffle } from '../src/scheduling/scheduleReshuffle.js';
import { appointmentDuration, appointmentRecord, instantMs, localToInstant, overlaps } from '../src/scheduling/appointmentTime.js';
import { createMoveProposal } from '../src/scheduling/scheduleMove.js';
import { createResizeProposal } from '../src/scheduling/scheduleResize.js';
import { appointmentFixture } from './appointmentFixture.js';

const job = (id, start, end, extra = {}) => appointmentFixture({ id, start, end, engineerId: 'david', status: 'Scheduled', site: id, ...extra });
const incoming = () => job('incoming', '07:00', '08:00', { engineerId: 'john' });
const request = (start = '09:00', end = '10:00') => ({ jobId: 'incoming', engineerId: 'david', startAt: localToInstant('2026-10-12', start), endAt: localToInstant('2026-10-12', end) });
const compact = proposal => proposal.changes.map(({ proposed }) => [proposed.id, proposed.start, proposed.end]);
const noNewOverlap = (schedule, changedIds) => {
  for (const changed of schedule.filter(item => changedIds.includes(item.id))) {
    expect(schedule.filter(other => other.id !== changed.id && other.engineerId === changed.engineerId && overlaps(changed, other))).toHaveLength(0);
  }
};

describe('pure automatic schedule reshuffling', () => {
  it('pushes a single conflicting appointment after the fixed incoming allocation', () => {
    const source = [incoming(), job('one', '09:15', '10:15')];
    const proposal = createReshuffleProposal(source, request());
    expect(compact(proposal)).toEqual([['incoming', '09:00', '10:00'], ['one', '10:00', '11:00']]);
    expect(source[1].start).toBe('09:15');
    expect(proposal.incoming.engineerId).toBe('david');
    noNewOverlap(applyReshuffle(source, proposal), ['incoming', 'one']);
  });
  it('cascades multiple bookings and reuses the next available gap', () => {
    const source = [incoming(), job('one', '09:00', '09:30'), job('two', '10:15', '10:45'), job('later', '11:30', '12:00')];
    const proposal = createReshuffleProposal(source, request());
    expect(compact(proposal)).toEqual([['incoming', '09:00', '10:00'], ['one', '10:00', '10:30'], ['two', '10:30', '11:00']]);
    expect(proposal.schedule.find(item => item.id === 'later')).toBe(source[3]);
    noNewOverlap(proposal.schedule, proposal.changes.map(item => item.original.id));
  });
  it('leaves unrelated engineers and nonconflicting bookings unchanged', () => {
    const before = job('before', '06:00', '07:00');
    const later = job('later', '15:00', '16:00');
    const other = job('other', '09:00', '10:00', { engineerId: 'alan' });
    const source = [incoming(), before, job('one', '09:00', '10:00'), later, other];
    const proposal = createReshuffleProposal(source, request());
    for (const untouched of [before, later, other]) expect(proposal.schedule.find(item => item.id === untouched.id)).toBe(untouched);
  });
  it('preserves IDs, arbitrary metadata and elapsed duration without duplicates or mutation', () => {
    const source = [incoming(), job('one', '09:00', '10:00', { customerReference: 'C', siteReference: 'S', systemReference: 'SYS', equipmentReference: 'E', jobNumber: 'J', serviceType: 'Alarm test', notes: 'Keep notes', instructions: 'Keep instructions', metadata: { original: true } })];
    const snapshot = structuredClone(source);
    const proposal = createReshuffleProposal(source, request());
    const result = applyReshuffle(source, proposal);
    const shifted = result.find(item => item.id === 'one');
    for (const [key, value] of Object.entries(source[1])) if (!['startAt', 'endAt', 'date', 'endDate', 'start', 'end'].includes(key)) expect(shifted[key]).toEqual(value);
    expect(shifted.metadata).toBe(source[1].metadata);
    expect(appointmentDuration(shifted)).toBe(60);
    expect(result.map(item => item.id)).toEqual(source.map(item => item.id));
    expect(new Set(result.map(item => item.id)).size).toBe(source.length);
    expect(source).toEqual(snapshot);
  });
  it.each(['Completed', 'Awaiting Approval', 'Approved'])('blocks protected %s jobs without returning a partial schedule', status => {
    const source = [incoming(), job('protected', '09:00', '10:00', { status })];
    const before = structuredClone(source);
    const proposal = createReshuffleProposal(source, request());
    expect(proposal.blocked).toBe(true);
    expect(proposal.reason).toContain(status);
    expect(proposal.protectedJobs[0].id).toBe('protected');
    expect(proposal.schedule).toBeNull(); expect(proposal.changes).toHaveLength(0);
    expect(() => applyReshuffle(source, proposal)).toThrow(/protected/);
    expect(source).toEqual(before);
  });
  it('blocks a protected job reached later in the cascade and applies nothing', () => {
    const source = [incoming(), job('one', '09:15', '10:15'), job('protected', '10:30', '11:30', { status: 'Approved' })];
    const proposal = createReshuffleProposal(source, request());
    expect(proposal.blocked).toBe(true);
    expect(source[1].start).toBe('09:15');
    expect(proposal.protectedJobs[0].id).toBe('protected');
  });
  it('does not block a protected booking beyond a sufficient gap', () => {
    const proposal = createReshuffleProposal([incoming(), job('one', '09:00', '09:30'), job('protected', '10:30', '12:00', { status: 'Approved' })], request());
    expect(proposal.blocked).toBe(false);
    expect(proposal.changes.map(item => item.original.id)).toEqual(['incoming', 'one']);
  });
  it('handles overnight cascades with full dates and working-hours warnings', () => {
    const source = [incoming(), job('one', '23:30', '00:30', { endDate: '2026-10-13' }), job('two', '00:45', '01:45', { date: '2026-10-13' })];
    const proposal = createReshuffleProposal(source, { ...request(), startAt: localToInstant('2026-10-12', '23:00'), endAt: localToInstant('2026-10-13', '00:30') });
    expect(compact(proposal)).toEqual([['incoming', '23:00', '00:30'], ['one', '00:30', '01:30'], ['two', '01:30', '02:30']]);
    expect(proposal.schedule.find(item => item.id === 'one').date).toBe('2026-10-13');
    expect(proposal.warnings.some(item => item.message.includes('calendar date changes'))).toBe(true);
    expect(proposal.warnings.some(item => item.message.includes('crosses midnight'))).toBe(true);
    expect(proposal.warnings.some(item => item.message.includes('outside normal working hours'))).toBe(true);
    noNewOverlap(proposal.schedule, ['incoming', 'one', 'two']);
  });
  it('supports a validated move between engineers and a validated duration resize', () => {
    const source = [incoming(), job('one', '09:00', '10:00')];
    const move = createMoveProposal(source, 'incoming', 'david', '09:00', [{ id: 'david' }]);
    expect(createReshuffleProposal(source, { jobId: move.job.id, engineerId: move.engineerId, startAt: move.startAt, endAt: move.endAt }).incoming.engineerId).toBe('david');
    const resizedSource = [job('incoming', '08:00', '09:00'), source[1]];
    const resize = createResizeProposal(resizedSource, 'incoming', '09:30');
    const proposal = createReshuffleProposal(resizedSource, { jobId: resize.job.id, engineerId: resize.job.engineerId, startAt: resize.job.startAt, endAt: resize.endAt });
    expect(proposal.incoming.end).toBe('09:30');
    expect(proposal.schedule[1].start).toBe('09:30');
  });
  it('resolves long chains of more than eight jobs deterministically', () => {
    const start = instantMs(localToInstant('2026-10-12', '09:00'));
    const chain = Array.from({ length: 100 }, (_, index) => appointmentRecord({ id: `job-${String(index).padStart(3, '0')}`, engineerId: 'david', status: 'Scheduled', timeZone: 'Europe/London', startAt: new Date(start + index * 900000).toISOString(), endAt: new Date(start + (index + 1) * 900000).toISOString() }));
    const source = [incoming(), ...chain];
    const proposal = createReshuffleProposal(source, request('09:00', '09:15'));
    expect(proposal.changes).toHaveLength(101);
    expect(proposal.schedule.map(item => item.id)).toEqual(source.map(item => item.id));
    for (const item of proposal.schedule.slice(1)) expect(appointmentDuration(item)).toBe(15);
    noNewOverlap(proposal.schedule, proposal.changes.map(item => item.original.id));
    expect(compact(createReshuffleProposal([...source].reverse(), request('09:00', '09:15')))).toEqual(compact(proposal));
  });
  it.each([
    ['spring', '2026-03-29T00:00:00Z', '2026-03-29T01:00:00Z', '2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z'],
    ['autumn', '2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'],
  ])('preserves elapsed duration across the %s clock change', (_name, startAt, endAt, otherStart, otherEnd) => {
    const existing = appointmentRecord({ id: 'one', engineerId: 'david', status: 'Scheduled', startAt: otherStart, endAt: otherEnd, timeZone: 'Europe/London' });
    const proposal = createReshuffleProposal([incoming(), existing], { jobId: 'incoming', engineerId: 'david', startAt, endAt });
    expect(appointmentDuration(proposal.schedule[1])).toBe(60);
    expect(proposal.schedule[1].startAt).toBe(new Date(endAt).toISOString());
  });
  it('rejects stale confirmations, invalid intervals and duplicate or missing IDs atomically', () => {
    const source = [incoming(), job('one', '09:00', '10:00')];
    const proposal = createReshuffleProposal(source, request());
    expect(() => applyReshuffle([source[0], { ...source[1], status: 'Completed' }], proposal)).toThrow(/schedule changed/);
    expect(() => createReshuffleProposal([...source, source[1]], request())).toThrow(/unique/);
    expect(() => createReshuffleProposal(source, { ...request(), jobId: 'missing' })).toThrow(/no longer/);
    expect(() => createReshuffleProposal(source, { ...request(), endAt: request().startAt })).toThrow(/after/);
    expect(source[1].start).toBe('09:00');
  });
  it('rejects a request changed after preview rather than applying unreviewed times', () => {
    const source = [incoming(), job('one', '09:00', '10:00')];
    const proposal = createReshuffleProposal(source, request());
    proposal.request.startAt = localToInstant('2026-10-12', '08:30');
    expect(() => applyReshuffle(source, proposal)).toThrow(/match the preview/);
    expect(source[1].start).toBe('09:00');
  });
});
