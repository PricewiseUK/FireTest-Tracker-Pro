import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetImports from '../src/pages/AssetImports.jsx';
import { parseCSV, exampleCSV } from '../src/imports/importModel.js';

const workers = [];
class LocalWorker {
  terminate = vi.fn();
  constructor() { workers.push(this); }
  postMessage(file) {
    if (file.name === 'pending.csv') return;
    if (file.name === 'attention.csv') {
      queueMicrotask(() => this.onmessage({ data: { result: parseCSV('Customer,Address,Email\n<img src=x onerror=alert(1)>,10 Lane,bad\n<img src=x onerror=alert(1)>,10 Lane,bad\n,20 Lane,') } }));
      return;
    }
    queueMicrotask(() => this.onmessage({ data: file.name === 'bad.csv' ? { error: 'Malformed CSV: check quotes and commas.' } : { result: { ...parseCSV(exampleCSV(file.name === 'buildings.csv' ? 'buildings' : 'customers')), sheetName: '' } } }));
  }
}
beforeEach(() => { workers.length = 0; vi.stubGlobal('Worker', LocalWorker); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function upload(user, name = 'customers.csv') {
  await user.upload(screen.getByLabelText('Choose CSV or XLSX file'), new File(['fixture'], name, { type: 'text/csv' }));
  await screen.findByText(/Ready:/);
}
describe('preview wizard', () => {
  it('walks all five steps, navigates back, summarises accurately and resets', async () => {
    const user = userEvent.setup(); render(<AssetImports />);
    expect(screen.getByRole('button', { name: /Next:/ }).disabled).toBe(true);
    expect(screen.getAllByText('Upcoming')).toHaveLength(4);
    await upload(user);
    await user.click(screen.getByRole('button', { name: 'Next: Match Columns' }));
    const customer = screen.getByLabelText('Customer Name');
    await user.selectOptions(customer, '');
    expect(screen.getByRole('button', { name: /Next:/ }).disabled).toBe(true);
    expect(screen.getByText('Match a column to Customer Name.')).toBeTruthy();
    await user.selectOptions(customer, 'customerName');
    await user.click(screen.getByRole('button', { name: 'Next: Preview Records' }));
    expect(screen.getByText('2 valid · 0 invalid. You can continue reviewing even if records need attention.')).toBeTruthy();
    expect(screen.getByText('Emberfield Estates (Fictional)')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Customer Name').value).toBe('customerName');
    await user.click(screen.getByRole('button', { name: 'Next: Preview Records' }));
    await user.click(screen.getByRole('button', { name: 'Next: Check Duplicates' }));
    expect(screen.getByText(/0 records flagged/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next: Review Import' }));
    expect(screen.getByRole('button', { name: 'Import to InstaFirePilot — Not Yet Enabled' }).disabled).toBe(true);
    expect(screen.getByText('Total records').nextElementSibling.textContent).toBe('2');
    expect(screen.getByText('Preview only — no records have been saved')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reset wizard' }));
    await user.click(screen.getByRole('button', { name: 'Keep working' }));
    expect(screen.getByRole('heading', { name: 'Review Import' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reset wizard' }));
    await user.click(screen.getByRole('button', { name: 'Clear preview' }));
    expect(screen.getByRole('heading', { name: 'Upload File' })).toBeTruthy();
    expect(screen.queryByText(/customers.csv/)).toBeNull();
    expect(screen.getByRole('button', { name: /Next:/ }).disabled).toBe(true);
  });
  it('supports building previews and clears the previous file when type changes', async () => {
    const user = userEvent.setup(); render(<AssetImports />); await upload(user);
    await user.click(screen.getByRole('radio', { name: 'Buildings / Sites' }));
    expect(screen.queryByText(/Ready:/)).toBeNull();
    await upload(user, 'buildings.csv');
    await user.click(screen.getByRole('button', { name: 'Next: Match Columns' }));
    expect(screen.getByLabelText('Building Name').value).toBe('name');
    await user.click(screen.getByRole('button', { name: 'Next: Preview Records' }));
    expect(screen.getByText('Example House')).toBeTruthy();
  });
  it('clears stale records after malformed replacements', async () => {
    const user = userEvent.setup(); render(<AssetImports />); await upload(user);
    await user.upload(screen.getByLabelText('Choose CSV or XLSX file'), new File(['bad'], 'bad.csv', { type: 'text/csv' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Malformed/);
    expect(screen.queryByText(/Ready:/)).toBeNull();
    expect(screen.getByRole('button', { name: /Next:/ }).disabled).toBe(true);
  });
  it('terminates parsing on reset and unmount', async () => {
    const user = userEvent.setup(); const view = render(<AssetImports />);
    await user.upload(screen.getByLabelText('Choose CSV or XLSX file'), new File(['pending'], 'pending.csv', { type: 'text/csv' }));
    expect(screen.getByText(/Reading your file/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reset wizard' }));
    await user.click(screen.getByRole('button', { name: 'Clear preview' }));
    expect(workers[0].terminate).toHaveBeenCalled();
    await upload(user);
    await user.upload(screen.getByLabelText('Choose CSV or XLSX file'), new File(['pending'], 'pending.csv', { type: 'text/csv' }));
    view.unmount();
    expect(workers.at(-1).terminate).toHaveBeenCalled();
  });
  it('reports worker failures without exposing parser internals', async () => {
    const user = userEvent.setup(); render(<AssetImports />);
    await user.upload(screen.getByLabelText('Choose CSV or XLSX file'), new File(['pending'], 'pending.csv', { type: 'text/csv' }));
    workers.at(-1).onerror();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Unable to read/));
  });
  it('shows invalid records and duplicate warnings, with imported HTML rendered as text', async () => {
    const user = userEvent.setup(); const view = render(<AssetImports />); await upload(user, 'attention.csv');
    await user.click(screen.getByRole('button', { name: 'Next: Match Columns' }));
    await user.click(screen.getByRole('button', { name: 'Next: Preview Records' }));
    expect(screen.getAllByText('Email address is invalid.')).toHaveLength(2);
    expect(screen.getByText('Customer Name is required.')).toBeTruthy();
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.getAllByText('<img src=x onerror=alert(1)>')).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Show records'), 'valid');
    expect(screen.getByText('No records in this view.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next: Check Duplicates' }));
    expect(screen.getByText('2 records flagged as potential duplicates.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next: Review Import' }));
    expect(screen.getByText('Invalid records').nextElementSibling.textContent).toBe('3');
    expect(screen.getByText('Records requiring attention').nextElementSibling.textContent).toBe('3');
  });
  it('ignores a stale worker reply after reset', async () => {
    const user = userEvent.setup(); render(<AssetImports />);
    await user.upload(screen.getByLabelText('Choose CSV or XLSX file'), new File(['pending'], 'pending.csv', { type: 'text/csv' }));
    const oldWorker = workers[0];
    await user.click(screen.getByRole('button', { name: 'Reset wizard' }));
    await user.click(screen.getByRole('button', { name: 'Clear preview' }));
    oldWorker.onmessage({ data: { result: parseCSV(exampleCSV('customers')) } });
    expect(screen.queryByText(/Ready:/)).toBeNull();
    expect(screen.getByRole('button', { name: /Next:/ }).disabled).toBe(true);
  });
  it('stops a stalled parser after the timeout', () => {
    vi.useFakeTimers();
    render(<AssetImports />);
    fireEvent.change(screen.getByLabelText('Choose CSV or XLSX file'), { target: { files: [new File(['pending'], 'pending.csv', { type: 'text/csv' })] } });
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByRole('alert').textContent).toMatch(/too long/);
    expect(workers[0].terminate).toHaveBeenCalled();
  });
});
