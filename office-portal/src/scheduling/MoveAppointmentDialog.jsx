import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { allocatedDuration } from './scheduleResize.js';
import { moveTimes } from './scheduleMove.js';
import { allocationLabel, withAppointmentTimes } from './appointmentTime.js';
import ConflictResolutionActions from './ConflictResolutionActions.jsx';

export default function MoveAppointmentDialog({ state, engineers, onChange, onReview, onAcknowledge, onCancel, onConfirm, onReshuffle }) {
  const cancelRef = useRef(null);
  const { job, proposal } = state;
  useEffect(() => { cancelRef.current?.focus(); }, [proposal]);
  const name = id => engineers.find(engineer => engineer.id === id)?.name;
  let end = '';
  try { const moved = moveTimes(job, state.start, state.date, state.occurrence); end = moved.endDate === state.date ? moved.end : `${moved.endDate} ${moved.end}`; } catch { /* Validation is shown on review. */ }
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), select, input')];
    const target = event.shiftKey ? controls.at(-1) : controls[0];
    if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) { event.preventDefault(); target?.focus(); }
  }
  return createPortal(<div className="schedule-reassign-backdrop"><section className="schedule-reassign" role="dialog" aria-modal="true" aria-labelledby="move-title" onKeyDown={onKeyDown}>
    <header><h3 id="move-title">{proposal ? 'Move Appointment?' : 'Move/Reassign Appointment'}</h3></header>
    <div className="schedule-reassign-job"><strong>{job.site}</strong><span>{job.serviceType}</span><span>Allocated duration: {allocatedDuration(job)}</span></div>
    <p>From: {name(job.engineerId)} — {allocationLabel(job)}</p>
    {proposal ? <>
      <p>To: {name(proposal.engineerId)} — {allocationLabel(withAppointmentTimes(job, proposal))}</p>
      <p>Start date: {proposal.date} · Finish date: {proposal.endDate} · {job.timeZone}</p>
      {proposal.conflicts.length > 0 && <div className="schedule-conflicts" role="alert"><strong>Overlapping appointments</strong><ul>{proposal.conflicts.map(conflict => <li key={conflict.id}><strong>{conflict.site}</strong><span>{conflict.start}–{conflict.end} · {conflict.serviceType}</span></li>)}</ul><label><input type="checkbox" checked={state.acknowledged} onChange={event => onAcknowledge(event.target.checked)} />I explicitly acknowledge this overlap.</label></div>}
    </> : <div className="schedule-reassign-fields">
      <label htmlFor="move-engineer">Engineer</label><select id="move-engineer" value={state.engineerId} onChange={event => onChange('engineerId', event.target.value)}>{engineers.map(engineer => <option key={engineer.id} value={engineer.id}>{engineer.name}</option>)}</select>
      <label htmlFor="move-start">Start time</label><input type="time" id="move-start" step="900" value={state.start} onChange={event => onChange('start', event.target.value)} />
      <label htmlFor="move-date">Start date</label><input type="date" id="move-date" value={state.date} onChange={event => onChange('date', event.target.value)} />
      <label htmlFor="move-occurrence">Clock-change occurrence</label><select id="move-occurrence" value={state.occurrence} onChange={event => onChange('occurrence', event.target.value)}><option value="reject">Require an unambiguous time</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select>
      <span>Calculated finish</span><output>{end || 'Choose a valid start time'}</output>
      <span>Timezone</span><span>{job.timeZone}</span>
    </div>}
    {state.error && <p role="alert" className="schedule-reassign-error">{state.error}</p>}
    {proposal?.conflicts.length > 0 ? <ConflictResolutionActions cancelRef={cancelRef} onCancel={onCancel} onAllowOverlap={onConfirm} onReshuffle={onReshuffle} acknowledged={state.acknowledged} /> : <div className="schedule-reassign-actions"><button type="button" className="schedule-secondary" ref={cancelRef} onClick={onCancel}>Cancel</button>{proposal ? <button type="button" className="schedule-primary" onClick={onConfirm}>Confirm Move</button> : <button type="button" className="schedule-primary" onClick={onReview}>Review Move</button>}</div>}
  </section></div>, document.body);
}
