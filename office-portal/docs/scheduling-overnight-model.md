# Local scheduling timestamp model — Phase 2C.0

## Assumptions found before implementation

- Fixtures store one date and two clock strings; duration is end minus start without dates.
- Move validation rejects allocations finishing after 23:45. Resize dragging clamps at 23:45.
- Conflict checks filter by identical start date before comparing clock times.
- Weekly cells select only the appointment's start date; daily columns do the same.
- Timeline heights, overlap lanes and ruler positions use clock minutes without an instant or timezone.
- Reassignment changes the date string without recalculating dated start/end instants.
- Details and confirmations display a single date and cannot show a finish-date change.
- The ruler assumes an hour always maps to the same wall-clock interval; DST days need an elapsed-time axis.
- Existing tests explicitly expect midnight rejection and the 23:45 cap.

## Canonical model and compatibility

`startAt` and `endAt` are validated UTC ISO timestamps, and `timeZone` is an IANA timezone identifier. UK fixtures use `Europe/London`. IDs and all other business metadata remain intact. Legacy date/start/end/endDate/duration properties are read-only derived getters, never independent stored values. All scheduling writes pass through the shared model constructor.

Local date/time editing uses explicit timezone conversion through Intl. Nonexistent local times are rejected. Ambiguous local times are rejected unless the user explicitly chooses the earlier or later occurrence. UTC instants retain their exact occurrence. Moves preserve elapsed duration; resizing changes the end instant. Quarter-hour snapping operates on elapsed timeline minutes, not an assumed 1,440-minute local day.

Each local date is a half-open interval between two timezone-aware midnights. Calendar segments are clipped to that interval and retain the same appointment ID and original record. Ending exactly at midnight does not add an empty next-day segment. DST rulers use elapsed minutes and label repeated hours with their UTC offset.

Only deterministic local demonstration data is migrated. No Firebase/production migration or automatic reshuffling is included.
