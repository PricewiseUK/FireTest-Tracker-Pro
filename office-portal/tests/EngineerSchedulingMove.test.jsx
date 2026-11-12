import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';

let origin;
let columnWidth;
beforeEach(() => {
  origin = 100; columnWidth = 180;
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType || 'mouse'; }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const scroll = document.querySelector('.daily-scroll');
    if (this.classList.contains('daily-scroll')) return { left: 40, right: 1400, top: 100, bottom: 900, width: 1360, height: 800 };
    if (this.classList.contains('daily-column')) {
      const index = [...this.parentElement.querySelectorAll('.daily-column')].indexOf(this);
      const left = origin + index * columnWidth - (scroll?.scrollLeft || 0);
      return { left, right: left + columnWidth, top: 158 - (scroll?.scrollTop || 0), bottom: 1000, width: columnWidth, height: 840 };
    }
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const card = () => screen.getByRole('button', { name: /View 08:30 to 09:30 Fire alarm service/ });
const block = () => document.querySelector('.daily-job[data-job-id="job-001"]');
async function daily() {
  const user = userEvent.setup(); render(<EngineerScheduling />);
  await user.click(screen.getByRole('button', { name: 'Daily' })); return user;
}
function down(x = 150, y = 320, pointerType = 'mouse') { fireEvent.pointerDown(card(), { pointerId: 1, button: 0, clientX: x, clientY: y, pointerType }); }
function move(x, y) { fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y }); }
function up(x, y) { fireEvent.pointerUp(window, { pointerId: 1, clientX: x, clientY: y }); }

describe('daily appointment movement', () => {
  it('drags into an overnight allocation while using a scrolled full-day ruler', async () => {
    const user = await daily();
    await user.click(screen.getByRole('button', { name: 'Full Day OFF' }));
    down(150, 680);
    const scroll = document.querySelector('.daily-scroll'); scroll.scrollTop = 900;
    move(870, 680); fireEvent.scroll(scroll); up(870, 680);
    expect(screen.getByText('To: Kim — 2026-10-12 23:30 → 2026-10-13 00:30')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(block().dataset.durationMinute).toBe('30'); // Visible portion; full duration remains one hour.
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-10-13' } });
    const continuation = document.querySelector('.daily-job[data-job-id="job-001"]');
    expect(continuation.dataset.durationMinute).toBe('30');
    await user.click(within(continuation).getByRole('button', { name: /^View / }));
    expect(within(screen.getByRole('dialog')).getByText('1 hour')).toBeTruthy();
  });
  it('moves vertically with snapping, a live preview, and a confirmation boundary', async () => {
    const user = await daily(); down(); move(150, 343);
    expect(screen.getByRole('status').textContent).toContain('David · 09:00–10:00');
    expect(block().dataset.startMinute).toBe('510');
    expect(document.querySelector('.daily-move-target').dataset.engineer).toBe('eng-david');
    up(150, 343);
    expect(screen.getByRole('dialog', { name: 'Move Appointment?' })).toBeTruthy();
    fireEvent.click(card(), { detail: 1 }); // post-drag click cannot open details
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(block().dataset.startMinute).toBe('540');
    expect(block().dataset.durationMinute).toBe('60');
  });
  it('moves horizontally to the engineer under the actual pointer position', async () => {
    const user = await daily(); down(); move(870, 320); up(870, 320);
    expect(screen.getByText('To: Kim — 08:30–09:30')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(block().closest('.daily-column').dataset.engineer).toBe('eng-kim');
    expect(block().dataset.startMinute).toBe('510');
    expect(document.querySelectorAll('.daily-job[data-job-id="job-001"]')).toHaveLength(1);
  });
  it('moves diagonally and updates the weekly overview', async () => {
    const user = await daily(); down(); move(870, 410); up(870, 410);
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(block().closest('.daily-column').dataset.engineer).toBe('eng-kim');
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    const cell = screen.getByRole('cell', { name: 'Kim, Monday 12 Oct' });
    const moved = within(cell).getByRole('button', { name: /View 10:00 Fire alarm service/ });
    expect(moved.dataset.jobId).toBe('job-001');
    expect(moved.textContent).toContain('10:00–11:00');
  });
  it('supports cancel and Escape without changing the appointment', async () => {
    const user = await daily(); down(); move(870, 350);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    down(); move(870, 350); up(870, 350);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(block().closest('.daily-column').dataset.engineer).toBe('eng-david');
    expect(block().dataset.startMinute).toBe('510');
  });
  it('rejects invalid drops and preserves click-to-view below the movement threshold', async () => {
    await daily(); down(); move(10, 350);
    expect(screen.getByRole('status').textContent).toContain('Drop inside');
    up(10, 350);
    expect(screen.queryByRole('dialog')).toBeNull();
    down(); move(152, 322); up(152, 322); fireEvent.click(card(), { detail: 1 });
    expect(screen.getByRole('dialog', { name: 'Emberfield House' })).toBeTruthy();
  });
  it('offers keyboard movement and requires explicit overlap acknowledgement', async () => {
    const user = await daily(); await user.click(card());
    await user.click(screen.getByRole('button', { name: 'Move/Reassign Appointment' }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Engineer'), 'eng-john');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
    expect(within(screen.getByRole('dialog')).getByText('10:00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Review Move' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Northstar Offices')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow Overlap' }).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /explicitly acknowledge/ }));
    await user.click(screen.getByRole('button', { name: 'Allow Overlap' }));
    expect(block().closest('.daily-column').dataset.engineer).toBe('eng-john');
  });
  it('accounts for scrolling and changing sidebar/column geometry in comfortable expanded mode', async () => {
    const user = await daily();
    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    await user.click(screen.getByRole('button', { name: 'Expand Planner' }));
    const scroll = document.querySelector('.daily-scroll'); scroll.scrollTop = 100;
    down(150, 270); // source top 158-100+200, grab offset 12
    origin = 180; columnWidth = 200; scroll.scrollLeft = 80; scroll.scrollTop = 140;
    move(950, 270); fireEvent.scroll(scroll); up(950, 270);
    expect(screen.getByText('To: Kim — 09:00–10:00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(block().style.height).toBe('80px');
    expect(block().dataset.startMinute).toBe('540');
  });
  it('keeps touch scrolling available by default and enables touch movement explicitly', async () => {
    const user = await daily(); down(150, 320, 'touch'); move(870, 350); up(870, 350);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Touch Drag OFF' }));
    down(150, 320, 'touch'); move(870, 350); up(870, 350);
    expect(screen.getByText('To: Kim — 09:00–10:00')).toBeTruthy();
  });
});
