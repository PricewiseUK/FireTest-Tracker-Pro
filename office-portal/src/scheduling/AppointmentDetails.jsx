import { createPortal } from 'react-dom';
import { MoveRight, X } from 'lucide-react';
import { allocationLabel, calendarDay } from './appointmentTime.js';
import { allocatedDuration } from './scheduleResize.js';

export default function AppointmentDetails({ selection, closeButtonRef, onClose, onReassign, onAdjustDuration, onMove, onEdit, trapFocus }) {
  if (!selection) return null;
  const { job, engineer } = selection;
  const scheduled = Boolean(job.startAt);
  const status = job.status.toLowerCase().replaceAll(' ', '-');
  const fields = [
    ...(job.jobNumber ? [['Job Number', job.jobNumber]] : []),
    ['Customer', job.customer], ['Building / site', job.site],
    ['Engineer', engineer?.name || 'Unassigned'], ['Service type', job.serviceType],
    ...(job.localDemo ? [['Site Address', `${job.address} · ${job.postcode}`], ['Nature of Job', job.natureOfJob], ['Reported Fault', job.reportedFault || 'Not provided'], ['Priority', job.priority], ['Site Contact', job.contactName || 'Not provided (session only)'], ['Contact Telephone', job.contactTelephone || 'Not provided (session only)'], ['Access Instructions', job.accessInstructions || 'Not provided'], ['Equipment/System', job.equipment?.name || 'Not selected']] : []),
    ...(scheduled ? [['Appointment date', `${calendarDay(job.date).day} ${calendarDay(job.date).dateLabel} ${job.date.slice(0, 4)}`], ['Scheduled time', allocationLabel(job)], ['Timezone', job.timeZone], ['Allocated duration', allocatedDuration(job)]] : [['Scheduled Date and Time', 'Unassigned']]),
    ...(job.flag ? [['Job flag', job.flag]] : []),
  ];
  if (job.localDemo && job.originalReportedFault !== job.reportedFault) fields.push(['Original caller fault report', job.originalReportedFault || 'Not provided']);
  return createPortal(<div className="schedule-details-backdrop"><section className="schedule-details" role="dialog" aria-modal="true" aria-labelledby="schedule-details-title" onKeyDown={trapFocus}>
    <header><div><span>{job.localDemo ? 'LOCAL DEMONSTRATION JOB' : 'READ-ONLY APPOINTMENT'}</span><h3 id="schedule-details-title">{job.site}</h3></div><button type="button" ref={closeButtonRef} onClick={onClose} aria-label="Close appointment details"><X size={19} aria-hidden="true" /></button></header>
    <div className="schedule-details-status"><i className={`schedule-dot status-${status}`} aria-hidden="true" />{job.status}</div>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{value}</dd></div>)}</dl>
    <p>{scheduled ? 'Allocated time can be adjusted for this local demonstration.' : 'Assign an engineer to place this job on the calendar.'}</p>
    <div className="schedule-details-actions"><button type="button" className="schedule-secondary" onClick={onClose}>Close</button>
      {job.localDemo && <button type="button" className="schedule-secondary" onClick={() => onEdit(job)}>Edit Job</button>}
      {scheduled && <><button type="button" className="schedule-secondary" onClick={() => onAdjustDuration(job)}>Adjust Duration</button><button type="button" className="schedule-secondary" onClick={() => onMove(job)}>Move/Reassign Appointment</button>{onReassign && <button type="button" className="schedule-primary" onClick={() => onReassign(job)}><MoveRight size={16} aria-hidden="true" />Reassign appointment</button>}</>}
    </div>
  </section></div>, document.body);
}
