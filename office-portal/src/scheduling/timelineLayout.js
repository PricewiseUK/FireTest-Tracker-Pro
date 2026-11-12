import { dayBounds, daySegment, instantMs, localToInstant, UK_TIME_ZONE } from './appointmentTime.js';
export const DEFAULT_TIMELINE_START = 7 * 60;
export const DEFAULT_TIMELINE_END = 18 * 60;

export function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function timelineRange(appointments, date = appointments[0]?.date, fullDay = false) {
  if (!date) return { start: DEFAULT_TIMELINE_START, end: DEFAULT_TIMELINE_END };
  const zone = appointments[0]?.timeZone || UK_TIME_ZONE;
  const bounds = dayBounds(date, zone);
  if (fullDay) return { start: 0, end: bounds.minutes };
  const defaultStart = (instantMs(localToInstant(date, '07:00', zone)) - bounds.start) / 60000;
  const defaultEnd = (instantMs(localToInstant(date, '18:00', zone)) - bounds.start) / 60000;
  const earliest = Math.min(defaultStart, ...appointments.map(job => daySegment(job, date).start));
  const latest = Math.max(defaultEnd, ...appointments.map(job => daySegment(job, date).end));
  return {
    start: Math.max(0, Math.floor(earliest / 60) * 60),
    end: Math.min(bounds.minutes, Math.ceil(latest / 60) * 60),
  };
}

export function positionAppointment(job, rangeStart, quarterHeight, date = job.date) {
  const { start, end } = daySegment(job, date);
  return {
    top: ((start - rangeStart) / 15) * quarterHeight,
    height: ((end - start) / 15) * quarterHeight,
    startMinutes: start,
    durationMinutes: end - start,
  };
}

export function assignOverlapLanes(appointments, date = appointments[0]?.date) {
  const sorted = [...appointments].sort((left, right) =>
    daySegment(left, date).start - daySegment(right, date).start ||
    daySegment(left, date).end - daySegment(right, date).end ||
    left.id.localeCompare(right.id));
  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  function finishCluster() {
    if (!cluster.length) return;
    const laneEnds = [];
    const placed = cluster.map(job => {
      const { start, end } = daySegment(job, date);
      let lane = laneEnds.findIndex(laneEnd => laneEnd <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { job, lane };
    });
    const laneCount = laneEnds.length;
    result.push(...placed.map(item => ({ ...item, laneCount })));
    cluster = [];
    clusterEnd = -1;
  }

  for (const job of sorted) {
    const { start, end } = daySegment(job, date);
    if (cluster.length && start >= clusterEnd) finishCluster();
    cluster.push(job);
    clusterEnd = Math.max(clusterEnd, end);
  }
  finishCluster();
  return result;
}
