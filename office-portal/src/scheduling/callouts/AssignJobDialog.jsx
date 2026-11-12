import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { allocationLabel } from '../appointmentTime.js';
import { DEMO_ENGINEERS } from '../demoSchedule.js';
import ConflictResolutionActions from '../ConflictResolutionActions.jsx';
import ReshuffleDialog from '../ReshuffleDialog.jsx';

export default function AssignJobDialog({ workflow, trapFocus }) {
  const cancelRef = useRef(null);
  const { assignment: state } = workflow;
  useEffect(() => { cancelRef.current?.focus(); }, [state.proposal, state.reshuffle]);
  if (state.reshuffle) return <ReshuffleDialog review={state.reshuffle} engineers={DEMO_ENGINEERS} onCancel={workflow.cancelAssignment} onConfirm={workflow.confirm} trapFocus={trapFocus} />;
  const { job, proposal } = state;
  const engineer = DEMO_ENGINEERS.find(item => item.id === state.engineerId);
  const proposed = proposal && { ...job, ...proposal, timeZone: job.timeZone };
  return createPortal(<div className="schedule-reassign-backdrop"><section className="schedule-reassign" role="dialog" aria-modal="true" aria-labelledby="assign-job-title" onKeyDown={event => { trapFocus(event); if (event.key === 'Escape') { event.stopPropagation(); workflow.cancelAssignment(); } }}>
    <header><h3 id="assign-job-title">{proposal ? 'Confirm Engineer Assignment' : 'Assign Engineer'}</h3></header>
    <div className="schedule-reassign-job"><strong>{job.jobNumber} — {job.site}</strong><span>{job.serviceType}</span></div>
    {proposal ? <>
      <p>{engineer?.name} · {proposal.date} · {allocationLabel(proposed)} · Europe/London</p>
      <p>Allocated duration: {Math.round((Date.parse(proposal.endAt) - Date.parse(proposal.startAt)) / 60000)} minutes</p>
      {(proposal.endDate !== proposal.date || proposal.start < '07:00' || proposal.end > '18:00' || proposal.end < '07:00') && <p className="schedule-conflicts" role="note">This allocation crosses midnight or extends outside normal working hours. Finish date: {proposal.endDate}.</p>}
      {proposal.conflicts.length > 0 ? <div className="schedule-conflicts" role="alert"><strong>Scheduling overlap detected</strong><ul>{proposal.conflicts.map(conflict => <li key={conflict.id}>{conflict.site} · {allocationLabel(conflict)} · {conflict.status}</li>)}</ul><label><input type="checkbox" checked={state.acknowledged} onChange={event => workflow.changeAssignment('acknowledged', event.target.checked)} />I explicitly acknowledge this overlap.</label></div> : <p>No overlapping appointments were found.</p>}
    </> : <form className="schedule-reassign-fields" id="assign-job-form" onSubmit={event => { event.preventDefault(); workflow.reviewAssignment(); }}>
      <label htmlFor="assign-engineer">Engineer</label><select id="assign-engineer" value={state.engineerId} onChange={event => workflow.changeAssignment('engineerId', event.target.value)}>{DEMO_ENGINEERS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <label htmlFor="assign-date">Date</label><input id="assign-date" type="date" value={state.date} onChange={event => workflow.changeAssignment('date', event.target.value)} />
      <label htmlFor="assign-time">Start time</label><input id="assign-time" type="time" step="900" value={state.start} onChange={event => workflow.changeAssignment('start', event.target.value)} />
      <label htmlFor="assign-duration">Estimated duration (minutes)</label><input id="assign-duration" type="number" min="15" step="1" value={state.duration} onChange={event => workflow.changeAssignment('duration', event.target.value)} />
      <label htmlFor="assign-occurrence">Clock-change occurrence</label><select id="assign-occurrence" value={state.occurrence} onChange={event => workflow.changeAssignment('occurrence', event.target.value)}><option value="reject">Require an unambiguous time</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select>
    </form>}
    {state.error && <p role="alert" className="schedule-reassign-error">{state.error}</p>}
    {proposal?.conflicts.length > 0 ? <ConflictResolutionActions cancelRef={cancelRef} onCancel={workflow.cancelAssignment} onAllowOverlap={workflow.confirm} onReshuffle={workflow.beginReshuffle} acknowledged={state.acknowledged} /> : <div className="schedule-reassign-actions"><button type="button" ref={cancelRef} className="schedule-secondary" onClick={workflow.cancelAssignment}>Cancel</button>{proposal ? <button type="button" className="schedule-primary" onClick={workflow.confirm}>Confirm Assignment</button> : <button type="submit" form="assign-job-form" className="schedule-primary">Review Assignment</button>}</div>}
  </section></div>, document.body);
}
