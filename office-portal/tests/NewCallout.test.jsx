import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EngineerScheduling from '../src/pages/EngineerScheduling.jsx';
import OfficeLayout from '../src/components/OfficeLayout.jsx';
import { DEMO_APPOINTMENTS } from '../src/scheduling/demoSchedule.js';
import { DEMO_CUSTOMERS } from '../src/scheduling/callouts/demoCustomers.js';
import { NATURE_OF_JOB_OPTIONS } from '../src/scheduling/callouts/calloutValidation.js';

afterEach(cleanup);
const launch = () => screen.getByRole('button', { name: '+ New Callout' });
const search = () => screen.getByRole('searchbox', { name: 'Search customer, site or address...' });
const field = name => screen.getByLabelText(new RegExp(`^${name}`));
const button = name => screen.getByRole('button', { name, exact: true });
const panel = () => within(screen.getByRole('dialog'));
async function selectSite(user, name = 'Emberfield House') {
  await user.click(panel().getByRole('button', { name: new RegExp(name) }));
}
async function open(user) {
  render(<EngineerScheduling />);
  await user.click(launch());
}

describe('New Callout local demonstration panel', () => {
  it('opens focused search with separate sites and selects the correct customer/address', async () => {
    const user = userEvent.setup(); await open(user);
    expect(document.activeElement).toBe(search());
    await user.type(search(), 'EMBERFIELD est');
    const results = within(screen.getByRole('list', { name: 'Customer and site search results' }));
    expect(results.getAllByRole('button')).toHaveLength(2);
    await selectSite(user, 'Emberfield Depot');
    const dialog = within(screen.getByRole('dialog'));
    for (const value of ['Emberfield Estates', 'Emberfield Depot', /22 Fictional Way.*ZZ1 2BB/]) expect(dialog.getByText(value)).toBeTruthy();
    expect(field('Estimated Duration').value).toBe('60');
    expect(within(field('Nature of Job')).getAllByRole('option').map(item => item.value)).toEqual(NATURE_OF_JOB_OPTIONS);
    expect(within(field('Priority')).getAllByRole('option').map(item => item.value)).toEqual(['Normal', 'Urgent', 'Emergency']);
    expect(dialog.getByText('Equipment not yet registered — engineer can add details on site.')).toBeTruthy();
    expect(field('Equipment/System').disabled).toBe(true);
  });

  it('shows a no-match result without creating customer records', async () => {
    const user = userEvent.setup(); await open(user);
    await user.type(search(), 'no such site');
    expect(screen.getByText('No matching customers or sites.')).toBeTruthy();
    expect(within(screen.getByRole('list')).queryAllByRole('button')).toHaveLength(0);
    expect(DEMO_CUSTOMERS).toHaveLength(3);
  });

  it('offers matching existing equipment, resets incompatible selections and permits none', async () => {
    const user = userEvent.setup(); await open(user); await selectSite(user);
    await user.selectOptions(field('Nature of Job'), 'Fire Alarm Panel');
    const equipment = field('Equipment/System');
    expect(within(equipment).getAllByRole('option')).toHaveLength(2);
    await user.selectOptions(equipment, 'demo-equipment-house-panel');
    await user.selectOptions(field('Nature of Job'), 'Fire Doors');
    expect(equipment.value).toBe(''); expect(equipment.disabled).toBe(true);
    await user.click(button('Review Callout'));
    expect(screen.getByRole('dialog', { name: 'New Callout Preview' })).toBeTruthy();
    expect(screen.getByText('No equipment selected')).toBeTruthy();
  });

  it('reviews a complete callout with optional contact data without changing the directory or calendar', async () => {
    const user = userEvent.setup(); await open(user); await selectSite(user);
    const directoryBefore = JSON.stringify(DEMO_CUSTOMERS);
    await user.selectOptions(field('Nature of Job'), 'Fire Alarm Panel');
    await user.type(field('Reported Fault'), 'Panel showing a fault');
    await user.type(field('Site Contact Name'), 'Demo Contact');
    await user.type(field('Site Contact Telephone Number'), '+44 (0) 7700 900123 ext. 42');
    await user.type(field('Access Instructions'), 'Use side entrance');
    await user.selectOptions(field('Priority'), 'Emergency');
    await user.selectOptions(field('Equipment/System'), 'demo-equipment-house-panel');
    fireEvent.change(field('Estimated Duration'), { target: { value: '90' } });
    await user.click(button('Review Callout'));
    const dialog = within(screen.getByRole('dialog', { name: 'New Callout Preview' }));
    for (const text of ['Preview Only — Job Not Yet Created', 'Emberfield Estates', 'Emberfield House', /10 Example Lane.*ZZ1 1AA/, 'Fire Alarm Panel', 'Panel showing a fault', 'Demo Contact', '+44 (0) 7700 900123 ext. 42', 'Use side entrance', 'Emergency', 'Demonstration reception panel', '90 minutes']) expect(dialog.getByText(text)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'New Callout Preview' }));
    await user.tab({ shift: true }); expect(document.activeElement).toBe(button('Create Job'));
    await user.tab(); expect(document.activeElement).toBe(button('Close new callout'));
    expect(dialog.getByRole('button', { name: 'Create Job' })).toBeTruthy();
    expect(screen.getByText(`${DEMO_APPOINTMENTS.length} appointments`)).toBeTruthy();
    expect(JSON.stringify(DEMO_CUSTOMERS)).toBe(directoryBefore);
    await user.click(button('Close Preview'));
    await user.click(button('Discard Details'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(`${DEMO_APPOINTMENTS.length} appointments`)).toBeTruthy();
  });

  it('allows blank optional details, including equipment and duration', async () => {
    const user = userEvent.setup(); await open(user); await selectSite(user, 'Emberfield Depot');
    await user.clear(field('Estimated Duration'));
    await user.click(button('Review Callout'));
    expect(screen.getByRole('dialog', { name: 'New Callout Preview' })).toBeTruthy();
    expect(screen.getByText('Not specified')).toBeTruthy();
    expect(screen.getAllByText('Not provided')).toHaveLength(4);
  });

  it('shows accessible validation, focuses the first invalid control and preserves input', async () => {
    const user = userEvent.setup(); await open(user); await selectSite(user);
    await user.type(field('Site Contact Telephone Number'), 'not a number');
    fireEvent.change(field('Estimated Duration'), { target: { value: '-10' } });
    await user.click(button('Review Callout'));
    const telephone = field('Site Contact Telephone Number');
    expect(screen.getByRole('alert').textContent).toContain('highlighted fields');
    expect(document.activeElement).toBe(telephone);
    expect(telephone.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(telephone.getAttribute('aria-describedby')).textContent).toContain('telephone number');
    expect(field('Estimated Duration').getAttribute('aria-invalid')).toBe('true');
    await user.clear(telephone); await user.type(telephone, '(01632) 960-001');
    expect(document.activeElement).toBe(telephone);
    fireEvent.change(field('Estimated Duration'), { target: { value: '60' } });
    await user.click(button('Review Callout'));
    expect(screen.getByText('(01632) 960-001')).toBeTruthy();
  });

  it('preserves draft details through site search, reselection, preview and editing', async () => {
    const user = userEvent.setup(); await open(user); await selectSite(user);
    await user.type(field('Reported Fault'), 'Keep this report');
    await user.type(field('Site Contact Name'), 'Demo Contact');
    await user.selectOptions(field('Priority'), 'Urgent');
    await user.selectOptions(field('Equipment/System'), 'demo-equipment-house-panel');
    await user.click(button('Change Site'));
    await user.type(search(), 'Beacon');
    await user.click(button('Return to Callout Details'));
    expect(field('Reported Fault').value).toBe('Keep this report');
    expect(field('Equipment/System').value).toBe('demo-equipment-house-panel');
    await user.click(button('Change Site')); await selectSite(user, 'Beacon Annex');
    expect(field('Equipment/System').value).toBe('');
    expect(field('Reported Fault').value).toBe('Keep this report');
    expect(field('Site Contact Name').value).toBe('Demo Contact');
    await user.click(button('Review Callout')); await user.click(button('Edit Details'));
    expect(field('Priority').value).toBe('Urgent');
    expect(field('Reported Fault').value).toBe('Keep this report');
    expect(panel().getByText('Beacon Annex')).toBeTruthy();
  });

  it.each(['Cancel', 'Close new callout', 'Escape'])('confirms before discarding via %s and supports Keep Editing', async action => {
    const user = userEvent.setup(); await open(user); await selectSite(user);
    await user.type(field('Reported Fault'), 'Unsaved details');
    if (action === 'Escape') await user.keyboard('{Escape}'); else await user.click(button(action));
    expect(screen.getByRole('dialog', { name: 'Discard callout details?' })).toBeTruthy();
    expect(document.activeElement).toBe(button('Keep Editing'));
    await user.keyboard('{Escape}');
    expect(field('Reported Fault').value).toBe('Unsaved details');
    await user.click(button('Cancel')); await user.click(button('Keep Editing'));
    expect(field('Reported Fault').value).toBe('Unsaved details');
    await user.click(button('Cancel')); await user.click(button('Discard Details'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(launch()));
    await user.click(launch()); await selectSite(user);
    expect(field('Reported Fault').value).toBe('');
    expect(screen.getByText(`${DEMO_APPOINTMENTS.length} appointments`)).toBeTruthy();
  });

  it('supports keyboard search, result navigation, focus wrapping and pristine Escape close', async () => {
    const user = userEvent.setup(); await open(user);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(button('Close new callout'));
    await user.tab({ shift: true });
    const results = within(screen.getByRole('list')).getAllByRole('button');
    expect(document.activeElement).toBe(results.at(-1));
    await user.tab(); expect(document.activeElement).toBe(button('Close new callout'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(launch()));
    await user.click(launch()); await user.type(search(), 'Beacon Court Management');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement.textContent).toContain('Beacon Court');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(panel().getByText('Beacon Annex')).toBeTruthy();
    expect(document.activeElement).toBe(field('Nature of Job'));
    await user.click(button('Change Site')); await user.clear(search());
    await user.type(search(), 'ZZ11AA{Enter}');
    expect(panel().getByText('Emberfield House')).toBeTruthy();
    field('Reported Fault').focus(); await user.tab();
    expect(document.activeElement).toBe(field('Site Contact Name'));
    field('Access Instructions').focus(); await user.tab();
    expect(document.activeElement).toBe(field('Equipment/System'));
    button('Create Job').focus(); await user.tab();
    expect(document.activeElement).toBe(button('Close new callout'));
  });

  it('works in fullscreen Daily mode and lets the callout handle Escape before the planner', async () => {
    const user = userEvent.setup();
    render(<OfficeLayout activePage="scheduling" companyName="Fictional workspace" userEmail="office@example.com" officeRole="owner" onNavigate={vi.fn()} onSignOut={vi.fn()}><EngineerScheduling /></OfficeLayout>);
    await user.click(button('Daily'));
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-10-16' } });
    await user.click(button('Full Screen Planner')); await user.click(launch());
    await selectSite(user); await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Discard callout details?' })).toBeTruthy();
    expect(button('Exit Fullscreen')).toBeTruthy();
    await user.click(button('Discard Details'));
    expect(screen.getByLabelText('Selected date').value).toBe('2026-10-16');
    expect(button('Daily').getAttribute('aria-pressed')).toBe('true');
    expect(button('Exit Fullscreen')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(launch()));
    await user.keyboard('{Escape}');
    expect(button('Full Screen Planner')).toBeTruthy();
  });
});
