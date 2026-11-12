import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CalloutPanel from './CalloutPanel.jsx';
import AssignJobDialog from './AssignJobDialog.jsx';

function DeleteJobDialog({ workflow, trapFocus }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return createPortal(<div className="schedule-reassign-backdrop"><section className="schedule-reassign" role="dialog" aria-modal="true" aria-labelledby="delete-job-title" onKeyDown={event => { trapFocus(event); if (event.key === 'Escape') { event.stopPropagation(); workflow.cancelDelete(); } }}>
    <header><h3 id="delete-job-title">Delete demonstration job?</h3></header><p>Delete {workflow.deleting.jobNumber} — {workflow.deleting.site}? Customer and site records will remain unchanged.</p>
    {workflow.error && <p role="alert">{workflow.error}</p>}
    <div className="schedule-reassign-actions"><button type="button" className="schedule-secondary" ref={cancelRef} onClick={workflow.cancelDelete}>Cancel</button><button type="button" className="schedule-primary" onClick={workflow.deleteJob}>Confirm Delete</button></div>
  </section></div>, document.body);
}

export default function JobWorkspaceDialogs({ workflow, store, trapFocus }) {
  return <>
    {workflow.editing && <CalloutPanel initialJob={workflow.editing} onClose={workflow.closeEditor} onSave={draft => store.editJob(workflow.editing.id, draft)} onAssign={workflow.beginAssignment} trapFocus={trapFocus} />}
    {workflow.assignment && <AssignJobDialog workflow={workflow} trapFocus={trapFocus} />}
    {workflow.deleting && <DeleteJobDialog workflow={workflow} trapFocus={trapFocus} />}
  </>;
}
