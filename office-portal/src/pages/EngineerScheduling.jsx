import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Expand, Hand, Minimize2, MoveRight, Users, X } from 'lucide-react';
import { APPOINTMENT_STATUSES, appointmentsForCell, DEMO_ENGINEERS, SCHEDULING_WEEK } from '../scheduling/demoSchedule.js';
import { applyReassignment, createReassignmentProposal } from '../scheduling/scheduleReassignment.js';
import { assignOverlapLanes, positionAppointment, timelineRange } from '../scheduling/timelineLayout.js';
import { addDays, allocationLabel, axisLabel, calendarDay, calendarWeek, daySegment, localParts, occursOnDay, withAppointmentTimes } from '../scheduling/appointmentTime.js';
import { allocatedDuration, applyResize, createResizeProposal, resizeEndFromPixels } from '../scheduling/scheduleResize.js';
import { applyMove, createMoveProposal } from '../scheduling/scheduleMove.js';
import { useTimelineMove } from '../scheduling/useTimelineMove.js';
import { usePlannerFullscreen } from '../scheduling/usePlannerFullscreen.js';
import MoveAppointmentDialog from '../scheduling/MoveAppointmentDialog.jsx';
import ResizeDialog from '../scheduling/ResizeAppointmentDialog.jsx';
import ConflictResolutionActions from '../scheduling/ConflictResolutionActions.jsx';
import ReshuffleDialog from '../scheduling/ReshuffleDialog.jsx';
import { useScheduleReshuffle } from '../scheduling/useScheduleReshuffle.js';
import NewCallout from '../scheduling/callouts/NewCallout.jsx';
import AppointmentDetails from '../scheduling/AppointmentDetails.jsx';
import { useLocalSchedule } from '../scheduling/callouts/useLocalSchedule.js';
import { UNASSIGNED_DRAG_TYPE, useJobWorkspace } from '../scheduling/callouts/useJobWorkspace.js';
import UnassignedJobs from '../scheduling/callouts/UnassignedJobs.jsx';
import JobWorkspaceDialogs from '../scheduling/callouts/JobWorkspaceDialogs.jsx';
import './EngineerScheduling.css';
import '../scheduling/PlannerFullscreen.css';

const statusClass = status => status.toLowerCase().replaceAll(' ', '-');
const cellKey = (engineerId, isoDate) => `${engineerId}:${isoDate}`;
const engineerName = id => DEMO_ENGINEERS.find(engineer => engineer.id === id)?.name || 'Unknown engineer';
const dayFor = calendarDay;
const DENSITY_HEIGHTS = { compact: 15, comfortable: 20 };

function trapDialogFocus(event) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
  if (!controls.length) return;
  const first = controls[0];
  const last = controls.at(-1);
  const focusOutsideControls = !controls.includes(document.activeElement);
  if (event.shiftKey && (document.activeElement === first || focusOutsideControls)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || focusOutsideControls)) { event.preventDefault(); first.focus(); }
}

function AppointmentPreview({ preview, position, tooltipRef }) {
  if (!preview) return null;
  const { job, engineer, day } = preview;
  return createPortal(
    <aside className="schedule-preview" id={`schedule-preview-${job.id}`} ref={tooltipRef} role="tooltip" style={{ left: position.left, top: position.top }}>
      <span className="schedule-preview-label">APPOINTMENT PREVIEW</span>
      <strong>{job.customer}</strong><span>{job.site}</span>
      <dl>
        <div><dt>Service</dt><dd>{job.serviceType}</dd></div>
        <div><dt>Time</dt><dd>{day.shortDay} {day.dateLabel}, {allocationLabel(job)}</dd></div>
        <div><dt>Status</dt><dd><i className={`schedule-dot status-${statusClass(job.status)}`} aria-hidden="true" />{job.status}</dd></div>
        <div><dt>Engineer</dt><dd>{engineer.name}</dd></div>
        {job.flag && <div><dt>Job flag</dt><dd>{job.flag}</dd></div>}
      </dl>
    </aside>,
    document.body,
  );
}

