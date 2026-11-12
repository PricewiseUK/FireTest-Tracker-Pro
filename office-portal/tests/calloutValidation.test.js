import { describe, expect, it } from 'vitest';
import { createCalloutPreview, equipmentForNature, initialCalloutDraft, NATURE_OF_JOB_OPTIONS, validOptionalTelephone, validateCalloutDraft } from '../src/scheduling/callouts/calloutValidation.js';
import { DEMO_CUSTOMERS, DEMO_SITES } from '../src/scheduling/callouts/demoCustomers.js';

const draftFor = (site = DEMO_SITES[0], changes = {}) => ({ ...initialCalloutDraft(), siteId: site.id, ...changes });

describe('callout validation and preview', () => {
  it('requires an existing site/customer association and rejects unknown choices', () => {
    expect(validateCalloutDraft(initialCalloutDraft()).siteId).toBeTruthy();
    expect(validateCalloutDraft(draftFor(), [], DEMO_SITES).siteId).toBeTruthy();
    expect(validateCalloutDraft(draftFor(undefined, { siteId: 'unknown' })).siteId).toBeTruthy();
    const result = createCalloutPreview(draftFor(undefined, { natureOfJob: 'unknown', priority: 'unknown' }));
    expect(result.preview).toBeNull();
    expect(Object.keys(result.errors)).toEqual(['natureOfJob', 'priority']);
  });

  it('accepts all eight natures with no equipment, contact, fault, access or duration', () => {
    expect(NATURE_OF_JOB_OPTIONS).toHaveLength(8);
    for (const natureOfJob of NATURE_OF_JOB_OPTIONS) {
      const { errors, preview } = createCalloutPreview(draftFor(DEMO_SITES[1], { natureOfJob, estimatedDuration: '' }));
      expect(errors).toEqual({});
      expect(preview.equipment).toBeNull();
      expect(preview.estimatedDurationMinutes).toBeNull();
    }
    expect(createCalloutPreview(draftFor()).preview.estimatedDurationMinutes).toBe(60);
  });

  it.each(['', '   ', '01632 960001', '(01632) 960-001', '07700 900123', '+44 (0) 7700 900123', '0044 7700 900123', '01632 960001 ext. 123', '01632 960001 x42'])('accepts optional/UK telephone formatting %s', phone => {
    expect(validOptionalTelephone(phone)).toBe(true);
    expect(validateCalloutDraft(draftFor(undefined, { contactTelephone: phone }))).toEqual({});
  });

  it.each(['call me', '12', '01234567890123456', '01632+960001', '01632 960001 ext. abc'])('rejects malformed telephone %s', phone => {
    expect(validateCalloutDraft(draftFor(undefined, { contactTelephone: phone })).contactTelephone).toBeTruthy();
  });

  it.each(['0', '-1', '1.5', '1e2', 'later', '9007199254740992'])('rejects invalid optional duration %s', estimatedDuration => {
    expect(validateCalloutDraft(draftFor(undefined, { estimatedDuration })).estimatedDuration).toBeTruthy();
  });

  it('offers only registered equipment matching the chosen site/nature and never requires it', () => {
    const site = DEMO_SITES[0];
    expect(equipmentForNature(site, 'Fire Alarm Panel')).toEqual([site.equipment[0]]);
    expect(equipmentForNature(site, 'Fire Doors')).toEqual([]);
    expect(equipmentForNature(site, 'General Callout')).toEqual(site.equipment);
    expect(validateCalloutDraft(draftFor(site, { natureOfJob: 'Fire Doors' }))).toEqual({});
    expect(validateCalloutDraft(draftFor(site, { natureOfJob: 'Fire Doors', equipmentId: site.equipment[0].id })).equipmentId).toBeTruthy();
    expect(validateCalloutDraft(draftFor(DEMO_SITES[1], { equipmentId: site.equipment[0].id })).equipmentId).toBeTruthy();
  });

  it('preserves selected references and contact formatting without modifying permanent records or creating a job', () => {
    const before = JSON.stringify({ DEMO_CUSTOMERS, DEMO_SITES });
    const draft = draftFor(undefined, { contactName: 'Demo Contact', contactTelephone: '+44 (0) 7700 900123', accessInstructions: 'Use side door', reportedFault: ' Panel fault ', priority: 'Emergency', equipmentId: DEMO_SITES[0].equipment[0].id, estimatedDuration: '90' });
    const draftBefore = { ...draft };
    const { preview } = createCalloutPreview(draft);
    expect(preview).toMatchObject({ customerId: DEMO_CUSTOMERS[0].id, siteId: DEMO_SITES[0].id, customerName: DEMO_CUSTOMERS[0].customerName, siteName: DEMO_SITES[0].name, contactName: 'Demo Contact', contactTelephone: '+44 (0) 7700 900123', accessInstructions: 'Use side door', reportedFault: 'Panel fault', priority: 'Emergency', estimatedDurationMinutes: 90 });
    expect(preview.equipment).toBe(DEMO_SITES[0].equipment[0]);
    for (const key of ['id', 'jobNumber', 'jobReference', 'startAt', 'endAt', 'engineerId']) expect(preview).not.toHaveProperty(key);
    expect(JSON.stringify({ DEMO_CUSTOMERS, DEMO_SITES })).toBe(before);
    expect(draft).toEqual(draftBefore);
  });

  it('limits free text with visible validation messages', () => {
    const result = createCalloutPreview(draftFor(undefined, { reportedFault: 'a'.repeat(4001), contactName: 'a'.repeat(121), accessInstructions: 'a'.repeat(2001) }));
    expect(Object.keys(result.errors)).toEqual(['reportedFault', 'contactName', 'accessInstructions']);
    expect(result.preview).toBeNull();
  });
});
