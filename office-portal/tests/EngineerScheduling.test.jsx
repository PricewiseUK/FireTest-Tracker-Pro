import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';
import Dashboard from '../src/pages/Dashboard.jsx';
import Sidebar from '../src/components/Sidebar.jsx';
import { APPOINTMENT_STATUSES, appointmentsForCell, DEMO_APPOINTMENTS, DEMO_ENGINEERS } from '../src/scheduling/demoSchedule.js';

afterEach(cleanup);

const appointmentButtons = cell => within(cell).queryAllByRole('button', { name: /^View / });
const davidMonday = () => screen.getByRole('cell', { name: 'David, Monday 12 Oct' });
const johnWednesday = () => screen.getByRole('cell', { name: 'John, Wednesday 14 Oct' });
const makeDataTransfer = () => {
  const values = new Map();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (type, value) => values.set(type, value),
    getData: type => values.get(type) || '',
  };
};

function dragTo(card, cell) {
  const dataTransfer = makeDataTransfer();
  fireEvent.dragStart(card, { dataTransfer });
  fireEvent.dragOver(cell, { dataTransfer });
  fireEvent.drop(cell, { dataTransfer });
}

describe('Engineer Scheduling Phase 1A', () => {
  it('renders the deterministic schedule and the requested fictional engineers', () => {
    render(<EngineerScheduling />);

    expect(screen.getByRole('heading', { name: 'Engineer Scheduling' })).toBeTruthy();
    expect(screen.getByText('12-18 October 2026')).toBeTruthy();
    expect(screen.getByText(`${DEMO_APPOINTMENTS.length} appointments`)).toBeTruthy();
    expect(DEMO_ENGINEERS.map(engineer => engineer.name)).toEqual(['David', 'John', 'Dan', 'Alan', 'Kim', 'Ollie']);
    for (const engineer of DEMO_ENGINEERS) expect(screen.getByRole('rowheader', { name: new RegExp(engineer.name) })).toBeTruthy();
  });

  it('sorts each engineer and day by appointment start time', () => {
    const appointments = appointmentsForCell('eng-david', '2026-10-12');
    expect(appointments.map(job => job.start)).toEqual(['07:15', '08:30', '10:00', '11:30', '13:00', '14:15', '15:30', '17:00']);

    render(<EngineerScheduling />);
    expect(appointmentButtons(davidMonday()).map(button => button.getAttribute('aria-label').slice(5, 10))).toEqual(['07:15', '08:30', '10:00']);
  });

  it('shows three of eight jobs by default with the correct remaining count', () => {
    render(<EngineerScheduling />);
    expect(appointmentButtons(davidMonday())).toHaveLength(3);
    const more = within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ });
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands all eight jobs and collapses back to three', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);

    await user.click(within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ }));
    expect(appointmentButtons(davidMonday())).toHaveLength(8);
    const fewer = within(davidMonday()).getByRole('button', { name: /Show fewer/ });
    expect(fewer.getAttribute('aria-expanded')).toBe('true');

    await user.click(fewer);
    expect(appointmentButtons(davidMonday())).toHaveLength(3);
    expect(within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ })).toBeTruthy();
  });

  it('keeps expansion state independent between engineer and day cells', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);

    expect(appointmentButtons(johnWednesday())).toHaveLength(3);
    expect(within(johnWednesday()).getByRole('button', { name: /\+ 2 more jobs/ })).toBeTruthy();
    await user.click(within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ }));

    expect(appointmentButtons(davidMonday())).toHaveLength(8);
    expect(appointmentButtons(johnWednesday())).toHaveLength(3);
    expect(within(johnWednesday()).getByRole('button', { name: /\+ 2 more jobs/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('provides the full preview on pointer hover and keyboard focus', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const card = appointmentButtons(davidMonday())[0];

    await user.hover(card);
    let tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText('Northstar Facilities')).toBeTruthy();
    expect(within(tooltip).getByText('Northstar Annex')).toBeTruthy();
    expect(within(tooltip).getByText('David')).toBeTruthy();
    await user.unhover(card);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(card);
    tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText('Fire blanket service')).toBeTruthy();
    fireEvent.blur(card);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens the correct read-only appointment details and closes with its button', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const card = appointmentButtons(davidMonday())[0];

    await user.click(card);
    const dialog = screen.getByRole('dialog', { name: 'Northstar Annex' });
    expect(within(dialog).getByText('Northstar Facilities')).toBeTruthy();
    expect(within(dialog).getByText('Fire blanket service')).toBeTruthy();
    expect(within(dialog).getByText('Monday 12 Oct 2026')).toBeTruthy();
    expect(within(dialog).getByText('07:15–08:00')).toBeTruthy();
    const close = within(dialog).getByRole('button', { name: 'Close appointment details' });
    expect(document.activeElement).toBe(close);

    await user.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(card);
  });

  it('closes details with Escape and restores focus to the appointment card', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const card = appointmentButtons(davidMonday())[1];

    await user.click(card);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(card);
  });

  it('keeps every details action in the keyboard focus cycle', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    await user.click(appointmentButtons(davidMonday())[0]);
    const dialog = screen.getByRole('dialog', { name: 'Northstar Annex' });
    const actions = [
      'Close appointment details',
      'Close',
      'Adjust Duration',
      'Move/Reassign Appointment',
      'Reassign appointment',
    ].map(name => within(dialog).getByRole('button', { name, exact: true }));
    expect(document.activeElement).toBe(actions[0]);
    for (const action of actions.slice(1)) {
      await user.tab();
      expect(document.activeElement).toBe(action);
    }
    await user.tab();
    expect(document.activeElement).toBe(actions[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(actions.at(-1));
  });

  it('closes from the bottom Close action and restores appointment focus', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const card = appointmentButtons(davidMonday())[0];
    await user.click(card);
    const dialog = screen.getByRole('dialog', { name: 'Northstar Annex' });
    await user.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('preserves the distinct move-time and keep-start-time reassignment controls', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    await user.click(appointmentButtons(davidMonday())[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move/Reassign Appointment' }));
    const moveDialog = screen.getByRole('dialog', { name: 'Move/Reassign Appointment' });
    expect(within(moveDialog).getByLabelText('Start time')).toBeTruthy();
    expect(within(moveDialog).getByLabelText('Start date')).toBeTruthy();
    await user.click(within(moveDialog).getByRole('button', { name: 'Cancel' }));
    await user.click(appointmentButtons(davidMonday())[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reassign appointment', exact: true }));
    const reassignDialog = screen.getByRole('dialog', { name: 'Choose a new assignment' });
    expect(within(reassignDialog).getByLabelText('Engineer')).toBeTruthy();
    expect(within(reassignDialog).getByLabelText('Day')).toBeTruthy();
    expect(within(reassignDialog).queryByLabelText('Start time')).toBeNull();
  });

  it('uses only workflow statuses and keeps Awaiting parts as a separate flag', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const legend = screen.getByLabelText('Appointment status key');
    expect(APPOINTMENT_STATUSES.map(status => status.label)).toEqual(['Scheduled', 'In Progress', 'Completed', 'Awaiting Approval', 'Approved']);
    for (const status of APPOINTMENT_STATUSES) expect(within(legend).getByText(status.label)).toBeTruthy();

    await user.click(within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ }));
    const flagged = within(davidMonday()).getByRole('button', { name: /View 17:00/ });
    expect(within(flagged).getByText('Awaiting parts')).toBeTruthy();
    expect(flagged.getAttribute('aria-label')).toContain('Scheduled');
  });

  it('keeps Completed blue and separate from green Approved jobs', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    await user.click(within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ }));

    const completed = within(davidMonday()).getByRole('button', { name: /View 07:15/ });
    const inProgress = within(davidMonday()).getByRole('button', { name: /View 08:30/ });
    const approved = within(davidMonday()).getByRole('button', { name: /View 10:00/ });
    const scheduled = within(davidMonday()).getByRole('button', { name: /View 11:30/ });

    expect(completed.classList.contains('status-completed')).toBe(true);
    expect(inProgress.classList.contains('status-in-progress')).toBe(true);
    expect(approved.classList.contains('status-approved')).toBe(true);
    expect(scheduled.classList.contains('status-scheduled')).toBe(true);
    expect(completed.getAttribute('aria-label')).toContain('Completed');
    expect(completed.getAttribute('aria-label')).not.toContain('Approved');
  });

  it('moves one existing card after drag review and explicit confirmation', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const source = davidMonday();
    const destination = screen.getByRole('cell', { name: 'Kim, Friday 16 Oct' });
    const card = within(source).getByRole('button', { name: /View 07:15/ });
    expect(card.getAttribute('data-job-id')).toBe('job-021');

    dragTo(card, destination);
    const dialog = screen.getByRole('dialog', { name: 'Reassign appointment?' });
    expect(within(dialog).getByText('From').nextElementSibling.textContent).toContain('David');
    expect(within(dialog).getByText('To').nextElementSibling.textContent).toContain('Kim');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Reassignment' }));

    expect(within(source).queryByRole('button', { name: /View 07:15/ })).toBeNull();
    const moved = within(destination).getAllByRole('button', { name: /View 07:15/ });
    expect(moved).toHaveLength(1);
    expect(moved[0].getAttribute('data-job-id')).toBe('job-021');
    expect(screen.getByRole('status').textContent).toMatch(/reassigned to Kim/);
  });

  it('cancels a proposed drag reassignment without changing either cell', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const source = davidMonday();
    const destination = screen.getByRole('cell', { name: 'Kim, Friday 16 Oct' });
    dragTo(within(source).getByRole('button', { name: /View 07:15/ }), destination);

    await user.click(within(screen.getByRole('dialog', { name: 'Reassign appointment?' })).getByRole('button', { name: 'Cancel' }));
    expect(within(source).getByRole('button', { name: /View 07:15/ })).toBeTruthy();
    expect(within(destination).queryByRole('button', { name: /View 07:15/ })).toBeNull();
  });

  it('lists conflicts and requires a separate overlap acknowledgement before confirmation', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    dragTo(within(davidMonday()).getByRole('button', { name: /View 08:30/ }), screen.getByRole('cell', { name: 'John, Monday 12 Oct' }));

    const dialog = screen.getByRole('dialog', { name: 'Reassign appointment?' });
    expect(within(dialog).getByText('Scheduling overlap detected')).toBeTruthy();
    expect(within(dialog).getByText('Emergency lighting test')).toBeTruthy();
    expect(within(dialog).getByText('Northstar Offices')).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Allow Overlap' });
    expect(confirm.disabled).toBe(true);
    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/ }));
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);

    expect(within(davidMonday()).queryByRole('button', { name: /View 08:30/ })).toBeNull();
    expect(within(screen.getByRole('cell', { name: 'John, Monday 12 Oct' })).getAllByRole('button', { name: /View 08:30/ })).toHaveLength(1);
  });

  it('rejects a drop back into the appointment current cell', () => {
    render(<EngineerScheduling />);
    const source = davidMonday();
    dragTo(within(source).getByRole('button', { name: /View 07:15/ }), source);
    expect(screen.queryByRole('dialog', { name: 'Reassign appointment?' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/different engineer or day/);
    expect(within(source).getByRole('button', { name: /View 07:15/ })).toBeTruthy();
  });

  it('offers a keyboard and touch-friendly choose, review and confirm path', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    const card = within(davidMonday()).getByRole('button', { name: /View 07:15/ });
    await user.click(card);
    await user.click(within(screen.getByRole('dialog', { name: 'Northstar Annex' })).getByRole('button', { name: 'Reassign appointment' }));

    const choose = screen.getByRole('dialog', { name: 'Choose a new assignment' });
    await user.selectOptions(within(choose).getByLabelText('Engineer'), 'eng-kim');
    await user.selectOptions(within(choose).getByLabelText('Day'), '2026-10-16');
    await user.click(within(choose).getByRole('button', { name: 'Review reassignment' }));
    const review = screen.getByRole('dialog', { name: 'Reassign appointment?' });
    expect(within(review).getByText('No overlapping appointments were found for the destination engineer.')).toBeTruthy();
    await user.click(within(review).getByRole('button', { name: 'Confirm Reassignment' }));

    expect(within(davidMonday()).queryByRole('button', { name: /View 07:15/ })).toBeNull();
    expect(within(screen.getByRole('cell', { name: 'Kim, Friday 16 Oct' })).getByRole('button', { name: /View 07:15/ })).toBeTruthy();
  });

  it('preserves existing navigation and dashboard content', () => {
    const { unmount } = render(<Sidebar activePage="scheduling" onNavigate={() => {}} companyName="Example Workspace" />);
    for (const label of ['Dashboard', 'Asset Approvals', 'Customers & Buildings', 'Engineers', 'Inspections', 'Reports', 'Asset Imports', 'Settings']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: /Jobs & Scheduling/ })).toHaveLength(1);
    unmount();

    render(<Dashboard onNavigate={() => {}} companyName="Example Workspace" />);
    expect(screen.getByRole('heading', { name: 'Workspace Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /VIEW BUILDINGS/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /IMPORT ASSETS/ })).toBeTruthy();
  });
});

