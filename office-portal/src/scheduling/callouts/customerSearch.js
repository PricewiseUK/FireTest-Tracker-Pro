import { DEMO_CUSTOMERS, DEMO_SITES } from './demoCustomers.js';

const normalized = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function searchCustomerSites(query, customers = DEMO_CUSTOMERS, sites = DEMO_SITES) {
  const tokens = query.trim().split(/\s+/).map(normalized).filter(Boolean);
  if (query.trim() && !tokens.length) return [];
  const byId = new Map(customers.map(customer => [String(customer.id), customer]));
  return sites.flatMap(site => {
    const customer = byId.get(site.customerId);
    if (!customer) return [];
    const haystack = normalized([customer.customerName, site.name, site.address, site.postcode].join(' '));
    return tokens.every(token => haystack.includes(token)) ? [{ customer, site }] : [];
  });
}
