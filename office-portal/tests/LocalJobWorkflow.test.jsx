import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';
import { LOCAL_JOBS_KEY } from '../src/scheduling/callouts/localJobStorage.js';
import { UNASSIGNED_DRAG_TYPE } from '../src/scheduling/callouts/useJobWorkspace.js';
import { DEMO_APPOINTMENTS } from '../src/scheduling/demoSchedule.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const dialog = () => within(screen.getByRole('dialog'));
const panel = () => within(screen.getByRole('complementary', { name: 'Unassigned Jobs' }));
const action = name => dialog().getByRole('button', { name, exact: true });
const change = (name, value) => fireEvent.change(dialog().getByLabelText(name), { target: { value } });
const saved = () => JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY));
const firstCard = () => panel().getByRole('article', { name: /T77689/ });
const appointment = () => screen.getByRole('button', { name: /View 14:00.*General Callout at Emberfield Depot/ });
async function revealRestoredJob(user) {
  const cell = within(screen.getByRole('cell', { name: 'John, Monday 12 Oct' }));
  const more = cell.queryByRole('button', { name: /more jobs/ });
  if (more) await user.click(more);
}
function dropOn(column, dataTransfer, clientY = 937) {
  const event = createEvent.drop(column, { dataTransfer });
  Object.defineProperties(event, { clientX: { value: 350 }, clientY: { value: clientY } });
  fireEvent(column, event);
}

async function create(user, details = {}) {
  await user.click(screen.getByRole('button', { name: '+ New Callout' }));
  await user.click(dialog().getByRole('button', { name: /Emberfield Depot/ }));
  for (const [name, value] of Object.entries(details)) change(new RegExp(`^${name}`), value);
  await user.click(action('Create Job'));
}
async function beginAssignment(user, overrides = {}) {
  await user.click(action('Assign Engineer'));
  change('Engineer', 'eng-john'); change('Start time', '14:00');
  for (const [name, value] of Object.entries(overrides)) change(name, value);
  await user.click(action('Review Assignment'));
}
const transfer = () => {
  const data = new Map();
  return { types: [UNASSIGNED_DRAG_TYPE], setData: (key, value) => data.set(key, value), getData: key => data.get(key) || '', effectAllowed: 'none', dropEffect: 'none' };
};
function mockTimelineGeometry() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('daily-scroll')) return { left: 20, right: 1500, top: 40, bottom: 1600, width: 1480, height: 1560 };
    if (this.classList.contains('daily-corner')) return { left: 20, right: 88, top: 40, bottom: 100, width: 68, height: 60 };
    if (this.classList.contains('daily-column')) {
      const index = [...this.parentElement.querySelectorAll('.daily-column')].indexOf(this);
      const left = 88 + index * 200;
      return { left, right: left + 200, top: 100, bottom: 1540, width: 200, height: 1440 };
    }
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  });
}

