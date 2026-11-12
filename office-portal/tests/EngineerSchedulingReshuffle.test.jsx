import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';

beforeEach(() => vi.stubGlobal('PointerEvent', class extends MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const block = id => document.querySelector(`.daily-job[data-job-id="${id}"]`);
const selectDate = value => fireEvent.change(screen.getByLabelText('Selected date'), { target: { value } });
async function daily() {
  const user = userEvent.setup(); render(<EngineerScheduling />);
  await user.click(screen.getByRole('button', { name: 'Daily' })); return user;
}
async function resizeLodge(user, end) {
  await user.click(screen.getByRole('button', { name: /View 13:00 to 14:00 Emergency lighting test at Example Lodge/ }));
  await user.click(screen.getByRole('button', { name: 'Adjust Duration' }));
  fireEvent.change(screen.getByLabelText('Finish time'), { target: { value: end } });
  await user.click(screen.getByRole('button', { name: 'Review Change' }));
}
const preview = () => screen.getByRole('dialog', { name: 'Reschedule Appointments?' });

describe('schedule reshuffle confirmation workflow', () => {
  it('offers the three choices after pointer resizing and applies the entire preview only on confirmation', async () => {
    const user = await daily();
    const handle = screen.getByRole('button', { name: 'Adjust duration for Example Lodge at 13:00' });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 230 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 230 });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow Overlap' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(preview()).getByText('1 existing appointment affected, plus the incoming appointment.')).toBeTruthy();
    const table = within(preview()).getByRole('table');
    expect(within(table).getByRole('rowheader', { name: /Example Lodge/ })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: /Beacon Annex/ })).toBeTruthy();
    expect(block('job-023').dataset.durationMinute).toBe('60');
    expect(block('job-024').dataset.startMinute).toBe('855');
    await user.click(screen.getByRole('button', { name: 'Confirm Reshuffle' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(block('job-023').dataset.durationMinute).toBe('90');
    expect(block('job-024').dataset.startMinute).toBe('870');
    expect(block('job-024').dataset.durationMinute).toBe('60');
    expect(block('job-025').dataset.startMinute).toBe('930');
    await user.click(within(block('job-024')).getByRole('button', { name: /^View / }));
    expect(within(screen.getByRole('dialog')).getByText('14:30–15:30')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close appointment details' }));
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    const david = screen.getByRole('cell', { name: 'David, Monday 12 Oct' });
    expect(within(david).getByRole('button', { name: /View 14:30 Extinguisher service at Beacon Annex/ }).dataset.jobId).toBe('job-024');
    expect(screen.getByText('33 appointments')).toBeTruthy();
  });
  it('cancels the preview without applying the incoming resize or any shifted appointment', async () => {
    const user = await daily(); await resizeLodge(user, '14:30');
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    await user.click(within(preview()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(block('job-023').dataset.durationMinute).toBe('60');
    expect(block('job-024').dataset.startMinute).toBe('855');
  });
  it('blocks a protected appointment encountered after a cascade and never applies partial changes', async () => {
    const user = await daily(); await resizeLodge(user, '14:45');
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    expect(within(preview()).getByRole('alert').textContent).toContain('Emberfield Depot is Awaiting Approval');
    expect(screen.getByRole('button', { name: 'Confirm Reshuffle' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(block('job-023').dataset.durationMinute).toBe('60');
    expect(block('job-024').dataset.startMinute).toBe('855');
    expect(block('job-025').dataset.startMinute).toBe('930');
  });
  it('blocks directly conflicting Approved work and retains acknowledgement for Allow Overlap', async () => {
    const user = await daily();
    await user.click(within(block('job-001')).getByRole('button', { name: /^View / }));
    await user.click(screen.getByRole('button', { name: 'Adjust Duration' }));
    fireEvent.change(screen.getByLabelText('Finish time'), { target: { value: '10:30' } });
    await user.click(screen.getByRole('button', { name: 'Review Change' }));
    expect(screen.getByRole('button', { name: 'Allow Overlap' }).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /explicitly confirm/ }));
    expect(screen.getByRole('button', { name: 'Allow Overlap' }).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    expect(within(preview()).getByRole('alert').textContent).toContain('Sampleton Arcade is Approved');
    expect(screen.getByRole('button', { name: 'Confirm Reshuffle' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(block('job-001').dataset.durationMinute).toBe('60');
  });
  it('moves between engineers, reshuffles the destination, and updates both calendars and counts', async () => {
    const user = await daily(); selectDate('2026-10-13');
    await user.click(within(block('job-005')).getByRole('button', { name: /^View / }));
    await user.click(screen.getByRole('button', { name: 'Move/Reassign Appointment' }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Engineer'), 'eng-kim');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:45' } });
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    expect(within(preview()).getByText(/Original: Alan/)).toBeTruthy();
    expect(within(preview()).getByText(/Requested: Kim/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm Reshuffle' }));
    expect(block('job-005').closest('.daily-column').dataset.engineer).toBe('eng-kim');
    expect(block('job-005').dataset.startMinute).toBe('585');
    expect(block('job-007').dataset.startMinute).toBe('705');
    expect(block('job-007').dataset.durationMinute).toBe('120');
    expect(document.querySelector('.daily-engineer-heading[data-engineer="eng-kim"] small').textContent).toBe('2 jobs');
    expect(document.querySelector('.daily-engineer-heading[data-engineer="eng-alan"] small').textContent).toBe('1 jobs');
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    const cell = screen.getByRole('cell', { name: 'Kim, Tuesday 13 Oct' });
    expect(within(cell).getByRole('button', { name: /View 09:45 Alarm fault visit/ }).dataset.jobId).toBe('job-005');
    expect(within(cell).getByRole('button', { name: /View 11:45 Extinguisher service/ }).dataset.jobId).toBe('job-007');
  });
  it('previews overnight/date warnings and places shifted jobs on the next date', async () => {
    const user = await daily(); selectDate('2026-10-18');
    await user.click(within(block('job-020')).getByRole('button', { name: /^View / }));
    await user.click(screen.getByRole('button', { name: 'Move/Reassign Appointment' }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Engineer'), 'eng-kim');
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-17' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '23:30' } });
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    const warnings = within(preview()).getByRole('note', { name: 'Reshuffle warnings' });
    expect(warnings.textContent).toContain('calendar date changes');
    expect(warnings.textContent).toContain('crosses midnight');
    expect(warnings.textContent).toContain('outside normal working hours');
    expect(warnings.textContent).toContain('2026-10-18');
    await user.click(screen.getByRole('button', { name: 'Confirm Reshuffle' }));
    expect(screen.getByLabelText('Selected date').value).toBe('2026-10-17');
    expect(block('job-033')).toBeNull();
    selectDate('2026-10-18');
    expect(block('job-033').dataset.startMinute).toBe('90');
    expect(block('job-033').dataset.durationMinute).toBe('120');
    expect(block('job-020').dataset.durationMinute).toBe('90');
    expect(document.querySelectorAll('.daily-job[data-job-id="job-033"]')).toHaveLength(1);
    expect(screen.getByText('33 appointments')).toBeTruthy();
  });
  it('cancels reshuffling with Escape before exiting fullscreen', async () => {
    const user = await daily(); await user.click(screen.getByRole('button', { name: 'Full Screen Planner' }));
    await resizeLodge(user, '14:30');
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    expect(block('job-024').dataset.startMinute).toBe('855');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Full Screen Planner' })).toBeTruthy();
  });
  it('offers reshuffling for weekly drag-and-drop reassignment too', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    const source = screen.getByRole('cell', { name: 'Alan, Tuesday 13 Oct' });
    const destination = screen.getByRole('cell', { name: 'Kim, Tuesday 13 Oct' });
    const card = within(source).getByRole('button', { name: /View 08:00 Alarm fault visit/ });
    const values = new Map();
    const dataTransfer = { setData: (key, value) => values.set(key, value), getData: key => values.get(key) || '' };
    fireEvent.dragStart(card, { dataTransfer }); fireEvent.dragOver(destination, { dataTransfer }); fireEvent.drop(destination, { dataTransfer });
    await user.click(screen.getByRole('button', { name: 'Move Existing Jobs Down' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Reshuffle' }));
    expect(within(destination).getByRole('button', { name: /View 08:00 Alarm fault visit/ }).dataset.jobId).toBe('job-005');
    expect(within(destination).getByRole('button', { name: /View 10:00 Extinguisher service/ }).dataset.jobId).toBe('job-007');
  });
});