function ReassignmentDialog({ onReshuffle, week, state, onDestinationChange, onReview, onAcknowledge, onCancel, onConfirm }) {
  if (!state) return null;
  const job = state.proposal?.job || state.job;
  const sourceDay = dayFor(job.date);
  const sourceEngineer = engineerName(job.engineerId);
  const targetDay = dayFor(state.targetDate);
  const targetEngineer = engineerName(state.targetEngineerId);
  const conflicts = state.proposal?.conflicts || [];

  return createPortal(
    <div className="schedule-reassign-backdrop">
      <section className="schedule-reassign" role="dialog" aria-modal="true" aria-labelledby="schedule-reassign-title" onKeyDown={trapDialogFocus}>
        <header><div><span>LOCAL DEMONSTRATION</span><h3 id="schedule-reassign-title">{state.stage === 'choose' ? 'Choose a new assignment' : 'Reassign appointment?'}</h3></div><button type="button" onClick={onCancel} aria-label="Cancel reassignment"><X size={19} aria-hidden="true" /></button></header>

        <div className="schedule-reassign-job"><strong>{job.serviceType}</strong><span>{job.customer} · {job.site}</span><small>{job.start}–{job.end} · {job.jobReference}</small></div>

        {state.stage === 'choose' ? <>
          <div className="schedule-reassign-fields">
            <label htmlFor="reassign-engineer">Engineer</label>
            <select id="reassign-engineer" value={state.targetEngineerId} onChange={event => onDestinationChange('targetEngineerId', event.target.value)} autoFocus>
              {DEMO_ENGINEERS.map(engineer => <option key={engineer.id} value={engineer.id}>{engineer.name}</option>)}
            </select>
            <label htmlFor="reassign-date">Day</label>
            <select id="reassign-date" value={state.targetDate} onChange={event => onDestinationChange('targetDate', event.target.value)}>
              {week.map(day => <option key={day.isoDate} value={day.isoDate}>{day.day} {day.dateLabel}</option>)}
            </select>
          </div>
          {state.error && <p className="schedule-reassign-error" role="alert">{state.error}</p>}
          <div className="schedule-reassign-actions"><button type="button" className="schedule-secondary" onClick={onCancel}>Cancel</button><button type="button" className="schedule-primary" onClick={onReview}>Review reassignment</button></div>
        </> : <>
          <dl className="schedule-reassign-route">
            <div><dt>From</dt><dd>{sourceEngineer}<span>{sourceDay.day} {sourceDay.dateLabel}</span></dd></div>
            <div aria-hidden="true"><MoveRight size={19} /></div>
            <div><dt>To</dt><dd>{targetEngineer}<span>{targetDay.day} {targetDay.dateLabel}</span></dd></div>
          </dl>

          {conflicts.length > 0 && <div className="schedule-conflicts" role="alert"><strong>Scheduling overlap detected</strong><p>This appointment overlaps {conflicts.length} existing {conflicts.length === 1 ? 'appointment' : 'appointments'}:</p><ul>{conflicts.map(conflict => <li key={conflict.id}><span>{allocationLabel(conflict)}</span><strong>{conflict.serviceType}</strong><small>{conflict.site}</small></li>)}</ul><label><input type="checkbox" checked={state.overlapAcknowledged} onChange={event => onAcknowledge(event.target.checked)} />I understand this will create an overlapping appointment.</label></div>}
          {!conflicts.length && <p className="schedule-no-conflict">No overlapping appointments were found for the destination engineer.</p>}
          <p className="schedule-local-note">Confirmed changes are saved in this browser for the local demonstration.</p>
          {state.error && <p role="alert" className="schedule-reassign-error">{state.error}</p>}
          {conflicts.length > 0 ? <ConflictResolutionActions onCancel={onCancel} onAllowOverlap={onConfirm} onReshuffle={onReshuffle} acknowledged={state.overlapAcknowledged} autoFocusCancel /> : <div className="schedule-reassign-actions"><button type="button" className="schedule-secondary" onClick={onCancel} autoFocus>Cancel</button><button type="button" className="schedule-primary" onClick={onConfirm}>Confirm Reassignment</button></div>}
        </>}
      </section>
    </div>,
    document.body,
  );
}

