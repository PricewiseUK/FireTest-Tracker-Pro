import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';

afterEach(cleanup);
const selectDate = date => fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: date } });
const nightBlock = () => document.querySelector('.daily-job[data-job-id="job-032"]');

describe('overnight appointment calendar presentation', () => {
  it('shows one shared appointment on both weekly dates with continuation indicators', async () => {
    render(<EngineerScheduling />);
    const thursday = screen.getByRole('cell', { name: 'Alan, Thursday 15 Oct' });
    const friday = screen.getByRole('cell', { name: 'Alan, Friday 16 Oct' });
    const first = within(thursday).getByRole('button', { name: /Emergency alarm callout/ });
    const second = within(friday).getByRole('button', { name: /Emergency alarm callout/ });
    expect(first.dataset.jobId).toBe('job-032'); expect(second.dataset.jobId).toBe('job-032');
    expect(within(first).getByText('Continues on next date')).toBeTruthy();
    expect(within(second).getByText('Continues from previous date')).toBeTruthy();
    expect(first.textContent).toContain('2026-10-15 23:00 → 2026-10-16 01:00');
    expect(screen.getByText('33 appointments')).toBeTruthy();
  });
  it('clips the daily block to each date and opens the same full allocation from either date', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    selectDate('2026-10-15'); await user.click(screen.getByRole('button', { name: 'Daily' }));
    expect(nightBlock().style.height).toBe('60px');
    expect(nightBlock().textContent).toContain('Continues on next date');
    selectDate('2026-10-16');
    expect(document.querySelectorAll('.daily-job[data-job-id="job-032"]')).toHaveLength(1);
    expect(nightBlock().style.top).toBe('0px'); expect(nightBlock().style.height).toBe('60px');
    expect(nightBlock().textContent).toContain('Continues from previous date');
    await user.click(within(nightBlock()).getByRole('button', { name: /^View / }));
    const details = screen.getByRole('dialog', { name: 'Demo Night Depot' });
    expect(within(details).getByText('2 hours')).toBeTruthy();
    expect(within(details).getByText('Europe/London')).toBeTruthy();
    expect(within(details).getByText('2026-10-15 23:00 → 2026-10-16 01:00')).toBeTruthy();
  });
  it('resizes across midnight through the accessible finish-date control and updates both views', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: /View 08:30 Fire alarm service at Emberfield House/ }));
    await user.click(screen.getByRole('button', { name: 'Adjust Duration' }));
    fireEvent.change(screen.getByLabelText('Finish date'), { target: { value: '2026-10-13' } });
    fireEvent.change(screen.getByLabelText('Finish time'), { target: { value: '01:00' } });
    await user.click(screen.getByRole('button', { name: 'Review Change' }));
    expect(screen.getByText('New: 2026-10-12 08:30 → 2026-10-13 01:00')).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /explicitly confirm/ }));
    await user.click(screen.getByRole('button', { name: 'Allow Overlap' }));
    const next = screen.getByRole('cell', { name: 'David, Tuesday 13 Oct' });
    expect(within(next).getByRole('button', { name: /Emberfield House/ }).dataset.jobId).toBe('job-001');
    selectDate('2026-10-13'); await user.click(screen.getByRole('button', { name: 'Daily' }));
    expect(document.querySelector('.daily-job[data-job-id="job-001"]').style.height).toBe('60px');
  });
  it('moves overnight to a different date and engineer while preserving the shared record', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: /View 08:30 Fire alarm service at Emberfield House/ }));
    await user.click(screen.getByRole('button', { name: 'Move/Reassign Appointment' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Engineer'), 'eng-ollie');
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-16' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '23:30' } });
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    expect(screen.getByText('To: Ollie — 2026-10-16 23:30 → 2026-10-17 00:30')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    for (const label of ['Ollie, Friday 16 Oct', 'Ollie, Saturday 17 Oct']) {
      const cell = screen.getByRole('cell', { name: label });
      expect(within(cell).getByRole('button', { name: /Emberfield House/ }).dataset.jobId).toBe('job-001');
    }
    expect(screen.getByText('33 appointments')).toBeTruthy();
  });
  it('rejects nonexistent local edits and requires a choice for ambiguous edits', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: /View 08:30 Fire alarm service at Emberfield House/ }));
    await user.click(screen.getByRole('button', { name: 'Move/Reassign Appointment' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-03-29' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '01:30' } });
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    expect(screen.getByRole('alert').textContent).toContain('does not exist');
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-25' } });
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    expect(screen.getByRole('alert').textContent).toContain('ambiguous');
    await user.selectOptions(screen.getByLabelText('Clock-change occurrence'), 'later');
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    expect(screen.getByRole('dialog', { name: 'Move Appointment?' })).toBeTruthy();
    expect(screen.getByText(/To: David — 01:30 GMT/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('cell', { name: 'David, Monday 12 Oct' })).toBeTruthy();
  });
  it('renders 23/25-hour rulers and retains full-day mode through density changes', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    await user.click(screen.getByRole('button', { name: 'Full Day OFF' }));
    selectDate('2026-03-29');
    expect(document.querySelector('.daily-grid').style.gridTemplateRows).toBe('58px 1380px');
    selectDate('2026-10-25');
    expect(document.querySelector('.daily-grid').style.gridTemplateRows).toBe('58px 1500px');
    expect(screen.getByText('01:00 BST')).toBeTruthy(); expect(screen.getByText('01:00 GMT')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    expect(document.querySelector('.daily-grid').style.gridTemplateRows).toBe('58px 2000px');
    expect(screen.getByRole('button', { name: 'Full Day ON' })).toBeTruthy();
  });
});
