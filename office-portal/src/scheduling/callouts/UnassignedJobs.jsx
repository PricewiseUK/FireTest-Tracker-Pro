import { useEffect, useRef, useState } from 'react';
import { UNASSIGNED_DRAG_TYPE } from './useJobWorkspace.js';
import './UnassignedJobs.css';

export default function UnassignedJobs({ jobs, onView, workflow }) {
  const [expanded, setExpanded] = useState(true);
  const [dragging, setDragging] = useState(false);
  const previousCount = useRef(jobs.length);
  useEffect(() => { if (jobs.length > previousCount.current) setExpanded(true); previousCount.current = jobs.length; }, [jobs.length]);
  return <aside className="unassigned-jobs" aria-label="Unassigned Jobs" data-planner-interaction={dragging}>
    <button className="unassigned-toggle" type="button" aria-expanded={expanded} aria-controls="unassigned-job-list" onClick={() => setExpanded(current => !current)}>Unassigned Jobs ({jobs.length}) <span aria-hidden="true">{expanded ? '▴' : '▾'}</span></button>
    {workflow.error && <p role="alert" className="callout-field-error">{workflow.error}</p>}
    <div id="unassigned-job-list" hidden={!expanded}>
      {!jobs.length && <p className="callout-help">No unassigned jobs. Create a fictional callout to get started.</p>}
      {jobs.length > 0 && <p className="callout-help">Drag a job into the Daily Timeline, or use Assign Engineer.</p>}
      <div className="unassigned-cards">{jobs.map(job => <article className="unassigned-card" aria-label={`${job.jobNumber} ${job.site}`} key={job.id} data-unassigned-id={job.id} draggable onDragStart={event => { setDragging(true); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(UNASSIGNED_DRAG_TYPE, job.id); }} onDragEnd={() => setDragging(false)}>
        <button type="button" className="unassigned-open" onClick={event => onView(job, event.currentTarget)} aria-label={`View ${job.jobNumber} at ${job.site}`}><strong>{job.jobNumber} — {job.site}</strong></button><span>{job.customer}</span><span>{job.natureOfJob}</span>
        <p className="unassigned-fault" title={job.reportedFault}>{job.reportedFault || 'No fault description provided'}</p>
        <small>{job.priority} · {job.estimatedDurationMinutes === null ? 'Duration not specified (assignment suggests 60 min)' : `${job.estimatedDurationMinutes} min`}</small>
        <div className="callout-actions"><button type="button" className="schedule-secondary" onClick={event => onView(job, event.currentTarget)}>View Details</button><button type="button" className="schedule-secondary" onClick={event => workflow.edit(job, event.currentTarget)}>Edit Job</button><button type="button" className="schedule-primary" onClick={event => workflow.beginAssignment(job, event.currentTarget)}>Assign Engineer</button><button type="button" className="schedule-secondary" onClick={event => workflow.remove(job, event.currentTarget)}>Delete Job</button></div>
      </article>)}</div>
    </div>
  </aside>;
}
