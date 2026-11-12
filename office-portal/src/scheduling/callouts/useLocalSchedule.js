import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalJob, editLocalJob, emptyLocalJobs, mergedAppointments, updateLocalSchedule } from './localJobModel.js';
import { loadLocalJobs, saveLocalJobs } from './localJobStorage.js';

export function useLocalSchedule() {
  const [initial] = useState(() => {
    try { return loadLocalJobs(window.localStorage); }
    catch { return { state: emptyLocalJobs(), raw: null, error: 'Browser storage is unavailable. Jobs cannot be saved.' }; }
  });
  const current = useRef(initial);
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
  const appointments = useMemo(() => mergedAppointments(state), [state]);
  const appointmentsRef = useRef(appointments);
  useLayoutEffect(() => { appointmentsRef.current = appointments; }, [appointments]);

  function commit(next) {
    if (initial.error) throw new Error(initial.error);
    try {
      const nextAppointments = mergedAppointments(next);
      const raw = saveLocalJobs(window.localStorage, next, current.current.raw);
      current.current = { state: next, raw, error: '' };
      appointmentsRef.current = nextAppointments;
      setState(next); setError('');
    } catch (cause) {
      const message = cause.message?.includes('another tab') ? cause.message : 'Could not save demo jobs in this browser. Your changes have not been applied. Check available browser storage and retry.';
      setError(message); throw new Error(message);
    }
  }
  function createJob(draft, token) {
    const result = createLocalJob(current.current.state, draft, token);
    if (result.state !== current.current.state) commit(result.state);
    return result.job;
  }
  function editJob(id, draft) {
    const next = editLocalJob(current.current.state, id, draft); commit(next);
    return next.jobs.find(job => job.id === id);
  }
  function deleteJob(id) {
    if (!current.current.state.jobs.some(job => job.id === id)) throw new Error('This local job is no longer available.');
    commit({ ...current.current.state, jobs: current.current.state.jobs.filter(job => job.id !== id) });
  }
  function setAppointments(update) {
    const next = typeof update === 'function' ? update(appointmentsRef.current) : update;
    commit(updateLocalSchedule(current.current.state, next));
  }
  return { appointments, setAppointments, jobs: state.jobs, unassigned: state.jobs.filter(job => !job.startAt), createJob, editJob, deleteJob, error };
}
