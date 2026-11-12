import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/Sidebar.jsx';

afterEach(cleanup);

describe('office sidebar layout state', () => {
  it('toggles between expanded and collapsed classes without changing navigation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = render(
      <Sidebar activePage="dashboard" onNavigate={onNavigate} companyName="Example Workspace" />,
    );

    const sidebar = container.querySelector('.sidebar');
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(sidebar.classList.contains('sidebar-collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Asset Imports/ })).toBeTruthy();

    await user.click(toggle);
    expect(sidebar.classList.contains('sidebar-collapsed')).toBe(true);
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: /Asset Imports/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Asset Imports/ }));
    expect(onNavigate).toHaveBeenCalledWith('imports');
  });
});
