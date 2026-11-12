import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OfficeLayout from '../src/components/OfficeLayout.jsx';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType || 'mouse'; }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const scroll = document.querySelector('.daily-scroll');
    const fullscreen = document.querySelector('.office-layout-fullscreen');
    const origin = fullscreen ? 80 : 350;
    const width = fullscreen ? 200 : 180;
    if (this.classList.contains('daily-scroll')) return { left: origin - 68, right: origin + width * 6, top: 100, bottom: 1000, width: width * 6 + 68, height: 900 };
    if (this.classList.contains('daily-corner')) return { left: origin - 68, right: origin, top: 100, bottom: 158, width: 68, height: 58 };
    if (this.classList.contains('daily-column')) {
      const index = [...this.parentElement.querySelectorAll('.daily-column')].indexOf(this);
      const left = origin + index * width - (scroll?.scrollLeft || 0);
      return { left, right: left + width, top: 158 - (scroll?.scrollTop || 0), bottom: 1200, width, height: 1042 };
    }
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function workspace() {
  return render(<OfficeLayout activePage="scheduling" companyName="Fictional workspace" userEmail="office@example.com" officeRole="owner" onNavigate={vi.fn()} onSignOut={vi.fn()}><EngineerScheduling /></OfficeLayout>);
}
const openFullscreen = user => user.click(screen.getByRole('button', { name: 'Full Screen Planner' }));
const exitFullscreen = user => user.click(screen.getByRole('button', { name: 'Exit Fullscreen' }));
const page = () => document.querySelector('.schedule-page');
const block = () => document.querySelector('.daily-job[data-job-id="job-001"]');
const dailyCard = () => screen.getByRole('button', { name: /View 08:30 to 09:30 Fire alarm service/ });
const weeklyCard = () => screen.getByRole('button', { name: /View 07:15 Fire blanket service/ });
const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' });

