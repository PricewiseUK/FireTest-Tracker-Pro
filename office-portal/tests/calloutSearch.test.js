import { describe, expect, it } from 'vitest';
import { searchCustomerSites } from '../src/scheduling/callouts/customerSearch.js';
import { DEMO_CUSTOMERS, DEMO_SITES } from '../src/scheduling/callouts/demoCustomers.js';

describe('local customer/site search', () => {
  it.each([
    ['eMbErFiElD eSt', ['Emberfield House', 'Emberfield Depot']],
    ['beacon ann', ['Beacon Annex']],
    ['10 examp lane', ['Emberfield House']],
    ['zz1 1a', ['Emberfield House']],
    ['ZZ11AA', ['Emberfield House']],
    ['northstar fictional green', ['Northstar Offices', 'Northstar Annex']],
  ])('matches partial, case-insensitive customer/site/address/postcode query %s', (query, names) => {
    expect(searchCustomerSites(query).map(result => result.site.name)).toEqual(names);
  });

  it('lists separate buildings for the same customer using original references', () => {
    const results = searchCustomerSites('Beacon Court Management');
    expect(results).toHaveLength(2);
    expect(results[0].customer).toBe(results[1].customer);
    expect(results[0].customer).toBe(DEMO_CUSTOMERS[1]);
    expect(results[0].site).toBe(DEMO_SITES[2]);
    expect(results[1].site).toBe(DEMO_SITES[3]);
    expect(new Set(results.map(result => result.site.id)).size).toBe(2);
  });

  it('returns all local sites initially and no results for unknown or punctuation-only queries', () => {
    expect(searchCustomerSites('  ')).toHaveLength(6);
    expect(searchCustomerSites('unrecognised customer')).toEqual([]);
    expect(searchCustomerSites('---')).toEqual([]);
  });

  it('does not mutate the directory or return orphaned sites', () => {
    const original = JSON.stringify({ DEMO_CUSTOMERS, DEMO_SITES });
    searchCustomerSites('site');
    expect(searchCustomerSites('', [], DEMO_SITES)).toEqual([]);
    expect(JSON.stringify({ DEMO_CUSTOMERS, DEMO_SITES })).toBe(original);
    expect(Object.isFrozen(DEMO_SITES[0].equipment[0])).toBe(true);
    expect(DEMO_CUSTOMERS.every(customer => customer.contactEmail.endsWith('.example'))).toBe(true);
  });
});
