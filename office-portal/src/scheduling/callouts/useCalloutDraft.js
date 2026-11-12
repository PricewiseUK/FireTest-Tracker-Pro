import { useRef, useState } from 'react';
import { createCalloutPreview, initialCalloutDraft } from './calloutValidation.js';
import { draftFromJob } from './localJobModel.js';

export function useCalloutDraft(onClose, initialJob = null, onSave = null) {
  const [defaults] = useState(() => initialJob ? draftFromJob(initialJob) : initialCalloutDraft());
  const [draft, setDraft] = useState(defaults);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(initialJob ? 'form' : 'search');
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState('');
  const submissionRef = useRef('');
  const savedRef = useRef(false);
  const dirty = Boolean(query.trim()) || Object.keys(defaults).some(key => draft[key] !== defaults[key]);

  function change(field, value) {
    setDraft(current => ({ ...current, [field]: value, ...(field === 'natureOfJob' ? { equipmentId: '' } : {}) }));
    setErrors(current => ({ ...current, [field]: undefined, ...(field === 'natureOfJob' ? { equipmentId: undefined } : {}) }));
  }
  function selectSite(siteId) {
    setDraft(current => ({ ...current, siteId, equipmentId: current.siteId === siteId ? current.equipmentId : '' }));
    setErrors({}); setStep('form');
  }
  function review() {
    const result = createCalloutPreview(draft);
    setErrors(result.errors);
    if (result.preview) { setPreview(result.preview); setStep('preview'); }
  }
  function save() {
    if (savedRef.current) return;
    const result = createCalloutPreview(draft);
    setErrors(result.errors); setSaveError('');
    if (!result.preview) return;
    try {
      savedRef.current = true;
      if (!submissionRef.current) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        submissionRef.current = `local-job-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
      }
      const job = onSave(draft, submissionRef.current);
      setSaved(job); setStep('saved');
    } catch (error) { savedRef.current = false; setSaveError(error.message); }
  }
  function requestClose() { if (!saved && dirty) setDiscarding(true); else onClose(); }
  return { draft, query, setQuery, step, setStep, errors, preview, discarding, setDiscarding, change, selectSite, review, requestClose, save, saved, saveError };
}