describe('immersive scheduling workspace', () => {
  it.each([false, true])('hides all chrome and restores the prior sidebar state (collapsed=%s)', async collapsed => {
    const user = userEvent.setup(); workspace();
    if (collapsed) await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const sidebar = document.querySelector('.sidebar');
    const header = document.querySelector('.office-header');
    const footer = document.querySelector('.office-footer');
    const scheduler = page();
    await openFullscreen(user);
    expect(document.querySelector('.office-layout-fullscreen')).toBeTruthy();
    for (const element of [sidebar, header, footer]) {
      expect(element.isConnected).toBe(true);
      expect(element.parentElement.hidden).toBe(true);
    }
    expect(screen.queryByRole('navigation', { name: 'Office navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'SIGN OUT' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Weekly engineer schedule' })).toBeTruthy();
    expect(page()).toBe(scheduler);
    await exitFullscreen(user);
    for (const element of [sidebar, header, footer]) expect(element.parentElement.hidden).toBe(false);
    expect(document.querySelector('.sidebar')).toBe(sidebar);
    expect(sidebar.classList.contains('sidebar-collapsed')).toBe(collapsed);
    expect(screen.getByRole('button', { name: collapsed ? 'Expand sidebar' : 'Collapse sidebar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'SIGN OUT' })).toBeTruthy();
  });

  it('preserves date, view, engineer, density, full-day and expanded-planner settings', async () => {
    const user = userEvent.setup(); workspace();
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-10-16' } });
    await user.selectOptions(screen.getByLabelText('Engineer'), 'eng-alan');
    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    await user.click(screen.getByRole('button', { name: 'Full Day OFF' }));
    await user.click(screen.getByRole('button', { name: 'Expand Planner' }));
    const column = document.querySelector('.daily-column[data-engineer="eng-alan"]');
    await openFullscreen(user);
    await exitFullscreen(user);
    expect(screen.getByLabelText('Selected date').value).toBe('2026-10-16');
    expect(screen.getByRole('button', { name: 'Daily' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Comfortable' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Full Day ON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore View' })).toBeTruthy();
    expect(screen.getByLabelText('Engineer').value).toBe('eng-alan');
    expect(document.querySelector('.daily-column[data-engineer="eng-alan"]')).toBe(column);
    expect(column.dataset.selected).toBe('true');
  });

  it('gives details and confirmation dialogs priority over Escape', async () => {
    const user = userEvent.setup(); workspace(); await openFullscreen(user);
    await user.click(weeklyCard()); escape();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    await user.click(weeklyCard());
    await user.click(screen.getByRole('button', { name: 'Adjust Duration' })); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    await user.click(weeklyCard());
    await user.click(screen.getByRole('button', { name: 'Move/Reassign Appointment' }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Engineer'), 'eng-kim');
    await user.click(screen.getByRole('button', { name: 'Review Move' })); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    escape();
    expect(screen.getByRole('button', { name: 'Full Screen Planner' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full Screen Planner' }));
  });

  it('cancels movement on the first Escape and exits on the second', async () => {
    const user = userEvent.setup(); workspace();
    await user.click(screen.getByRole('button', { name: 'Daily' })); await openFullscreen(user);
    fireEvent.pointerDown(dailyCard(), { pointerId: 1, button: 0, clientX: 100, clientY: 320 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 900, clientY: 350 });
    expect(screen.getByRole('status')).toBeTruthy();
    escape();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    escape();
    expect(screen.getByRole('button', { name: 'Full Screen Planner' })).toBeTruthy();
    expect(block().dataset.startMinute).toBe('510');
  });

  it('cancels resizing on the first Escape without exiting fullscreen', async () => {
    const user = userEvent.setup(); workspace();
    await user.click(screen.getByRole('button', { name: 'Daily' })); await openFullscreen(user);
    const handle = screen.getByRole('button', { name: 'Adjust duration for Emberfield House at 08:30' });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 230 });
    expect(block().style.height).toBe('90px'); escape();
    expect(block().style.height).toBe('60px');
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    escape();
    expect(screen.getByRole('button', { name: 'Full Screen Planner' })).toBeTruthy();
  });

  it('defers fullscreen Escape during a weekly native drag', async () => {
    const user = userEvent.setup(); workspace(); await openFullscreen(user);
    const card = weeklyCard();
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
    escape();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    fireEvent.dragEnd(card); escape();
    expect(screen.getByRole('button', { name: 'Full Screen Planner' })).toBeTruthy();
  });

  it('retains confirmed pointer moves and resizes through fullscreen exit and reentry', async () => {
    const user = userEvent.setup(); workspace();
    await user.click(screen.getByRole('button', { name: 'Daily' })); await openFullscreen(user);
    fireEvent.pointerDown(dailyCard(), { pointerId: 1, button: 0, clientX: 100, clientY: 320 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 900, clientY: 350 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 900, clientY: 350 });
    await user.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(block().closest('.daily-column').dataset.engineer).toBe('eng-kim');
    const handle = screen.getByRole('button', { name: 'Adjust duration for Emberfield House at 09:00' });
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 2, clientY: 230 });
    fireEvent.pointerUp(window, { pointerId: 2, clientY: 230 });
    await user.click(screen.getByRole('button', { name: 'Confirm Change' }));
    await exitFullscreen(user); await openFullscreen(user);
    expect(block().dataset.startMinute).toBe('540');
    expect(block().dataset.durationMinute).toBe('90');
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(within(screen.getByRole('cell', { name: 'Kim, Monday 12 Oct' })).getByRole('button', { name: /View 09:00 Fire alarm service/ }).textContent).toContain('09:00–10:30');
  });

  it('retains overnight segments and touch mode through entry/exit', async () => {
    const user = userEvent.setup(); workspace();
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-10-16' } });
    await user.click(screen.getByRole('button', { name: 'Touch Drag OFF' })); await openFullscreen(user);
    const night = document.querySelector('.daily-job[data-job-id="job-032"]');
    expect(night.style.height).toBe('60px');
    expect(night.textContent).toContain('Continues from previous date');
    await exitFullscreen(user);
    expect(document.querySelector('.daily-job[data-job-id="job-032"]')).toBe(night);
    expect(screen.getByRole('button', { name: 'Touch Drag ON' })).toBeTruthy();
  });
});
