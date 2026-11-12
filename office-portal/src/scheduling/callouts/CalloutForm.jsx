import { useEffect, useRef } from 'react';
import { CALLOUT_PRIORITIES, equipmentForNature, NATURE_OF_JOB_OPTIONS } from './calloutValidation.js';

export default function CalloutForm({ draft, errors, customer, site, onChange, onChangeSite, onReview, onCancel, onSave, editing = false }) {
  const formRef = useRef(null);
  const focusValidationRef = useRef(false);
  const equipment = equipmentForNature(site, draft.natureOfJob);
  useEffect(() => {
    if (focusValidationRef.current) {
      formRef.current.querySelector('[aria-invalid="true"]')?.focus();
      focusValidationRef.current = false;
    }
  }, [errors]);
  const validation = field => ({ 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `callout-${field}-error` : undefined });
  const error = field => errors[field] && <span className="callout-field-error" id={`callout-${field}-error`}>{errors[field]}</span>;

  return <form ref={formRef} noValidate autoComplete="off" onSubmit={event => { event.preventDefault(); focusValidationRef.current = true; onSave(); }}>
    <div className="callout-selected-site"><dl><div><dt>Customer</dt><dd>{customer.customerName}</dd></div><div><dt>Building/Site</dt><dd>{site.name}</dd></div><div><dt>Site Address</dt><dd>{site.address} · {site.postcode}</dd></div></dl><button type="button" className="schedule-secondary" onClick={onChangeSite}>Change Site</button></div>
    <div className="callout-fields">
      <div><label htmlFor="callout-nature">Nature of Job</label><select id="callout-nature" value={draft.natureOfJob} onChange={event => onChange('natureOfJob', event.target.value)} {...validation('natureOfJob')}>{NATURE_OF_JOB_OPTIONS.map(nature => <option key={nature}>{nature}</option>)}</select>{error('natureOfJob')}</div>
      <div><label htmlFor="callout-priority">Priority</label><select id="callout-priority" value={draft.priority} onChange={event => onChange('priority', event.target.value)} {...validation('priority')}>{CALLOUT_PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}</select>{error('priority')}</div>
      <div className="callout-wide"><label htmlFor="callout-fault">Reported Fault <small>(optional)</small></label><textarea id="callout-fault" rows={3} maxLength={4000} value={draft.reportedFault} onChange={event => onChange('reportedFault', event.target.value)} {...validation('reportedFault')} />{error('reportedFault')}</div>
      <div><label htmlFor="callout-contact">Site Contact Name <small>(optional)</small></label><input id="callout-contact" maxLength={120} value={draft.contactName} onChange={event => onChange('contactName', event.target.value)} {...validation('contactName')} />{error('contactName')}</div>
      <div><label htmlFor="callout-telephone">Site Contact Telephone Number <small>(optional)</small></label><input id="callout-telephone" type="tel" inputMode="tel" maxLength={80} value={draft.contactTelephone} onChange={event => onChange('contactTelephone', event.target.value)} {...validation('contactTelephone')} />{error('contactTelephone')}</div>
      <div className="callout-wide"><label htmlFor="callout-access">Access Instructions <small>(optional)</small></label><textarea id="callout-access" rows={2} maxLength={2000} value={draft.accessInstructions} onChange={event => onChange('accessInstructions', event.target.value)} {...validation('accessInstructions')} />{error('accessInstructions')}</div>
      <div><label htmlFor="callout-equipment">Equipment/System <small>(optional)</small></label><select id="callout-equipment" value={draft.equipmentId} disabled={!equipment.length} onChange={event => onChange('equipmentId', event.target.value)} {...validation('equipmentId')}><option value="">Not known / not selected</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{error('equipmentId')}{!site.equipment.length ? <p className="callout-help">Equipment not yet registered — engineer can add details on site.</p> : !equipment.length && <p className="callout-help">No matching registered equipment for this nature of job. Equipment selection is optional.</p>}</div>
      <div><label htmlFor="callout-duration">Estimated Duration <small>(minutes, optional)</small></label><input id="callout-duration" type="number" min="1" step="1" inputMode="numeric" value={draft.estimatedDuration} onChange={event => onChange('estimatedDuration', event.target.value)} {...validation('estimatedDuration')} /><p className="callout-help">Suggested: 60 minutes (1 hour). Leave blank if unknown.</p>{error('estimatedDuration')}</div>
    </div>
    {Object.values(errors).some(Boolean) && <p role="alert" className="callout-field-error">Check the highlighted fields before reviewing this callout.</p>}
    <div className="callout-actions"><button type="button" className="schedule-secondary" onClick={onCancel}>Cancel</button><button type="button" className="schedule-secondary" onClick={() => { focusValidationRef.current = true; onReview(); }}>Review Callout</button><button type="submit" className="schedule-primary">{editing ? 'Save Job' : 'Create Job'}</button></div>
  </form>;
}
