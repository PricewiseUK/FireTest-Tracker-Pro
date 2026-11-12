export default function CalloutPreview({ preview, onEdit, onClose, onSave, editing = false }) {
  const rows = [
    ['Customer', preview.customerName], ['Building/Site', preview.siteName], ['Site Address', `${preview.address} · ${preview.postcode}`],
    ['Nature of Job', preview.natureOfJob], ['Reported Fault', preview.reportedFault], ['Site Contact', preview.contactName],
    ['Site Telephone', preview.contactTelephone], ['Access Instructions', preview.accessInstructions], ['Priority', preview.priority],
    ['Equipment/System', preview.equipment?.name || 'No equipment selected'],
    ['Estimated Duration', preview.estimatedDurationMinutes === null ? 'Not specified' : `${preview.estimatedDurationMinutes} minutes`],
  ];
  return <div className="callout-preview">
    <p role="status" className="callout-preview-badge">{editing ? 'Preview of Changes — Not Yet Saved' : 'Preview Only — Job Not Yet Created'}</p>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
    <div className="callout-actions"><button type="button" className="schedule-secondary" onClick={onEdit}>Edit Details</button><button type="button" className="schedule-secondary" onClick={onClose}>Close Preview</button><button type="button" className="schedule-primary" onClick={onSave}>{editing ? 'Save Job' : 'Create Job'}</button></div>
  </div>;
}