describe('create, save and schedule local jobs', () => {
  it('creates once, shows compact unassigned details and restores the job after remount', async () => {
    const user = userEvent.setup(); const view = render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: '+ New Callout' }));
    await user.click(dialog().getByRole('button', { name: /Emberfield Depot/ }));
    change(/^Reported Fault/, 'Panel showing orange light'); change(/^Priority/, 'Emergency');
    await user.dblClick(action('Create Job'));
    expect(screen.getByRole('dialog', { name: 'Job Created' })).toBeTruthy();
    expect(saved().jobs).toHaveLength(1);
    expect(firstCard().textContent).toContain('Panel showing orange light');
    expect(firstCard().textContent).toContain('Emergency');
    expect(firstCard().textContent).toContain('60 min');
    expect(screen.getByText(`${DEMO_APPOINTMENTS.length} appointments`)).toBeTruthy();
    await user.click(action('Close'));
    await user.click(panel().getByRole('button', { name: /Unassigned Jobs/ }));
    expect(panel().queryByRole('article')).toBeNull();
    await user.click(panel().getByRole('button', { name: /Unassigned Jobs/ }));
    view.unmount(); render(<EngineerScheduling />);
    expect(firstCard().textContent).toContain('Panel showing orange light');
    expect(saved().jobs[0].jobNumber).toBe('T77689');
  });

  it('assigns immediately, shows the same number/details on both calendars and persists after refresh', async () => {
    const user = userEvent.setup(); const view = render(<EngineerScheduling />);
    await create(user, { 'Reported Fault': 'Keep caller report', 'Site Contact Name': 'Session Contact', 'Site Contact Telephone Number': '01632 960001', 'Access Instructions': 'Demo gate' });
    await beginAssignment(user);
    expect(dialog().getByText(/14:00–15:00/)).toBeTruthy();
    await user.dblClick(action('Confirm Assignment'));
    expect(panel().queryAllByRole('article')).toHaveLength(0);
    expect(appointment().textContent).toContain('T77689');
    await user.click(appointment());
    for (const text of ['T77689', 'Keep caller report', 'Session Contact', '01632 960001', 'Demo gate', 'John']) expect(dialog().getByText(text)).toBeTruthy();
    await user.click(action('Close'));
    await user.click(screen.getByRole('button', { name: 'Daily', exact: true }));
    expect(appointment().textContent).toContain('T77689');
    expect(saved().jobs).toHaveLength(1);
    expect(saved().jobs[0]).toMatchObject({ startAt: '2026-10-12T13:00:00.000Z', endAt: '2026-10-12T14:00:00.000Z', engineerId: 'eng-john' });
    expect(localStorage.getItem(LOCAL_JOBS_KEY)).not.toContain('Session Contact');
    view.unmount(); render(<EngineerScheduling />);
    await revealRestoredJob(user);
    expect(appointment()).toBeTruthy();
    await user.click(appointment()); expect(dialog().getByText('Keep caller report')).toBeTruthy();
    expect(dialog().queryByText('Session Contact')).toBeNull();
  });

  it('cancels assignment and protected reshuffling without removing or assigning the unassigned job', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />); await create(user);
    await beginAssignment(user); const raw = localStorage.getItem(LOCAL_JOBS_KEY);
    await user.click(action('Cancel')); expect(firstCard()).toBeTruthy();
    await user.click(within(firstCard()).getByRole('button', { name: 'Assign Engineer' }));
    change('Engineer', 'eng-john'); change('Start time', '09:00');
    await user.click(action('Review Assignment'));
    expect(action('Allow Overlap').disabled).toBe(true);
    await user.click(action('Move Existing Jobs Down'));
    expect(dialog().getByText('Automatic reshuffle blocked')).toBeTruthy();
    expect(dialog().getAllByText(/Completed/).length).toBeGreaterThan(0);
    expect(action('Confirm Reshuffle').disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(firstCard()).toBeTruthy(); expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBe(raw);
  });

  it('permits explicitly acknowledged overlaps without moving protected work', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />); await create(user);
    await beginAssignment(user, { 'Start time': '09:00' });
    await user.click(dialog().getByRole('checkbox')); await user.click(action('Allow Overlap'));
    expect(saved().jobs[0].engineerId).toBe('eng-john');
    expect(saved().overrides).toEqual([]);
    expect(panel().queryByRole('article')).toBeNull();
  });

  it('previews and commits a reshuffle with fixture changes saved separately and restored', async () => {
    const user = userEvent.setup(); const view = render(<EngineerScheduling />); await create(user);
    await beginAssignment(user, { Date: '2026-10-13', Engineer: 'eng-alan', 'Start time': '08:00' });
    await user.click(action('Move Existing Jobs Down'));
    expect(dialog().getByText('Not yet scheduled')).toBeTruthy();
    await user.click(action('Confirm Reshuffle'));
    expect(saved().jobs[0].engineerId).toBe('eng-alan');
    expect(saved().overrides).toEqual([expect.objectContaining({ id: 'job-005', startAt: '2026-10-13T08:00:00.000Z' })]);
    view.unmount(); render(<EngineerScheduling />);
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-10-13' } });
    expect(screen.getByRole('button', { name: /View 09:00 Alarm fault visit/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /View 08:00 General Callout at Emberfield Depot/ }).textContent).toContain('T77689');
    expect(DEMO_APPOINTMENTS.find(item => item.id === 'job-005').start).toBe('08:00');
  });

  it('drags an unassigned job into Daily Timeline with snapping, confirms, then restores its assignment', async () => {
    const user = userEvent.setup(); const view = render(<EngineerScheduling />); mockTimelineGeometry();
    await create(user); await user.click(action('Close'));
    await user.click(screen.getByRole('button', { name: 'Daily', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Full Day OFF' }));
    const dataTransfer = transfer(); fireEvent.dragStart(firstCard(), { dataTransfer });
    const column = document.querySelector('.daily-column[data-engineer="eng-john"]');
    fireEvent.dragOver(column, { dataTransfer, clientX: 350, clientY: 937 });
    dropOn(column, dataTransfer);
    fireEvent.dragEnd(firstCard());
    expect(screen.getByRole('dialog', { name: 'Confirm Engineer Assignment' })).toBeTruthy();
    expect(dialog().getByText(/14:00–15:00/)).toBeTruthy();
    await user.click(action('Confirm Assignment'));
    expect(panel().queryByRole('article')).toBeNull();
    expect(appointment().closest('.daily-column').dataset.engineer).toBe('eng-john');
    view.unmount(); render(<EngineerScheduling />); await revealRestoredJob(user); expect(appointment()).toBeTruthy();
  });

  it('cancels a timeline drop without saving any allocation', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />); mockTimelineGeometry();
    await create(user); await user.click(action('Close'));
    await user.click(screen.getByRole('button', { name: 'Daily', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Full Day OFF' }));
    const raw = localStorage.getItem(LOCAL_JOBS_KEY); const dataTransfer = transfer(); const card = firstCard();
    fireEvent.dragStart(card, { dataTransfer });
    dropOn(document.querySelector('.daily-column[data-engineer="eng-john"]'), dataTransfer, 940);
    fireEvent.dragEnd(card); await user.click(action('Cancel'));
    expect(firstCard()).toBeTruthy(); expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBe(raw);
  });

  it('edits and deletes a demonstration job without changing its number or directory', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />); await create(user, { 'Reported Fault': 'Original caller report' }); await user.click(action('Close'));
    await user.click(within(firstCard()).getByRole('button', { name: 'View Details' }));
    expect(dialog().getByText('T77689')).toBeTruthy(); expect(dialog().getAllByText('Unassigned').length).toBeGreaterThan(0);
    await user.click(action('Edit Job'));
    expect(dialog().getByLabelText(/^Reported Fault/).value).toBe('Original caller report');
    change(/^Reported Fault/, 'Corrected details'); await user.click(action('Save Job')); await user.click(action('Close'));
    expect(saved().jobs).toHaveLength(1); expect(saved().jobs[0].jobNumber).toBe('T77689');
    expect(saved().jobs[0].originalReportedFault).toBe('Original caller report');
    await user.click(within(firstCard()).getByRole('button', { name: 'Delete Job' })); await user.click(action('Cancel'));
    expect(firstCard()).toBeTruthy();
    await user.click(within(firstCard()).getByRole('button', { name: 'Delete Job' })); await user.click(action('Confirm Delete'));
    expect(saved().jobs).toHaveLength(0);
    await create(user); expect(saved().jobs[0].jobNumber).toBe('T77690');
  });

  it('retains entered form details if storage fails and creates exactly once after retry', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await create(user, { 'Reported Fault': 'Do not clear this report' });
    expect(screen.getByRole('dialog', { name: 'New Callout' })).toBeTruthy();
    expect(dialog().getByLabelText(/^Reported Fault/).value).toBe('Do not clear this report');
    expect(dialog().getByRole('alert').textContent).toContain('Could not save');
    expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBeNull();
    write.mockRestore(); await user.click(action('Create Job'));
    expect(saved().jobs).toHaveLength(1); expect(saved().jobs[0].jobNumber).toBe('T77689');
  });

  it('schedules overnight, edits scheduling without losing fault data, then persists the result', async () => {
    const user = userEvent.setup(); const view = render(<EngineerScheduling />); await create(user, { 'Reported Fault': 'Night callout' });
    await beginAssignment(user, { 'Start time': '23:30', 'Estimated duration (minutes)': '120' });
    expect(dialog().getByText(/Finish date: 2026-10-13/)).toBeTruthy();
    await user.click(action('Confirm Assignment'));
    const card = within(screen.getByRole('cell', { name: 'John, Monday 12 Oct' })).getByRole('button', { name: /View 23:30 General Callout at Emberfield Depot/ });
    await user.click(card); await user.click(action('Adjust Duration'));
    const endInput = dialog().getByLabelText('Finish time');
    fireEvent.change(endInput, { target: { value: '02:00' } });
    await user.click(action('Review Change')); await user.click(action('Confirm Change'));
    expect(saved().jobs[0].reportedFault).toBe('Night callout');
    view.unmount(); render(<EngineerScheduling />);
    await revealRestoredJob(user);
    await user.click(within(screen.getByRole('cell', { name: 'John, Monday 12 Oct' })).getByRole('button', { name: /View 23:30 General Callout at Emberfield Depot/ }));
    expect(dialog().getByText(/2026-10-13 02:00/)).toBeTruthy();
    expect(dialog().getByText('Night callout')).toBeTruthy();
  });

  it('reports corrupt storage without silently replacing it', async () => {
    const user = userEvent.setup(); localStorage.setItem(LOCAL_JOBS_KEY, '{invalid'); render(<EngineerScheduling />);
    expect(screen.getByRole('alert').textContent).toContain('Nothing has been overwritten');
    await create(user); expect(dialog().getByRole('alert').textContent).toContain('Nothing has been overwritten');
    expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBe('{invalid');
  });

  it('keeps new jobs and fixture changes unapplied if saving a reshuffle fails', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />); await create(user);
    await beginAssignment(user, { Date: '2026-10-13', Engineer: 'eng-alan', 'Start time': '08:00' });
    await user.click(action('Move Existing Jobs Down'));
    const raw = localStorage.getItem(LOCAL_JOBS_KEY);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(action('Confirm Reshuffle'));
    expect(dialog().getByRole('alert').textContent).toContain('Could not save');
    expect(firstCard()).toBeTruthy(); expect(localStorage.getItem(LOCAL_JOBS_KEY)).toBe(raw);
    write.mockRestore(); await user.click(action('Cancel'));
    expect(firstCard()).toBeTruthy();
    expect(saved().overrides).toEqual([]);
  });

  it('moves an assigned job and edits its callout without losing its identity, number or allocation', async () => {
    const user = userEvent.setup(); const view = render(<EngineerScheduling />); await create(user, { 'Reported Fault': 'Caller report' });
    await beginAssignment(user); await user.click(action('Confirm Assignment'));
    const id = saved().jobs[0].id;
    await user.click(appointment()); await user.click(action('Move/Reassign Appointment'));
    change('Engineer', 'eng-kim'); change('Start time', '15:00');
    await user.click(action('Review Move')); await user.click(action('Confirm Move'));
    const moved = () => screen.getByRole('button', { name: /View 15:00 General Callout at Emberfield Depot/ });
    await user.click(moved()); await user.click(action('Edit Job'));
    change(/^Access Instructions/, 'Updated demo gate'); await user.click(action('Save Job')); await user.click(action('Close'));
    expect(saved().jobs).toHaveLength(1);
    expect(saved().jobs[0]).toMatchObject({ id, jobNumber: 'T77689', engineerId: 'eng-kim', startAt: '2026-10-12T14:00:00.000Z', endAt: '2026-10-12T15:00:00.000Z', reportedFault: 'Caller report', accessInstructions: 'Updated demo gate' });
    view.unmount(); render(<EngineerScheduling />); await user.click(moved());
    expect(dialog().getByText('T77689')).toBeTruthy(); expect(dialog().getByText('Caller report')).toBeTruthy();
    expect(dialog().getByText('Kim')).toBeTruthy(); expect(dialog().getByText('15:00–16:00')).toBeTruthy();
  });

  it('keeps fullscreen active while Escape cancels assignment and preserves the unassigned job', async () => {
    const user = userEvent.setup(); render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: 'Full Screen Planner' })); await create(user);
    await beginAssignment(user); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(firstCard()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeTruthy();
    await user.click(within(firstCard()).getByRole('button', { name: 'Assign Engineer' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(firstCard()).toBeTruthy();
    expect(saved().jobs[0].startAt).toBeUndefined();
  });
});
