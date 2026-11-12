import { createContext, useContext, useEffect, useRef, useState } from 'react';

export const PlannerFullscreenContext = createContext(null);

// Presentation state only. The local fallback also supports the isolated scheduler preview.
export function usePlannerFullscreen() {
  const workspace = useContext(PlannerFullscreenContext);
  const [localFullscreen, setLocalFullscreen] = useState(false);
  const isFullscreen = workspace?.isFullscreen ?? localFullscreen;
  const setFullscreen = workspace?.setFullscreen ?? setLocalFullscreen;
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    function exitOnEscape(event) {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
      // Capture the current interaction before a modal/drag handler can dismiss it.
      // Their existing handlers still receive Escape; only a subsequent Escape exits.
      if (document.querySelector('[role="dialog"][aria-modal="true"], [data-planner-interaction="true"]')) return;
      event.preventDefault();
      setFullscreen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('keydown', exitOnEscape, true);
    return () => document.removeEventListener('keydown', exitOnEscape, true);
  }, [isFullscreen, setFullscreen]);

  return { isFullscreen, toggleFullscreen: () => setFullscreen(current => !current), buttonRef };
}
