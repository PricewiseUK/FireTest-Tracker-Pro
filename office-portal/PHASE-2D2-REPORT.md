# Phase 2D.2 completion report

Implemented local demonstration job creation, storage and engineer scheduling. No Firebase, authentication, rules, backend, engineer-app, public-site or Hosting changes were made. Nothing was deployed.

The existing New Callout form now offers Cancel, optional Review Callout and Create Job. Creation validates the customer/site association and nature of job, preserves the callout fields, starts the job as Scheduled, and shows a success confirmation with an immediate Assign Engineer action. A stable submission token and synchronous store commit prevent repeat submissions. A failed save leaves the form and its entered details intact. Editing updates the existing job; its internal ID, number and allocation remain unchanged. The original caller fault report is retained separately if the report is subsequently corrected.

Each job has a separate cryptographically random internal ID and a demonstration number such as T77689. A persisted counter checks existing numbers, survives refresh and does not reuse deleted numbers. Browser-generated numbering is for this local demonstration only. Production numbering must be allocated atomically by an authorised backend.

The collapsible Unassigned Jobs panel shows compact cards with number, customer, site, job nature, short fault description, priority and estimate. Cards provide details, editing, engineer assignment and confirmed deletion. Deleting a job leaves the customer/site directory intact. The existing appointment-details component was extracted and extended for both unassigned and scheduled callouts.

Assignment supports engineer, local date, start time, duration and explicit earlier/later clock-change occurrence. Confirmation is required. Native dragging into Daily Timeline uses the existing scroll-aware 15-minute geometry. Conflict detection, overlap acknowledgement, reshuffle previews and protected-job blocking reuse the existing scheduling utilities and interface. An assignment and any reshuffle changes are saved together; cancellation, protected-job blocking or a failed write applies nothing. Confirmed jobs leave Unassigned Jobs and appear on both calendars with their original job number. UTC startAt/endAt and Europe/London remain the canonical scheduling model, including overnight and BST/GMT changes.

Storage uses `instafirepilot:local-demo-jobs:v1`. Created jobs are stored separately from the immutable fixtures. Only scheduling overrides are stored for fixture appointments, preserving their other metadata. Restoration validates version, IDs, numbers, customer/site references, equipment and canonical allocations. Damaged/unsupported data is reported and left untouched; saving is blocked until the storage is repaired and the page reloaded. Failed writes preserve the previous live state. A stale-tab check refuses to overwrite another tab's saved snapshot.

As explicitly selected by the user, contact names and telephone numbers remain in memory and are excluded from localStorage. Other free-text fields are saved; the form clearly requires fictional information only. This feature adds no analytics, external requests or employee monitoring.

**Created files**

| File | Responsibility |
| --- | --- |
| `src/scheduling/AppointmentDetails.jsx` | Extracted, extended shared appointment/callout details |
| `src/scheduling/callouts/localJobModel.js` | Job creation, numbering, editing and fixture/schedule merging |
| `src/scheduling/callouts/localJobStorage.js` | Versioned serialization, validation and guarded storage writes |
| `src/scheduling/callouts/useLocalSchedule.js` | React state with synchronous persistence before applying changes |
| `src/scheduling/callouts/jobAssignment.js` | Adapts new jobs to existing move, conflict, reshuffle and geometry utilities |
| `src/scheduling/callouts/useJobWorkspace.js` | Assignment, editing and deletion workflow state |
| `src/scheduling/callouts/AssignJobDialog.jsx` | Assignment fields and confirmation/conflict interface |
| `src/scheduling/callouts/JobWorkspaceDialogs.jsx` | Editor, assignment and confirmed-deletion dialogs |
| `src/scheduling/callouts/UnassignedJobs.jsx` | Collapsible unassigned job cards and actions |
| `src/scheduling/callouts/UnassignedJobs.css` | Scoped responsive card/panel presentation |
| `tests/localJobs.test.js` | Creation, identity, persistence, validation and metadata tests |
| `tests/jobAssignment.test.js` | Assignment, conflicts, reshuffling, protection, overnight/DST and geometry tests |
| `tests/LocalJobWorkflow.test.jsx` | Creation-to-calendar, remount, editing, deletion and failure-path integration tests |
| `tests/localStorageSetup.js` | Isolates the new storage key between tests, including Node-only suites |
| `PHASE-2D2-REPORT.md` | This completion report |

**Modified files**

| File | Change |
| --- | --- |
| `src/pages/EngineerScheduling.jsx` | Connects the local store/workflow, native daily drops and number display; removes the extracted details component; updates persistence wording |
| `src/scheduling/demoSchedule.js` | Type annotation allowing local job numbers in the shared cell selector; fixture data unchanged |
| `src/scheduling/ReshuffleDialog.jsx` | Labels unscheduled incoming jobs correctly and explains local persistence |
| `src/scheduling/callouts/NewCallout.jsx` | Supplies creation/assignment callbacks and preserves modal focus on handoff |
| `src/scheduling/callouts/CalloutPanel.jsx` | Create/edit/save success workflow, assignment handoff and demonstration/privacy notice |
| `src/scheduling/callouts/CalloutForm.jsx` | Create Job / Save Job actions, with optional preview retained |
| `src/scheduling/callouts/CalloutPreview.jsx` | Creation/save actions and edit-preview wording |
| `src/scheduling/callouts/useCalloutDraft.js` | Editable drafts, validation, duplicate submission protection and save errors |
| `tests/NewCallout.test.jsx` | Updates preview/action and keyboard expectations for the new creation button |
| `vitest.config.js` | Loads storage isolation setup |

The production build regenerated ignored local `dist/` output. Dependencies and lockfiles were unchanged.

**Verification performed**

| Command/check | Actual result |
| --- | --- |
| `npm.cmd test` | 231 tests passed across 21 files, including all existing scheduling regressions and 43 new tests |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed with the pre-existing React purity warning for Date at `src/App.jsx:423` |
| `npm.cmd run build` | Passed with the pre-existing main-bundle size advisory |
| Browser availability | Browser access host unavailable; no desktop/mobile visual checks performed |

Automated integration checks include duplicate clicks; correct calendar placement; assignment and reshuffle cancellation; protected-job blocking; explicit overlap allowance; remount restoration of jobs, allocations and fixture changes; original fault retention through movement, resizing and editing; overnight resizing; safe deletion; quota failures without partial application; and fullscreen Escape priority. Drag-and-drop integration uses mocked geometry in jsdom, not a real browser gesture.

**Limitations**

- Contact names/numbers are intentionally lost on refresh or scheduling-page unmount. No contact values are written to localStorage.
- Storage is limited to this browser origin. Clearing browser storage removes these demonstration jobs and the numbering counter. It is not multi-device synchronization or production-safe numbering. Stale tabs are rejected, but the browser storage counter is not a backend atomic allocator; use one active editing tab for this demo.
- Native unassigned-card dragging is provided for supporting desktop browsers. Keyboard and touch users can use Assign Engineer. Real mouse/touch dragging, viewport overflow and desktop/mobile visuals remain unverified because browser access was unavailable. Existing timeline touch-drag/resize behaviour remains covered by its automated regression tests.
- Corrupt storage is preserved rather than silently reset. It must be repaired/removed deliberately and the page refreshed before saving again.
- The existing scheduling page remains large. A safe future refactor would extract DailyTimeline and its existing reassignment dialog separately while retaining their regression tests. No broader rewrite was performed here.

Stopped after Phase 2D.2. No subsequent phase was started.
