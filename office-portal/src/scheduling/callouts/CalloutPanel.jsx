import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DEMO_CUSTOMERS, DEMO_SITES } from './demoCustomers.js';
import { useCalloutDraft } from './useCalloutDraft.js';
import CustomerSiteSearch from './CustomerSiteSearch.jsx';
import CalloutForm from './CalloutForm.jsx';
import CalloutPreview from './CalloutPreview.jsx';
import './CalloutPanel.css';

export default function CalloutPanel({ onClose, trapFocus, onSave, initialJob = null, onAssign }) {
  const form = useCalloutDraft(onClose, initialJob, onSave);
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const keepEditingRef = useRef(null);
  const site = DEMO_SITES.find(item => item.id === form.draft.siteId);
  const customer = DEMO_CUSTOMERS.find(item => item.id === site?.customerId);
  useEffect(() => {
    const target = form.discarding ? keepEditingRef.current : ['preview', 'saved'].includes(form.step) ? headingRef.current : panelRef.current.querySelector(form.step === 'search' ? '#callout-search' : '#callout-nature');
    target?.focus();
  }, [form.step, form.discarding]);

  return createPortal(<div className="schedule-reassign-backdrop">
    <section className="schedule-reassign callout-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="callout-title" onKeyDown={event => {
      trapFocus(event);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (form.discarding) form.setDiscarding(false); else form.requestClose(); }
    }}>
      <header><div><span>LOCAL DEMONSTRATION</span><h3 id="callout-title" tabIndex={-1} ref={headingRef}>{form.discarding ? 'Discard callout details?' : form.saved ? initialJob ? 'Job Saved' : 'Job Created' : form.step === 'preview' ? 'New Callout Preview' : initialJob ? `Edit Job ${initialJob.jobNumber}` : 'New Callout'}</h3></div><button type="button" aria-label="Close new callout" onClick={form.requestClose}><X size={19} aria-hidden="true" /></button></header>
      <p className="callout-help">Fictional demonstration only. Use no real customer or personal information. Contact names and telephone numbers are kept in memory only and are not saved after refresh.</p>
      {form.saveError && <p role="alert" className="callout-field-error">{form.saveError}</p>}
      {form.discarding ? <><p>Unsaved details will be discarded. Existing jobs will remain unchanged.</p><div className="callout-actions"><button type="button" className="schedule-secondary" ref={keepEditingRef} onClick={() => form.setDiscarding(false)}>Keep Editing</button><button type="button" className="schedule-primary" onClick={onClose}>Discard Details</button></div></> : form.saved ? <><p role="status">{form.saved.jobNumber} — {initialJob ? 'Changes saved' : 'Job created in Unassigned Jobs'} on this browser.</p><div className="callout-actions"><button type="button" className="schedule-secondary" onClick={onClose}>Close</button>{!form.saved.startAt && <button type="button" className="schedule-primary" onClick={() => { onClose(false); onAssign(form.saved); }}>Assign Engineer</button>}</div></> : <>
        {form.step === 'search' && <CustomerSiteSearch query={form.query} onQueryChange={form.setQuery} onSelect={form.selectSite} hasSelection={Boolean(site)} onReturn={() => form.setStep('form')} />}
        {form.step === 'form' && site && customer && <CalloutForm draft={form.draft} errors={form.errors} customer={customer} site={site} onChange={form.change} onChangeSite={() => form.setStep('search')} onReview={form.review} onCancel={form.requestClose} onSave={form.save} editing={Boolean(initialJob)} />}
        {form.step === 'preview' && form.preview && <CalloutPreview preview={form.preview} onEdit={() => form.setStep('form')} onClose={form.requestClose} onSave={form.save} editing={Boolean(initialJob)} />}
      </>}
    </section>
  </div>, document.body);
}
