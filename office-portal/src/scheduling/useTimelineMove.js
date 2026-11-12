import { useEffect, useRef, useState } from 'react';
import { moveFromGeometry } from './scheduleMove.js';
import { positionAppointment } from './timelineLayout.js';

export function useTimelineMove({ scrollRef, quarterHeight, rangeStart, onMove, touchMove, selectedDate }) {
  const [moving, setMoving] = useState(null);
  const [pending, setPending] = useState(false);
  const gestureRef = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!pending) return undefined;
    const gesture = gestureRef.current;
    const scroller = scrollRef.current;
    function update() {
      if (!gesture.active) return;
      const columns = [...scroller.querySelectorAll('.daily-column')].map(column => ({ engineerId: column.dataset.engineer, rect: column.getBoundingClientRect() }));
      const viewport = scroller.getBoundingClientRect();
      const headerBottom = scroller.querySelector('.daily-corner').getBoundingClientRect().bottom;
      gesture.destination = moveFromGeometry(gesture.job, gesture.x, gesture.y, columns, { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom, contentTop: Math.max(viewport.top, headerBottom) }, gesture.grabOffset, gesture.rangeStart, gesture.quarterHeight, selectedDate);
      setMoving({ job: gesture.job, ...gesture.destination });
    }
    function cancel() {
      if (gesture.active) suppressClick.current = true;
      gestureRef.current = null;
      setPending(false);
      setMoving(null);
    }
    function move(event) {
      if (event.pointerId !== gesture.pointerId) return;
      gesture.x = event.clientX; gesture.y = event.clientY;
      if (!gesture.active && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) >= 6) {
        gesture.active = true;
        suppressClick.current = true;
        gesture.trigger.setPointerCapture?.(gesture.pointerId);
      }
      if (gesture.active) { event.preventDefault(); update(); }
    }
    function up(event) {
      if (event.pointerId !== gesture.pointerId) return;
      gesture.x = event.clientX; gesture.y = event.clientY;
      update();
      cancel();
      if (gesture.active && gesture.destination && !gesture.destination.error) onMove(gesture.job, gesture.destination.engineerId, gesture.destination.start, gesture.trigger, gesture.destination.date, 'reject', gesture.destination.startAt);
    }
    const key = event => { if (event.key === 'Escape') cancel(); };
    const pointerCancel = event => { if (event.pointerId === gesture.pointerId) cancel(); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(scroller);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [pending, onMove, scrollRef, selectedDate]);

  function beginMove(event, job) {
    suppressClick.current = false;
    if (event.button !== 0 || gestureRef.current || (event.pointerType === 'touch' && !touchMove)) return;
    const column = event.currentTarget.closest('.daily-column');
    gestureRef.current = {
      job, trigger: event.currentTarget, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      grabOffset: event.clientY - column.getBoundingClientRect().top - positionAppointment(job, rangeStart, quarterHeight, selectedDate).top,
      rangeStart, quarterHeight, active: false, destination: null,
    };
    setPending(true);
  }

  function openOnClick(event, callback) {
    if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); return; }
    callback();
  }
  return { moving, beginMove, openOnClick, pending };
}
