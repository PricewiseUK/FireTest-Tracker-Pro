import { DEMO_CUSTOMERS, DEMO_SITES } from './demoCustomers.js';

export const NATURE_OF_JOB_OPTIONS = Object.freeze(['Fire Alarm Panel', 'Fire Alarm Devices', 'Fire Extinguishers', 'Emergency Lighting', 'Fire Doors', 'Fire Stopping', 'Fire Blankets', 'General Callout']);
export const CALLOUT_PRIORITIES = Object.freeze(['Normal', 'Urgent', 'Emergency']);

export function initialCalloutDraft() {
  return { siteId: '', natureOfJob: 'General Callout', reportedFault: '', contactName: '', contactTelephone: '', accessInstructions: '', priority: 'Normal', equipmentId: '', estimatedDuration: '60' };
}

export function equipmentForNature(site, natureOfJob) {
  return site?.equipment.filter(equipment => natureOfJob === 'General Callout' || equipment.natureOfJob === natureOfJob) || [];
}

export function validOptionalTelephone(value) {
  const phone = value.trim();
  if (!phone) return true;
  const match = phone.match(/^((?:\+|00)?[\d\s().-]+?)(?:\s*(?:ext\.?|extension|x|#)\s*\d{1,6})?$/i);
  if (!match) return false;
  const digits = match[1].replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function validateCalloutDraft(draft, customers = DEMO_CUSTOMERS, sites = DEMO_SITES) {
  const errors = {};
  const site = sites.find(item => item.id === draft.siteId);
  if (!site || !customers.some(customer => customer.id === site.customerId)) errors.siteId = 'Select an existing customer and site.';
  if (!NATURE_OF_JOB_OPTIONS.includes(draft.natureOfJob)) errors.natureOfJob = 'Select a nature of job.';
  if (!CALLOUT_PRIORITIES.includes(draft.priority)) errors.priority = 'Select Normal, Urgent or Emergency.';
  if (!validOptionalTelephone(draft.contactTelephone)) errors.contactTelephone = 'Enter a telephone number with 7–15 digits. Spaces, +, brackets, hyphens and extensions are accepted.';
  if (draft.equipmentId && !equipmentForNature(site, draft.natureOfJob).some(item => item.id === draft.equipmentId)) errors.equipmentId = 'Select matching equipment at this site, or leave it unspecified.';
  if (draft.estimatedDuration.trim() && (!/^\d+$/.test(draft.estimatedDuration.trim()) || !Number.isSafeInteger(Number(draft.estimatedDuration)) || Number(draft.estimatedDuration) <= 0)) errors.estimatedDuration = 'Enter a positive number of minutes, or leave the estimate blank.';
  for (const [field, limit] of Object.entries({ reportedFault: 4000, contactName: 120, accessInstructions: 2000 })) {
    if (draft[field].length > limit) errors[field] = `Use ${limit} characters or fewer.`;
  }
  return errors;
}

export function createCalloutPreview(draft, customers = DEMO_CUSTOMERS, sites = DEMO_SITES) {
  const errors = validateCalloutDraft(draft, customers, sites);
  if (Object.keys(errors).length) return { errors, preview: null };
  const site = sites.find(item => item.id === draft.siteId);
  const customer = customers.find(item => item.id === site.customerId);
  return { errors, preview: {
    customerId: customer.id, siteId: site.id, customerName: customer.customerName,
    siteName: site.name, address: site.address, postcode: site.postcode,
    natureOfJob: draft.natureOfJob, reportedFault: draft.reportedFault.trim(),
    contactName: draft.contactName.trim(), contactTelephone: draft.contactTelephone.trim(),
    accessInstructions: draft.accessInstructions.trim(), priority: draft.priority,
    equipment: site.equipment.find(item => item.id === draft.equipmentId) || null,
    estimatedDurationMinutes: draft.estimatedDuration.trim() ? Number(draft.estimatedDuration) : null,
  } };
}