function DailyTimeline({ appointments, selectedDate, density, selectedEngineerId, onEngineerChange, onOpenDetails, onResize, onAdjustDuration, onMove, fullDay, onFullDayChange, onUnassignedDrop }) {
  const [resizing, setResizing] = useState(null);
  const [touchMove, setTouchMove] = useState(false);
  const scrollRef = useRef(null);
  const gestureRef = useRef(null);
  const isResizing = Boolean(resizing);
  const day = dayFor(selectedDate);
  const dayAppointments = appointments.filter(job => occursOnDay(job, selectedDate));
  const baseRange = timelineRange(dayAppointments, selectedDate, fullDay);
  const quarterHeight = DENSITY_HEIGHTS[density];
  const { moving, beginMove, openOnClick, pending } = useTimelineMove({ scrollRef, quarterHeight, rangeStart: baseRange.start, onMove, touchMove, selectedDate });
  const previewRange = timelineRange(resizing ? [...dayAppointments, withAppointmentTimes(resizing.job, { endAt: resizing.end })] : moving && !moving.error ? [...dayAppointments, withAppointmentTimes(moving.job, moving)] : dayAppointments, selectedDate, fullDay);
  const range = { start: baseRange.start, end: previewRange.end };
  const timelineHeight = ((range.end - range.start) / 15) * quarterHeight;
  const hours = Array.from({ length: ((range.end - range.start) / 60) + 1 }, (_, index) => range.start + (index * 60));
  const halfHours = Array.from({ length: (range.end - range.start) / 30 }, (_, index) => range.start + ((index + 1) * 30));

  useEffect(() => {
    if (!isResizing) return undefined;
    const gesture = gestureRef.current;
    function update() {
      gesture.end = resizeEndFromPixels(gesture.job, gesture.lastY - gesture.startY + scrollRef.current.scrollTop - gesture.scrollTop, gesture.quarterHeight);
      setResizing({ job: gesture.job, end: gesture.end });
    }
    const move = event => { if (event.pointerId === gesture.pointerId) { event.preventDefault(); gesture.lastY = event.clientY; update(); } };
    const cancel = () => { gestureRef.current = null; setResizing(null); };
    const up = event => {
      if (event.pointerId !== gesture.pointerId) return;
      gesture.lastY = event.clientY;
      update();
      cancel();
      if (gesture.end !== gesture.job.endAt) onResize(gesture.job, gesture.end, gesture.handle);
    };
    const key = event => { if (event.key === 'Escape') cancel(); };
    const scroller = scrollRef.current;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    scroller.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      scroller.removeEventListener('scroll', update);
    };
  }, [isResizing, onResize]);

  function beginResize(event, job) {
    if (event.button !== 0 || gestureRef.current || pending) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gestureRef.current = { job, pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, scrollTop: scrollRef.current.scrollTop, quarterHeight, end: job.endAt, handle: event.currentTarget };
    setResizing({ job, end: job.endAt });
  }

  return <div className={`daily-planner density-${density} ${touchMove ? 'touch-move-enabled' : ''}`} data-planner-interaction={pending || isResizing}>
    <div className="daily-planner-controls">
      <button type="button" className="daily-planner-toggle" aria-pressed={fullDay} disabled={pending || isResizing} onClick={() => onFullDayChange(!fullDay)}><Clock size={14} aria-hidden="true" /><span>Full Day {fullDay ? 'ON' : 'OFF'}</span></button>
      <button type="button" className="daily-planner-toggle" aria-pressed={touchMove} title={touchMove ? 'Touch dragging enabled. Turn off to swipe-scroll appointments.' : 'Enable to drag appointments with a finger. When off, swipes scroll.'} onClick={() => setTouchMove(current => !current)}><Hand size={14} aria-hidden="true" /><span>Touch Drag {touchMove ? 'ON' : 'OFF'}</span></button>
      <span className="daily-planner-instruction">Drag appointments to reschedule.</span>
    </div>
    <div className="daily-mobile-selector">
      <label htmlFor="daily-engineer">Engineer</label>
      <select id="daily-engineer" value={selectedEngineerId} onChange={event => onEngineerChange(event.target.value)}>
        {DEMO_ENGINEERS.map(engineer => <option key={engineer.id} value={engineer.id}>{engineer.name}</option>)}
      </select>
    </div>
    {resizing && <p className="schedule-resize-preview" role="status">Proposed finish: {localParts(resizing.end, resizing.job.timeZone).date} {localParts(resizing.end, resizing.job.timeZone).time} · Allocated duration: {allocatedDuration(withAppointmentTimes(resizing.job, { endAt: resizing.end }))}</p>}
    {moving && <p className={`schedule-resize-preview ${moving.error ? 'is-invalid' : ''}`} role="status">{moving.error || `Proposed: ${engineerName(moving.engineerId)} · ${allocationLabel(withAppointmentTimes(moving.job, moving))}`}</p>}
    <div className="daily-scroll" ref={scrollRef} role="region" aria-label={`Daily engineer timeline for ${day.day} ${day.dateLabel}`} tabIndex={0} onDragOver={event => { if ([...event.dataTransfer.types].includes(UNASSIGNED_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => { if (event.dataTransfer.getData(UNASSIGNED_DRAG_TYPE)) onUnassignedDrop(event, scrollRef.current, selectedDate, range.start, quarterHeight); }}>
      <div className="daily-grid" style={{ gridTemplateRows: `58px ${timelineHeight}px` }}>
        <div className="daily-corner">Time</div>
        {DEMO_ENGINEERS.map(engineer => <div className="daily-engineer-heading" data-engineer={engineer.id} data-selected={engineer.id === selectedEngineerId} key={engineer.id}><span className="schedule-avatar" aria-hidden="true">{engineer.initials}</span><span><strong>{engineer.name}</strong><small>{appointmentsForCell(engineer.id, selectedDate, appointments).length} jobs</small></span></div>)}
        <div className="daily-times" style={{ height: timelineHeight }}>
          {hours.map(hour => <span key={hour} style={{ top: ((hour - range.start) / 15) * quarterHeight }}>{axisLabel(selectedDate, hour)}</span>)}
        </div>
        {DEMO_ENGINEERS.map(engineer => {
          const placed = assignOverlapLanes(appointmentsForCell(engineer.id, selectedDate, appointments), selectedDate);
          return <div className={`daily-column ${moving?.engineerId === engineer.id && !moving.error ? 'daily-move-target' : ''}`} data-engineer={engineer.id} data-selected={engineer.id === selectedEngineerId} aria-label={`${engineer.name} appointments`} key={engineer.id} style={{ height: timelineHeight }}>
            {hours.slice(0, -1).map(hour => <i className="daily-hour-guide" aria-hidden="true" key={hour} style={{ top: ((hour - range.start) / 15) * quarterHeight }} />)}
            {halfHours.filter(value => value % 60 !== 0).map(value => <i className="daily-half-hour-guide" aria-hidden="true" key={value} style={{ top: ((value - range.start) / 15) * quarterHeight }} />)}
            {moving?.engineerId === engineer.id && !moving.error && <div className="daily-move-ghost" aria-hidden="true" style={{ top: positionAppointment(moving, range.start, quarterHeight, selectedDate).top, height: positionAppointment(moving, range.start, quarterHeight, selectedDate).height }}><strong>{moving.job.site}</strong><span>{moving.start}–{moving.end}</span></div>}
            {placed.map(({ job, lane, laneCount }) => {
              const displayJob = resizing?.job.id === job.id ? withAppointmentTimes(job, { endAt: resizing.end }) : job;
              const segment = daySegment(displayJob, selectedDate);
              const position = positionAppointment(displayJob, range.start, quarterHeight, selectedDate);
              const laneWidth = 100 / laneCount;
              return <div className={`daily-job status-${statusClass(job.status)}`} key={job.id} data-job-id={job.id} data-start-minute={position.startMinutes} data-duration-minute={position.durationMinutes} style={{ top: position.top, height: position.height, left: `calc(${lane * laneWidth}% + 2px)`, width: `calc(${laneWidth}% - 4px)` }}>
                <button type="button" className={`daily-job-content ${moving?.job.id === job.id ? 'is-moving' : ''}`} data-job-id={job.id} aria-label={`View ${job.start} to ${job.end} ${job.serviceType} at ${job.site}, ${job.status}`} onPointerDown={event => { if (!resizing) beginMove(event, job); }} onClick={event => openOnClick(event, () => onOpenDetails(job, engineer, day, event.currentTarget))}>
                {job.jobNumber && <span className="daily-job-time">{job.jobNumber}</span>}<span className="daily-job-time">{segment.continuesBefore ? '← ' : ''}{job.start}-{displayJob.end}{segment.continuesAfter ? ' →' : ''}</span>
                {(segment.continuesBefore || segment.continuesAfter) && <span className="schedule-continuation">{segment.continuesBefore ? 'Continues from previous date' : 'Continues on next date'}</span>}
                <strong>{job.site}</strong>
                <span className="daily-job-service">{job.serviceType}</span>
                <span className="daily-job-status">{job.status}</span>
                </button>
                {(!segment.continuesAfter || resizing?.job.id === job.id) && <button type="button" className="daily-resize-handle" aria-label={`Adjust duration for ${job.site} at ${job.start}`} title="Drag to resize; press Enter for exact finish time" onPointerDown={event => beginResize(event, job)} onClick={event => { event.stopPropagation(); if (event.detail === 0) onAdjustDuration(job, event.currentTarget); }}><span aria-hidden="true" /></button>}
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

export default function EngineerScheduling() {
  const { isFullscreen, toggleFullscreen, buttonRef: fullscreenButtonRef } = usePlannerFullscreen();
  const store = useLocalSchedule();
  const { appointments, setAppointments } = store;
  const [expandedCells, setExpandedCells] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ left: 8, top: 8 });
  const [selection, setSelection] = useState(null);
  const [reassignment, setReassignment] = useState(null);
  const [draggedJobId, setDraggedJobId] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const [notice, setNotice] = useState('');
  const [resizeReview, setResizeReview] = useState(null);
  const [moveReview, setMoveReview] = useState(null);
  const [view, setView] = useState('weekly');
  const [selectedDate, setSelectedDate] = useState(SCHEDULING_WEEK[0].isoDate);
  const displayedWeek = calendarWeek(selectedDate);
  const [density, setDensity] = useState('compact');
  const [fullDay, setFullDay] = useState(false);
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  const [selectedEngineerId, setSelectedEngineerId] = useState(DEMO_ENGINEERS[0].id);
  const tooltipRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastTriggerRef = useRef(null);
  const noticeRef = useRef(null);
  const suppressClickRef = useRef(false);
  const workflow = useJobWorkspace({ store, selectedDate, onAssigned: job => {
    setSelectedEngineerId(job.engineerId); setSelectedDate(job.date);
    setExpandedCells(current => new Set(current).add(cellKey(job.engineerId, job.date)));
    setNotice(`${job.jobNumber} assigned to ${engineerName(job.engineerId)}. Saved in this browser only.`);
  } });
  const reshuffle = useScheduleReshuffle({
    appointments, setAppointments,
    onOpen: () => { setMoveReview(null); setResizeReview(null); setReassignment(null); },
    onApplied: proposal => {
      setSelectedEngineerId(proposal.incoming.engineerId);
      setSelectedDate(proposal.incoming.date);
      setExpandedCells(current => new Set([...current, ...proposal.changes.map(change => cellKey(change.proposed.engineerId, change.proposed.date))]));
    },
  });

  useLayoutEffect(() => {
    if (!preview || !tooltipRef.current) return;
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const anchor = preview.anchorRect;
    const gap = 10;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - tooltip.width - 8));
    const below = anchor.bottom + gap + tooltip.height <= window.innerHeight - 8;
    const top = below ? anchor.bottom + gap : Math.max(8, Math.min(anchor.top - tooltip.height - gap, window.innerHeight - tooltip.height - 8));
    setPreviewPosition({ left, top });
  }, [preview]);

  useEffect(() => {
    if (!preview) return undefined;
    const closePreview = () => setPreview(null);
    window.addEventListener('resize', closePreview);
    document.addEventListener('scroll', closePreview, true);
    return () => { window.removeEventListener('resize', closePreview); document.removeEventListener('scroll', closePreview, true); };
  }, [preview]);

  useEffect(() => { if (selection) closeButtonRef.current?.focus(); else if (!reassignment && !resizeReview && !moveReview && !reshuffle.review && !workflow.editing && !workflow.assignment && !workflow.deleting) lastTriggerRef.current?.focus(); }, [selection, reassignment, resizeReview, moveReview, reshuffle.review, workflow.editing, workflow.assignment, workflow.deleting]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);
  useEffect(() => {
    if (!selection && !reassignment) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') { setSelection(null); setReassignment(null); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selection, reassignment]);

  function showPreview(job, engineer, day, target) {
    if (draggedJobId || reassignment) return;
    const anchorRect = target.getBoundingClientRect();
    setPreviewPosition({ left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 296)), top: Math.min(window.innerHeight - 8, anchorRect.bottom + 10) });
    setPreview({ job, engineer, day, anchorRect });
  }
  function hidePreview(jobId) { setPreview(current => current?.job.id === jobId ? null : current); }
  function openDetails(job, engineer, day, trigger) { lastTriggerRef.current = trigger; setPreview(null); setSelection({ job, engineer, day }); }
  function toggleCell(key) { setExpandedCells(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }

  function beginMovement(job) {
    setSelection(null);
    setPreview(null);
    setMoveReview({ job, engineerId: job.engineerId, start: job.start, date: job.date, occurrence: 'reject', proposal: null, acknowledged: false, error: '' });
  }

  function reviewMovement(job, engineerId, start, trigger, date = job.date, occurrence = 'reject', exactStartAt) {
    if (trigger) lastTriggerRef.current = trigger;
    try {
      const proposal = createMoveProposal(appointments, job.id, engineerId, start, DEMO_ENGINEERS, date, occurrence, exactStartAt);
      setMoveReview({ job, engineerId, start, date, occurrence, proposal, acknowledged: false, error: '' });
    } catch (error) {
      setMoveReview({ job, engineerId, start, date, occurrence, proposal: null, acknowledged: false, error: error.message });
    }
  }

  function confirmMovement() {
    try {
      setAppointments(applyMove(appointments, moveReview.proposal, DEMO_ENGINEERS, moveReview.acknowledged));
      setSelectedEngineerId(moveReview.proposal.engineerId);
      setSelectedDate(moveReview.proposal.date);
      setExpandedCells(current => new Set(current).add(cellKey(moveReview.proposal.engineerId, moveReview.proposal.date)));
      const jobId = moveReview.job.id;
      setMoveReview(null);
      requestAnimationFrame(() => {
        const trigger = document.querySelector(`button[data-job-id="${jobId}"]`);
        if (trigger instanceof HTMLElement) trigger.focus();
      });
    } catch (error) { setMoveReview(current => ({ ...current, error: error.message })); }
  }

  function beginDurationAdjustment(job, trigger) {
    if (trigger) lastTriggerRef.current = trigger;
    setSelection(null);
    setPreview(null);
    setResizeReview({ job, end: job.end, endDate: job.endDate, occurrence: 'reject', stage: 'choose', proposal: null, acknowledged: false, error: '' });
  }

  function reviewDuration(job, end, trigger, endDate = job.endDate, occurrence = 'reject') {
    if (trigger) lastTriggerRef.current = trigger;
    try {
      const proposal = createResizeProposal(appointments, job.id, end, endDate, occurrence);
      setResizeReview({ job, end: proposal.end, endDate: proposal.endDate, occurrence, stage: 'review', proposal, acknowledged: false, error: '' });
    } catch (error) {
      setResizeReview({ job, end: end.includes('T') ? localParts(end, job.timeZone).time : end, endDate, occurrence, stage: 'choose', proposal: null, acknowledged: false, error: error.message });
    }
  }

  function confirmDuration() {
    try {
      const updated = applyResize(appointments, resizeReview.proposal, resizeReview.acknowledged);
      setAppointments(updated);
      setResizeReview(null);
    } catch (error) {
      setResizeReview(current => ({ ...current, error: error.message }));
    }
  }

  function openProposal(jobId, targetEngineerId, targetDate) {
    try {
      const proposal = createReassignmentProposal({ appointments, jobId, targetEngineerId, targetDate, engineers: DEMO_ENGINEERS, week: displayedWeek });
      setNotice('');
      setReassignment({ stage: 'review', job: proposal.job, targetEngineerId, targetDate, proposal, overlapAcknowledged: false, error: '' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to propose this reassignment.');
    }
  }

  function beginManualReassignment(job) {
    setSelection(null);
    setReassignment({ stage: 'choose', job, targetEngineerId: job.engineerId, targetDate: job.date, proposal: null, overlapAcknowledged: false, error: '' });
  }

  function reviewManualReassignment() {
    try {
      const proposal = createReassignmentProposal({ appointments, jobId: reassignment.job.id, targetEngineerId: reassignment.targetEngineerId, targetDate: reassignment.targetDate, engineers: DEMO_ENGINEERS, week: displayedWeek });
      setReassignment(current => ({ ...current, stage: 'review', proposal, overlapAcknowledged: false, error: '' }));
    } catch (error) {
      setReassignment(current => ({ ...current, error: error instanceof Error ? error.message : 'Unable to propose this reassignment.' }));
    }
  }

  function cancelReassignment() {
    setReassignment(null);
    setDraggedJobId('');
    setDropTarget('');
    queueMicrotask(() => lastTriggerRef.current?.focus());
  }

  function confirmReassignment() {
    const proposal = reassignment?.proposal;
    if (!proposal || (proposal.conflicts.length && !reassignment.overlapAcknowledged)) return;
    try { setAppointments(current => applyReassignment(current, proposal)); }
    catch (error) { setReassignment(current => ({ ...current, error: error.message })); return; }
    setExpandedCells(current => new Set(current).add(cellKey(proposal.targetEngineerId, proposal.targetDate)));
    const destinationDay = dayFor(proposal.targetDate);
    setNotice(`${proposal.job.jobReference} reassigned to ${engineerName(proposal.targetEngineerId)} on ${destinationDay.day} ${destinationDay.dateLabel}. Local demonstration only.`);
    setReassignment(null);
    setDraggedJobId('');
    setDropTarget('');
  }

  function startDrag(event, jobId) {
    lastTriggerRef.current = event.currentTarget;
    suppressClickRef.current = true;
    setPreview(null);
    setDraggedJobId(jobId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-instafire-job', jobId);
    event.dataTransfer.setData('text/plain', jobId);
  }

  function finishDrag() {
    setDraggedJobId('');
    setDropTarget('');
    setTimeout(() => { suppressClickRef.current = false; }, 0);
  }

  function handleCardClick(event, job, engineer, day) {
    if (suppressClickRef.current) return;
    openDetails(job, engineer, day, event.currentTarget);
  }

  function dropAppointment(event, targetEngineerId, targetDate) {
    event.preventDefault();
    const jobId = event.dataTransfer.getData('application/x-instafire-job') || event.dataTransfer.getData('text/plain') || draggedJobId;
    setDropTarget('');
    setDraggedJobId('');
    if (jobId) openProposal(jobId, targetEngineerId, targetDate);
  }

  const selectedDay = dayFor(selectedDate);
  const displayedPeriod = view === 'weekly' ? (displayedWeek[0].isoDate === '2026-10-12' ? '12-18 October 2026' : `${displayedWeek[0].dateLabel}-${displayedWeek[6].dateLabel} ${selectedDate.slice(0, 4)}`) : `${selectedDay.day} ${selectedDay.dateLabel} ${selectedDate.slice(0, 4)}`;
  const changeDay = step => setSelectedDate(current => addDays(current, step));

  return <section className={`schedule-page ${plannerExpanded ? 'schedule-page-expanded' : ''} ${isFullscreen ? 'schedule-page-fullscreen' : ''}`} aria-labelledby="schedule-page-heading">
    <header className="schedule-primary-toolbar">
      <div className="schedule-title"><span className="schedule-eyebrow">LOCAL DEMONSTRATION</span><h2 id="schedule-page-heading">Engineer Scheduling</h2></div>
      <div className="schedule-date-controls" aria-label="Calendar date controls">
        <button type="button" onClick={() => changeDay(-1)} aria-label="Previous date"><ChevronLeft size={17} aria-hidden="true" /></button>
        <button type="button" className="schedule-today" onClick={() => setSelectedDate(SCHEDULING_WEEK[0].isoDate)}>Today</button>
        <button type="button" onClick={() => changeDay(1)} aria-label="Next date"><ChevronRight size={17} aria-hidden="true" /></button>
        <strong aria-live="polite">{displayedPeriod}</strong><input aria-label="Selected date" type="date" value={selectedDate} onChange={event => { if (event.target.value) setSelectedDate(event.target.value); }} />
      </div>
      <div className="schedule-view-toggle" aria-label="Schedule view">
        <button type="button" aria-pressed={view === 'weekly'} onClick={() => setView('weekly')}>Weekly</button>
        <button type="button" aria-pressed={view === 'daily'} onClick={() => setView('daily')}>Daily</button>
      </div>
      <button type="button" className="schedule-expand-button schedule-fullscreen-button" ref={fullscreenButtonRef} aria-pressed={isFullscreen} onClick={toggleFullscreen}>{isFullscreen ? 'Exit Fullscreen' : 'Full Screen Planner'}</button>
      <NewCallout trapFocus={trapDialogFocus} onSave={store.createJob} onAssign={workflow.beginAssignment} />
      <button type="button" className="schedule-expand-button" aria-pressed={plannerExpanded} onClick={() => setPlannerExpanded(current => !current)}>{plannerExpanded ? <><Minimize2 size={16} aria-hidden="true" />Restore View</> : <><Expand size={16} aria-hidden="true" />Expand Planner</>}</button>
    </header>
    <div className="schedule-subtoolbar">
      <div className="schedule-totals" aria-label="Schedule summary"><span><Users size={16} aria-hidden="true" />{DEMO_ENGINEERS.length} engineers</span><span><CalendarDays size={16} aria-hidden="true" />{appointments.length} appointments</span></div>
      {view === 'daily' && <div className="schedule-density" aria-label="Timeline density"><span>Density</span><button type="button" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>Compact</button><button type="button" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>Comfortable</button></div>}
      <div className="schedule-legend" aria-label="Appointment status key">{APPOINTMENT_STATUSES.map(status => <span key={status.label}><i className={`schedule-dot status-${status.className}`} aria-hidden="true" />{status.label}</span>)}</div>
    </div>
    {view === 'legacy' && <>
    <header className="schedule-intro"><div><span className="schedule-eyebrow">WEEKLY SCHEDULE · LOCAL DEMONSTRATION</span><h2 id="schedule-heading">12–18 October 2026</h2><p>Drag a job to propose a reassignment, or open it for keyboard and touch controls.</p></div><div className="schedule-totals" aria-label="Schedule summary"><span><Users size={16} aria-hidden="true" />{DEMO_ENGINEERS.length} engineers</span><span><CalendarDays size={16} aria-hidden="true" />{appointments.length} appointments</span></div></header>
    <div className="schedule-toolbar"><div className="schedule-week-label"><CalendarDays size={18} aria-hidden="true" /><div><span>DISPLAYED WEEK</span><strong>Monday 12 October – Sunday 18 October</strong></div></div><div className="schedule-legend" aria-label="Appointment status key">{APPOINTMENT_STATUSES.map(status => <span key={status.label}><i className={`schedule-dot status-${status.className}`} aria-hidden="true" />{status.label}</span>)}</div></div>
    </>}
    {store.error && <p className="schedule-reassign-error" role="alert">{store.error}</p>}
    <UnassignedJobs jobs={store.unassigned} workflow={workflow} onView={(job, trigger) => openDetails(job, null, null, trigger)} />
    {notice && <p className="schedule-notice" role="status" tabIndex={-1} ref={noticeRef}>{notice}</p>}
    {view === 'weekly' ? <div className={`schedule-board ${draggedJobId ? 'is-dragging-job' : ''}`} data-planner-interaction={Boolean(draggedJobId)} role="region" aria-label="Weekly engineer schedule" tabIndex={0}>
      <table className="schedule-table"><caption>Fictional appointments for the week beginning {displayedWeek[0].isoDate}. Confirmed changes are saved in this browser.</caption><thead><tr><th className="schedule-engineer-heading" scope="col">Engineer</th>{displayedWeek.map(day => <th scope="col" key={day.isoDate}><span>{day.shortDay}</span><strong>{day.dateLabel}</strong></th>)}</tr></thead>
        <tbody>{DEMO_ENGINEERS.map(engineer => <tr key={engineer.id}><th className="schedule-engineer" scope="row"><span className="schedule-avatar" aria-hidden="true">{engineer.initials}</span><span><strong>{engineer.name}</strong><small>{engineer.trade}</small></span></th>{displayedWeek.map(day => {
          const cellAppointments = appointmentsForCell(engineer.id, day.isoDate, appointments);
          const key = cellKey(engineer.id, day.isoDate);
          const expanded = expandedCells.has(key);
          const visibleAppointments = expanded ? cellAppointments : cellAppointments.slice(0, 3);
          const hiddenCount = cellAppointments.length - 3;
          return <td key={day.isoDate} className={dropTarget === key ? 'schedule-drop-target' : ''} aria-label={`${engineer.name}, ${day.day} ${day.dateLabel}`} data-engineer={engineer.id} data-date={day.isoDate} onDragOver={event => { if (draggedJobId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(key); } }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTarget(''); }} onDrop={event => dropAppointment(event, engineer.id, day.isoDate)}>
<div className="schedule-jobs" id={`schedule-jobs-${key}`}>{visibleAppointments.map(job => <button type="button" draggable className={`schedule-job status-${statusClass(job.status)} ${draggedJobId === job.id ? 'schedule-job-dragging' : ''}`} key={job.id} data-job-id={job.id} aria-label={`View ${job.start} ${job.serviceType} at ${job.site}, ${job.status}`} aria-describedby={preview?.job.id === job.id ? `schedule-preview-${job.id}` : undefined} title="Drag to reassign, or open for appointment details" onDragStart={event => startDrag(event, job.id)} onDragEnd={finishDrag} onMouseEnter={event => showPreview(job, engineer, day, event.currentTarget)} onMouseLeave={() => hidePreview(job.id)} onFocus={event => showPreview(job, engineer, day, event.currentTarget)} onBlur={() => hidePreview(job.id)} onClick={event => handleCardClick(event, job, engineer, day)}><span className="schedule-job-heading">{job.jobNumber && <small>{job.jobNumber}</small>}<strong>{allocationLabel(job)}</strong>{job.date !== day.isoDate && <small className="schedule-continuation">Continues from previous date</small>}{job.endDate > day.isoDate && <small className="schedule-continuation">Continues on next date</small>}<span title={job.site}>{job.site}</span></span><span className="schedule-job-service" title={job.serviceType}>{job.serviceType}</span><span className="schedule-job-footer"><span><i className={`schedule-dot status-${statusClass(job.status)}`} aria-hidden="true" />{job.status}</span>{job.flag && <em>{job.flag}</em>}</span></button>)}
              {!cellAppointments.length && <span className="schedule-empty" aria-label="No appointments">Drop a job here</span>}{hiddenCount > 0 && <button type="button" className="schedule-more" onClick={() => toggleCell(key)} aria-expanded={expanded} aria-controls={`schedule-jobs-${key}`}>{expanded ? <><span>Show fewer</span><ChevronUp size={13} aria-hidden="true" /></> : <><span>+ {hiddenCount} more jobs</span><ChevronDown size={13} aria-hidden="true" /></>}</button>}</div>
          </td>;
        })}</tr>)}</tbody>
      </table>
    </div> : <DailyTimeline key={`${selectedDay.isoDate}:${density}`} appointments={appointments} selectedDate={selectedDay.isoDate} density={density} fullDay={fullDay} onFullDayChange={setFullDay} selectedEngineerId={selectedEngineerId} onEngineerChange={setSelectedEngineerId} onOpenDetails={openDetails} onMove={reviewMovement} onResize={reviewDuration} onAdjustDuration={beginDurationAdjustment} onUnassignedDrop={workflow.drop} />}
    <p className="schedule-note">Fictional jobs and confirmed scheduling changes are saved on this browser only. Contact names and telephone numbers are session-only. Demonstration job numbers are not production-safe.</p>
    {moveReview && <MoveAppointmentDialog onReshuffle={() => reshuffle.begin(moveReview.proposal)} state={moveReview} engineers={DEMO_ENGINEERS} onChange={(field, value) => setMoveReview(current => ({ ...current, [field]: value, error: '' }))} onReview={() => reviewMovement(moveReview.job, moveReview.engineerId, moveReview.start, null, moveReview.date, moveReview.occurrence)} onAcknowledge={acknowledged => setMoveReview(current => ({ ...current, acknowledged }))} onCancel={() => setMoveReview(null)} onConfirm={confirmMovement} />}
    {reshuffle.review && <ReshuffleDialog review={reshuffle.review} engineers={DEMO_ENGINEERS} onCancel={reshuffle.cancel} onConfirm={reshuffle.confirm} trapFocus={trapDialogFocus} />}
    <AppointmentPreview preview={preview} position={previewPosition} tooltipRef={tooltipRef} />
    <AppointmentDetails selection={selection} closeButtonRef={closeButtonRef} onClose={() => setSelection(null)} onReassign={view === 'weekly' ? beginManualReassignment : null} onMove={beginMovement} onAdjustDuration={beginDurationAdjustment} onEdit={job => { setSelection(null); workflow.edit(job, lastTriggerRef.current); }} trapFocus={trapDialogFocus} />
    <JobWorkspaceDialogs workflow={workflow} store={store} trapFocus={trapDialogFocus} />
    {resizeReview && <ResizeDialog engineerName={engineerName} trapDialogFocus={trapDialogFocus} onReshuffle={() => reshuffle.begin(resizeReview.proposal)} state={resizeReview} onEndChange={end => setResizeReview(current => ({ ...current, end, error: '' }))} onDateChange={endDate => setResizeReview(current => ({ ...current, endDate, error: '', occurrence: 'reject' }))} onOccurrenceChange={occurrence => setResizeReview(current => ({ ...current, occurrence, error: '' }))} onReview={() => reviewDuration(resizeReview.job, resizeReview.end, null, resizeReview.endDate, resizeReview.occurrence)} onAcknowledge={acknowledged => setResizeReview(current => ({ ...current, acknowledged }))} onCancel={() => setResizeReview(null)} onConfirm={confirmDuration} />}
    <ReassignmentDialog onReshuffle={() => reshuffle.begin(reassignment.proposal)} week={displayedWeek} state={reassignment} onDestinationChange={(field, value) => setReassignment(current => ({ ...current, [field]: value, error: '' }))} onReview={reviewManualReassignment} onAcknowledge={checked => setReassignment(current => ({ ...current, overlapAcknowledged: checked }))} onCancel={cancelReassignment} onConfirm={confirmReassignment} />
  </section>;
}