describe('Engineer Scheduling Phase 2A daily timeline', () => {
  it('exposes clearly labelled toggles with keyboard activation and accurate pressed states', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    const fullDay = screen.getByRole('button', { name: 'Full Day OFF' });
    const touchDrag = screen.getByRole('button', { name: 'Touch Drag OFF' });
    expect(fullDay.getAttribute('aria-pressed')).toBe('false');
    expect(touchDrag.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Drag appointments to reschedule.')).toBeTruthy();
    fullDay.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Full Day ON' })).toBe(fullDay);
    expect(fullDay.getAttribute('aria-pressed')).toBe('true');
    await user.tab();
    expect(document.activeElement).toBe(touchDrag);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Touch Drag ON' })).toBe(touchDrag);
    expect(touchDrag.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.daily-planner').classList.contains('touch-move-enabled')).toBe(true);
    await user.keyboard(' ');
    expect(touchDrag.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.daily-planner').classList.contains('touch-move-enabled')).toBe(false);
    await user.click(fullDay);
    expect(fullDay.getAttribute('aria-pressed')).toBe('false');
  });
  async function openDaily() {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    return user;
  }

  it('keeps the weekly overview and compact-card expansion available', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    expect(screen.getByRole('region', { name: 'Weekly engineer schedule' })).toBeTruthy();
    await user.click(within(davidMonday()).getByRole('button', { name: /\+ 5 more jobs/ }));
    expect(appointmentButtons(davidMonday())).toHaveLength(8);
  });

  it('renders the daily timeline with all six engineers', async () => {
    await openDaily();
    const timeline = screen.getByRole('region', { name: 'Daily engineer timeline for Monday 12 Oct' });
    for (const engineer of DEMO_ENGINEERS) {
      expect(timeline.querySelector(`.daily-engineer-heading[data-engineer="${engineer.id}"]`)).toBeTruthy();
      expect(timeline.querySelector(`.daily-column[data-engineer="${engineer.id}"]`)).toBeTruthy();
    }
  });

  it('maps start time and duration to exact compact timeline positions', async () => {
    await openDaily();
    const job = document.querySelector('.daily-job[data-job-id="job-001"]');
    expect(job.dataset.startMinute).toBe('510');
    expect(job.dataset.durationMinute).toBe('60');
    expect(job.style.top).toBe('150px');
    expect(job.style.height).toBe('60px');
  });

  it('shows the 15-minute overlap and out-of-hours appointment separately', async () => {
    await openDaily();
    const longJob = document.querySelector('.daily-job[data-job-id="job-003"]');
    const overlap = document.querySelector('.daily-job[data-job-id="job-031"]');
    const early = document.querySelector('.daily-job[data-job-id="job-030"]');
    expect(overlap.dataset.durationMinute).toBe('15');
    expect(overlap.style.height).toBe('15px');
    expect(longJob.style.left).not.toBe(overlap.style.left);
    expect(early).toBeTruthy();
    expect(early.style.top).toBe('30px');
  });

  it('preserves the selected date while switching daily and weekly views', async () => {
    const user = userEvent.setup();
    render(<EngineerScheduling />);
    await user.click(screen.getByRole('button', { name: 'Next date' }));
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    expect(screen.getByText('Tuesday 13 Oct 2026')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Daily engineer timeline for Tuesday 13 Oct' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    await user.click(screen.getByRole('button', { name: 'Daily' }));
    expect(screen.getByText('Tuesday 13 Oct 2026')).toBeTruthy();
  });

  it('expands and restores the planner without changing its current view', async () => {
    const user = await openDaily();
    const page = document.querySelector('.schedule-page');
    await user.click(screen.getByRole('button', { name: 'Expand Planner' }));
    expect(page.classList.contains('schedule-page-expanded')).toBe(true);
    expect(screen.getByRole('region', { name: /Daily engineer timeline/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Restore View' }));
    expect(page.classList.contains('schedule-page-expanded')).toBe(false);
  });

  it('changes density presentation only and preserves appointment identity', async () => {
    const user = await openDaily();
    const original = document.querySelector('.daily-job[data-job-id="job-001"]');
    expect(original.style.height).toBe('60px');
    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    const comfortable = document.querySelector('.daily-job[data-job-id="job-001"]');
    expect(comfortable.style.height).toBe('80px');
    expect(comfortable.dataset.jobId).toBe('job-001');
    expect(within(comfortable).getByRole('button', { name: /View 08:30 to 09:30/ })).toBeTruthy();
  });

  it('selects one engineer for the responsive single-engineer presentation', async () => {
    const user = await openDaily();
    await user.selectOptions(screen.getByLabelText('Engineer'), 'eng-kim');
    expect(document.querySelector('.daily-engineer-heading[data-engineer="eng-kim"]').dataset.selected).toBe('true');
    expect(document.querySelector('.daily-column[data-engineer="eng-david"]').dataset.selected).toBe('false');
  });

  it('opens existing read-only details from a timeline appointment', async () => {
    const user = await openDaily();
    const job = screen.getByRole('button', { name: /View 06:30 to 07:15 Fire panel reset/ });
    expect(job.dataset.jobId).toBe('job-030');
    await user.click(job);
    const dialog = screen.getByRole('dialog', { name: 'Demo Civic Hall' });
    expect(within(dialog).getByText('Fictional Borough Council')).toBeTruthy();
    expect(within(dialog).getByText('Fire panel reset')).toBeTruthy();
  });
});
