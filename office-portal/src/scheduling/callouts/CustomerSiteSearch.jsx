import { useRef } from 'react';
import { searchCustomerSites } from './customerSearch.js';

export default function CustomerSiteSearch({ query, onQueryChange, onSelect, hasSelection, onReturn }) {
  const listRef = useRef(null);
  const results = searchCustomerSites(query);
  function navigateResults(event) {
    const buttons = [...listRef.current.querySelectorAll('button')];
    const index = buttons.indexOf(event.target);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }
  return <div className="callout-search">
    <label htmlFor="callout-search">Search customer, site or address...</label>
    <input id="callout-search" type="search" autoComplete="off" placeholder="Search customer, site or address..." value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); listRef.current.querySelector('button')?.focus(); }
      if (event.key === 'Enter' && results.length === 1) { event.preventDefault(); onSelect(results[0].site.id); }
    }} />
    <p role="status">{results.length ? `${results.length} fictional sites found` : 'No matching customers or sites.'}</p>
    <ul ref={listRef} className="callout-search-results" aria-label="Customer and site search results" onKeyDown={navigateResults}>
      {results.map(({ customer, site }) => <li key={site.id}><button type="button" onClick={() => onSelect(site.id)}><strong>{customer.customerName}</strong><span>{site.name}</span><small>{site.address} · {site.postcode}</small></button></li>)}
    </ul>
    {hasSelection && <div className="callout-actions"><button type="button" className="schedule-secondary" onClick={onReturn}>Return to Callout Details</button></div>}
  </div>;
}
