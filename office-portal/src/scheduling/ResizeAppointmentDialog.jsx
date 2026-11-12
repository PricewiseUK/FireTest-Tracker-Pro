import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { allocationLabel, withAppointmentTimes } from './appointmentTime.js';
import { allocatedDuration } from './scheduleResize.js';
import ConflictResolutionActions from './ConflictResolutionActions.jsx';

export default function ResizeAppointmentDialog({ engineerName, trapDialogFocus, onReshuffle, state, onEndChange, onDateChange, onOccurrenceChange, onReview, onAcknowledge, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, [state.stage]);
  const { job, proposal } = state;
  return createPortal(<div className="schedule-reassign-backdrop">
    <section className="schedule-reassign" role="dialog" aria-modal="true" aria-labelledby="resize-title" onKeyDown={event => { trapDialogFocus(event); if (event.key === 'Escape') onCancel(); }}>
      <header><h3 id="resize-title">{proposal ? 'Update allocated appointment time?' : 'Adjust Duration'}</h3></header>
      <div className="schedule-reassign-job"><strong>{job.serviceType}</strong><span>{job.site}</span><span>Engineer: {engineerName(job.engineerId)}</span></div>
      <p>Previous: {allocationLabel(job)}</p>
      {!proposal ? <><label htmlFor="resize-date">Finish date</label><input id="resize-date" type="date" value={state.endDate} onChange={event => onDateChange(event.target.value)} /><label htmlFor="resize-end">Finish time</label><input id="resize-end" type="time" step="900" value={state.end} onChange={event => onEndChange(event.target.value)} /><label htmlFor="resize-occurrence">Clock-change occurrence</label><select id="resize-occurrence" value={state.occurrence} onChange={event => onOccurrenceChange(event.target.value)}><option value="reject">Require an unambiguous time</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select><p>Times use {job.timeZone}. Choose a finish date and time in 15-minute increments.</p></> : <><p>New: {allocationLabel(withAppointmentTimes(job, { endAt: proposal.endAt }))}</p><p>Allocated duration: {allocatedDuration(withAppointmentTimes(job, { endAt: proposal.endAt }))}</p>
        {proposal.conflicts.length > 0 && <div className="schedule-conflicts" role="alert"><strong>Overlapping appointments</strong><ul>{proposal.conflicts.map(conflict => <li key={conflict.id}><strong>{conflict.site}</strong><span>{allocationLabel(conflict)} · {conflict.serviceType}</span></li>)}</ul><label><input type="checkbox" checked={state.acknowledged} onChange={event => onAcknowledge(event.target.checked)} />I explicitly confirm this overlap.</label></div>}
      </>}
      {state.error && <p role="alert" className="schedule-reassign-error">{state.error}</p>}
      {proposal?.conflicts.length > 0 ? <ConflictResolutionActions cancelRef={cancelRef} onCancel={onCancel} onAllowOverlap={onConfirm} onReshuffle={onReshuffle} acknowledged={state.acknowledged} /> : <div className="schedule-reassign-actions"><button type="button" ref={cancelRef} className="schedule-secondary" onClick={onCancel}>Cancel</button>{proposal ? <button type="button" className="schedule-primary" onClick={onConfirm}>Confirm Change</button> : <button type="button" className="schedule-primary" onClick={onReview}>Review Change</button>}</div>}
    </section>
  </div>, document.body);
}
