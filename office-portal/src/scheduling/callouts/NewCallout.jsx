import { useRef, useState } from 'react';
import CalloutPanel from './CalloutPanel.jsx';

export default function NewCallout({ trapFocus, onSave, onAssign }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus !== false) requestAnimationFrame(() => triggerRef.current?.focus());
  }
  return <>
    <button type="button" ref={triggerRef} className="callout-launch-button" onClick={() => setOpen(true)}>+ New Callout</button>
    {open && <CalloutPanel onClose={close} trapFocus={trapFocus} onSave={onSave} onAssign={onAssign} />}
  </>;
}
