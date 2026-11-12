export default function ConflictResolutionActions({ onCancel, onAllowOverlap, onReshuffle, acknowledged, cancelRef = undefined, autoFocusCancel = false }) {
  return <div className="schedule-reassign-actions schedule-conflict-actions">
    <button type="button" className="schedule-secondary" ref={cancelRef} autoFocus={autoFocusCancel} onClick={onCancel}>Cancel</button>
    <button type="button" className="schedule-primary" disabled={!acknowledged} onClick={onAllowOverlap}>Allow Overlap</button>
    <button type="button" className="schedule-secondary" onClick={onReshuffle}>Move Existing Jobs Down</button>
  </div>;
}
