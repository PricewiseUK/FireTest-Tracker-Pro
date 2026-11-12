import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const block = () => document.querySelector('.daily-job[data-job-id="job-001"]');
const handle = () => screen.getByRole('button', { name: 'Adjust duration for Emberfield House at 08:30' });
async function daily() {
  const user = userEvent.setup();
  render(<EngineerScheduling />);
  await user.click(screen.getByRole('button', { name: 'Daily' }));
  return user;
}
function start() { fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientY: 200 }); }
function move(y) { fireEvent.pointerMove(window, { pointerId: 1, clientY: y }); }
function release(y) { fireEvent.pointerUp(window, { pointerId: 1, clientY: y }); }

describe('duration resize workflow', () => {
  it('drags a finish beyond midnight without changing the start or dropping the continuation', async () => {
    const user = await daily();
    start();
    const scroll = document.querySelector('.daily-scroll'); scroll.scrollTop = 600;
    move(560); fireEvent.scroll(scroll); release(560);
    expect(screen.getByText('New: 2026-10-12 08:30 → 2026-10-13 01:30')).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /explicitly confirm/ }));
    await user.click(screen.getByRole('button', { name: 'Allow Overlap' }));
    expect(block().dataset.startMinute).toBe('510');
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-10-13' } });
    expect(block().style.height).toBe('90px');
    await user.click(within(block()).getByRole('button', { name: /^View / }));
    expect(within(screen.getByRole('dialog')).getByText('17 hours')).toBeTruthy();
  });
  it('previews snapped extension without opening details, and cancel restores the original', async () => {
    const user = await daily();
    start(); move(223);
    expect(block().style.height).toBe('90px');
    expect(screen.getByRole('status').textContent).toContain('10:00');
    expect(screen.queryByRole('dialog')).toBeNull();
    release(223);
    fireEvent.click(handle(), { detail: 1 });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(block().style.height).toBe('60px');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shortens after confirmation and updates the weekly view and details', async () => {
    const user = await daily();
    start(); move(170); release(170);
    await user.click(screen.getByRole('button', { name: 'Confirm Change' }));
    expect(block().style.height).toBe('30px');
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    const card = screen.getByRole('button', { name: /View 08:30 Fire alarm service at Emberfield House/ });
    expect(card.dataset.jobId).toBe('job-001');
    expect(card.textContent).toContain('08:30–09:00');
    await user.click(card);
    const details = screen.getByRole('dialog', { name: 'Emberfield House' });
    expect(within(details).getByText('08:30–09:00')).toBeTruthy();
    expect(within(details).getByText('30 minutes')).toBeTruthy();
  });

  it('uses the comfortable scale while expanded and accounts for scrolling during a drag', async () => {
    const user = await daily();
    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    await user.click(screen.getByRole('button', { name: 'Expand Planner' }));
    const scroll = document.querySelector('.daily-scroll');
    scroll.scrollTop = 100;
    start(); move(220);
    scroll.scrollTop = 120;
    fireEvent.scroll(scroll);
    expect(block().style.height).toBe('120px');
    release(220);
    expect(screen.getByText('New: 08:30–10:00')).toBeTruthy();
  });

  it('requires explicit overlap acknowledgement for the accessible exact-time alternative', async () => {
    const user = await daily();
    await user.click(screen.getByRole('button', { name: /View 08:30 to 09:30 Fire alarm service/ }));
    await user.click(screen.getByRole('button', { name: 'Adjust Duration' }));
    fireEvent.change(screen.getByLabelText('Finish time'), { target: { value: '10:30' } });
    await user.click(screen.getByRole('button', { name: 'Review Change' }));
    expect(within(screen.getByRole('dialog')).getByText('Sampleton Arcade')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow Overlap' }).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /explicitly confirm/ }));
    await user.click(screen.getByRole('button', { name: 'Allow Overlap' }));
    expect(block().style.height).toBe('120px');
    expect(block().classList.contains('status-in-progress')).toBe(true);
  });

  it('rejects invalid manual finishes and supports cancelling a touch gesture', async () => {
    const user = await daily();
    fireEvent.click(handle(), { detail: 0 });
    fireEvent.change(screen.getByLabelText('Finish time'), { target: { value: '08:30' } });
    await user.click(screen.getByRole('button', { name: 'Review Change' }));
    expect(screen.getByRole('alert').textContent).toContain('at least 15 minutes');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.pointerDown(handle(), { pointerId: 1, pointerType: 'touch', button: 0, clientY: 200 });
    move(240);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(block().style.height).toBe('60px');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('extends the timeline beyond its default end for a long preview', async () => {
    await daily();
    start(); move(800);
    expect(screen.getByRole('status').textContent).toContain('19:30');
    expect(document.querySelector('.daily-grid').style.gridTemplateRows).toContain('840px');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(block().style.height).toBe('60px');
  });
});
