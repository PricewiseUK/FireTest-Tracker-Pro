export const UK_TIME_ZONE = 'Europe/London';
const MINUTE = 60000;
const formatters = new Map();
const conversions = new Map();
const boundsCache = new Map();

export function instantMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new Error('Use a valid explicit UTC timestamp.');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) throw new Error('Invalid UTC timestamp.');
  return ms;
}

export function localParts(instant, timeZone = UK_TIME_ZONE) {
  const ms = typeof instant === 'number' ? instant : instantMs(instant);
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(new Date(ms)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const wallMs = Date.parse(`${date}T${time}:${parts.second}Z`);
  const offsetMinutes = Math.round((wallMs - Math.floor(ms / 1000) * 1000) / MINUTE);
  return { date, time, offsetMinutes };
}

export function localToInstant(date, time, timeZone = UK_TIME_ZONE, occurrence = 'reject') {
  const key = `${date}/${time}/${timeZone}/${occurrence}`;
  if (conversions.has(key)) return conversions.get(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Enter a valid local date and time.');
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== `${date}T${time}`) throw new Error('Invalid local calendar date.');
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) offsets.add(localParts(wall + hours * 3600000, timeZone).offsetMinutes);
  const matches = [...offsets].map(offset => wall - offset * MINUTE).filter(ms => {
    const parts = localParts(ms, timeZone);
    return parts.date === date && parts.time === time;
  }).sort((a, b) => a - b);
  if (!matches.length) throw new Error('This local time does not exist because the clocks change. Choose another time.');
  if (matches.length > 1 && !['earlier', 'later'].includes(occurrence)) throw new Error('This local time is ambiguous. Choose its earlier or later occurrence.');
  const result = new Date(occurrence === 'later' ? matches.at(-1) : matches[0]).toISOString();
  if (conversions.size >= 2048) conversions.clear();
  conversions.set(key, result);
  return result;
}

export function addDays(date, days) {
  const midnight = instantMs(`${date}T00:00:00.000Z`);
  return new Date(midnight + days * 86400000).toISOString().slice(0, 10);
}

export function dayBounds(date, timeZone = UK_TIME_ZONE) {
  const key = `${date}/${timeZone}`;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const start = instantMs(localToInstant(date, '00:00', timeZone, 'earlier'));
  const end = instantMs(localToInstant(addDays(date, 1), '00:00', timeZone, 'earlier'));
  const bounds = Object.freeze({ start, end, minutes: (end - start) / MINUTE });
  if (boundsCache.size >= 512) boundsCache.clear();
  boundsCache.set(key, bounds);
  return bounds;
}

export function appointmentDuration(job) { return (instantMs(job.endAt) - instantMs(job.startAt)) / MINUTE; }

/**
 * @template {Record<string, any> & {startAt: string, endAt: string, timeZone: string}} T
 * @param {T} source
 * @returns {T & {date: string, start: string, end: string, endDate: string, scheduledDurationMinutes: number}}
 */
export function appointmentRecord(source) {
  const { date: _date, start: _start, end: _end, endDate: _endDate, scheduledDurationMinutes: _duration, ...metadata } = source;
  const record = { ...metadata, startAt: source.startAt, endAt: source.endAt, timeZone: source.timeZone };
  const start = instantMs(record.startAt);
  const end = instantMs(record.endAt);
  if (end <= start) throw new Error('Appointment finish must be after its start.');
  if (!record.timeZone) throw new Error('An appointment timezone is required.');
  localParts(start, record.timeZone);
  record.startAt = new Date(start).toISOString();
  record.endAt = new Date(end).toISOString();
  const result = Object.defineProperties(record, {
    date: { enumerable: true, get() { return localParts(this.startAt, this.timeZone).date; } },
    start: { enumerable: true, get() { return localParts(this.startAt, this.timeZone).time; } },
    end: { enumerable: true, get() { return localParts(this.endAt, this.timeZone).time; } },
    endDate: { enumerable: true, get() { return localParts(this.endAt, this.timeZone).date; } },
    scheduledDurationMinutes: { enumerable: true, get() { return appointmentDuration(this); } },
  });
  return /** @type {T & {date: string, start: string, end: string, endDate: string, scheduledDurationMinutes: number}} */ (/** @type {unknown} */ (result));
}

export function withAppointmentTimes(job, times) { return appointmentRecord({ ...job, ...times }); }

export function overlaps(left, right) {
  return instantMs(left.startAt) < instantMs(right.endAt) && instantMs(left.endAt) > instantMs(right.startAt);
}

export function occursOnDay(job, date) {
  const bounds = dayBounds(date, job.timeZone);
  return instantMs(job.startAt) < bounds.end && instantMs(job.endAt) > bounds.start;
}

export function daySegment(job, date = localParts(job.startAt, job.timeZone).date) {
  const bounds = dayBounds(date, job.timeZone);
  const start = Math.max(bounds.start, instantMs(job.startAt));
  const end = Math.min(bounds.end, instantMs(job.endAt));
  return { start: (start - bounds.start) / MINUTE, end: (end - bounds.start) / MINUTE, continuesBefore: instantMs(job.startAt) < bounds.start, continuesAfter: instantMs(job.endAt) > bounds.end };
}

export function allocationLabel(job) {
  const start = localParts(job.startAt, job.timeZone);
  const end = localParts(job.endAt, job.timeZone);
  const clock = parts => `${parts.time}${dayBounds(parts.date, job.timeZone).minutes !== 1440 ? ` ${parts.offsetMinutes === 60 ? 'BST' : 'GMT'}` : ''}`;
  return start.date === end.date ? `${clock(start)}–${clock(end)}` : `${start.date} ${clock(start)} → ${end.date} ${clock(end)}`;
}

export function calendarDay(date) {
  const instant = new Date(`${date}T12:00:00Z`);
  return { isoDate: date, day: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(instant), shortDay: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(instant), dateLabel: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(instant) };
}

export function calendarWeek(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => calendarDay(addDays(monday, index)));
}

export function axisLabel(date, elapsedMinutes, timeZone = UK_TIME_ZONE) {
  const parts = localParts(dayBounds(date, timeZone).start + elapsedMinutes * MINUTE, timeZone);
  if (dayBounds(date, timeZone).minutes === 1440) return elapsedMinutes === 1440 ? '24:00' : parts.time;
  return `${parts.time} ${parts.offsetMinutes === 60 ? 'BST' : 'GMT'}`;
}

export function snapInstant(instant) { return Math.round(instantMs(instant) / (15 * MINUTE)) * 15 * MINUTE; }
