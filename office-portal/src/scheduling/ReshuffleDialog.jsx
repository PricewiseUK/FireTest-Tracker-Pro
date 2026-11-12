import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { allocationLabel, localParts } from './appointmentTime.js';
import './ReshuffleDialog.css';

export default function ReshuffleDialog({ review, engineers, onCancel, onConfirm, trapFocus }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  const { proposal, error } = review;
  const engineer = id => engineers.find(item => item.id === id)?.name || id || 'Unassigned';
  const label = job => job.engineerId ? `${localParts(job.startAt, job.timeZone).date} · ${allocationLabel(job)} · ${job.timeZone}` : 'Not yet scheduled';
  return createPortal(<div className="schedule-reassign-backdrop">
    <section className="schedule-reassign schedule-reshuffle" role="dialog" aria-modal="true" aria-labelledby="reshuffle-title" onKeyDown={event => { trapFocus(event); if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
      <header><h3 id="reshuffle-title">Reschedule Appointments?</h3></header>
      {error && <p className="schedule-reassign-error" role="alert">{error}</p>}
      {proposal && <>
        <div className="schedule-reassign-job"><strong>Incoming appointment: {proposal.incoming.site}</strong><span>{proposal.incoming.serviceType}</span><span>Original: {engineer(proposal.base.find(job => job.id === proposal.incoming.id).engineerId)} · {label(proposal.base.find(job => job.id === proposal.incoming.id))}</span><span>Requested: {engineer(proposal.incoming.engineerId)} · {label(proposal.incoming)}</span></div>
        {proposal.blocked ? <div className="schedule-reassign-error" role="alert"><strong>Automatic reshuffle blocked</strong><p>{proposal.reason}</p>{proposal.protectedJobs.map(job => <p key={job.id}>{job.site} · {job.status} · {engineer(job.engineerId)} · {label(job)}</p>)}<p>No appointment changes will be applied.</p></div> : <>
          <p>{proposal.changes.length - 1} existing {proposal.changes.length === 2 ? 'appointment' : 'appointments'} affected, plus the incoming appointment.</p>
          <div className="schedule-reshuffle-table" role="region" aria-label="Proposed scheduling changes" tabIndex={0}>
            <table><caption>Entire proposed allocation change</caption><thead><tr><th scope="col">Appointment</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead><tbody>{proposal.changes.map(({ original, proposed }) => <tr key={original.id}><th scope="row">{original.site}<small>{original.jobReference || original.id} · {original.status}</small></th><td>{engineer(original.engineerId)}<span>{label(original)}</span></td><td>{engineer(proposed.engineerId)}<span>{label(proposed)}</span></td></tr>)}</tbody></table>
          </div>
          {proposal.warnings.length > 0 && <div className="schedule-conflicts" role="note" aria-label="Reshuffle warnings"><strong>Review date and working-hours changes</strong><ul>{proposal.warnings.map((warning, index) => <li key={`${warning.jobId}:${index}`}>{warning.message}</li>)}</ul></div>}
          <p>All listed changes apply together after confirmation and are saved in this browser for the local demonstration.</p>
        </>}
      </>}
      <div className="schedule-reassign-actions"><button type="button" ref={cancelRef} className="schedule-secondary" onClick={onCancel}>Cancel</button><button type="button" className="schedule-primary" onClick={onConfirm} disabled={!proposal || proposal.blocked || Boolean(error)}>Confirm Reshuffle</button></div>
    </section>
  </div>, document.body);
}
