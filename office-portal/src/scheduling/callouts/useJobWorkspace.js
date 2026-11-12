import { useRef, useState } from 'react';
import { applyAssignment, createAssignmentProposal, reshuffleAssignment, unassignedDrop } from './jobAssignment.js';
import { DEMO_ENGINEERS } from '../demoSchedule.js';

export const UNASSIGNED_DRAG_TYPE = 'application/x-instafire-unassigned-job';

export function useJobWorkspace({ store, selectedDate, onAssigned }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [error, setError] = useState('');
  const triggerRef = useRef(null);
  const applyingRef = useRef(false);
  const focusBack = () => requestAnimationFrame(() => {
    const target = triggerRef.current?.isConnected ? triggerRef.current : document.querySelector('.unassigned-toggle');
    target?.focus();
  });
  function beginAssignment(job, trigger = null) {
    triggerRef.current = trigger;
    setAssignment({ job, engineerId: DEMO_ENGINEERS[0].id, date: selectedDate, start: '09:00', duration: String(Math.max(15, job.estimatedDurationMinutes || 60)), occurrence: 'reject', proposal: null, reshuffle: null, acknowledged: false, error: '' });
  }
  function reviewAssignment() {
    try {
      const job = store.unassigned.find(item => item.id === assignment.job.id);
      if (!job) throw new Error('This job is no longer unassigned.');
      const proposal = createAssignmentProposal(store.appointments, job, assignment);
      setAssignment(current => ({ ...current, proposal, error: '' }));
    } catch (cause) { setAssignment(current => ({ ...current, error: cause.message })); }
  }
  function drop(event, scroller, date, rangeStart, quarterHeight) {
    event.preventDefault(); event.stopPropagation();
    try {
      const job = store.unassigned.find(item => item.id === event.dataTransfer.getData(UNASSIGNED_DRAG_TYPE));
      if (!job) throw new Error('This job is no longer unassigned.');
      const destination = unassignedDrop(job, event, scroller, date, rangeStart, quarterHeight);
      if (destination.error) throw new Error(destination.error);
      const request = { ...destination, duration: Math.max(15, job.estimatedDurationMinutes || 60) };
      const proposal = createAssignmentProposal(store.appointments, job, request);
      setAssignment({ job, ...request, proposal, reshuffle: null, acknowledged: false, error: '' }); setError('');
    } catch (cause) { setError(cause.message); }
  }
  function beginReshuffle() {
    try {
      const proposal = reshuffleAssignment(assignment.proposal);
      setAssignment(current => ({ ...current, reshuffle: { proposal, error: '' }, error: '' }));
    }
    catch (cause) { setAssignment(current => ({ ...current, error: cause.message })); }
  }
  function confirm() {
    if (applyingRef.current || !assignment?.proposal) return;
    try {
      applyingRef.current = true;
      const updated = applyAssignment(store.appointments, store.unassigned, assignment.proposal, assignment.acknowledged, assignment.reshuffle?.proposal);
      store.setAppointments(updated);
      onAssigned(updated.find(job => job.id === assignment.job.id));
      setAssignment(null);
    } catch (cause) {
      setAssignment(current => current.reshuffle ? { ...current, reshuffle: { ...current.reshuffle, error: cause.message } } : { ...current, error: cause.message });
    } finally { applyingRef.current = false; }
  }
  function cancelAssignment() { setAssignment(null); focusBack(); }
  function deleteJob() {
    try { store.deleteJob(deleting.id); setDeleting(null); setError(''); focusBack(); }
    catch (cause) { setError(cause.message); }
  }
  return {
    assignment, beginAssignment, reviewAssignment, beginReshuffle, confirm, cancelAssignment, drop,
    changeAssignment: (field, value) => setAssignment(current => ({ ...current, [field]: value, error: '' })),
    editing, edit: (job, trigger) => { triggerRef.current = trigger; setEditing(job); }, closeEditor: (restoreFocus = true) => { setEditing(null); if (restoreFocus !== false) focusBack(); },
    deleting, remove: (job, trigger) => { triggerRef.current = trigger; setDeleting(job); setError(''); }, cancelDelete: () => { setDeleting(null); setError(''); focusBack(); }, deleteJob, error,
  };
}
