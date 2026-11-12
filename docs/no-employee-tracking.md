# Core product principle: no employee tracking

InstaFirePilot supports professional fire safety work and inspection records.
It is not an employee surveillance platform. This is a standing requirement for
future mobile, office, backend, analytics and integration work.

## Excluded capabilities

Do not implement GPS tracking, movement histories, activity monitoring, individual
button-press tracking, per-question timestamps, productivity scoring or time-on-screen
monitoring. Do not derive equivalent monitoring from network events, local save
metadata, inspection history or other indirect signals. Do not introduce tracking
through third-party SDK defaults or integrations.

No future tracking capability is authorised without explicit prior user approval.
A general feature request or available analytics integration is not that approval.

## Legitimate office visibility

The office may assign jobs, view explicit job statuses, receive completed inspection
results and review submitted work. Scheduled is an office assignment; In Progress
comes from an explicit engineer Start action; Completed follows explicit completion
confirmation and successful server commitment of the finished records.

While servicing, checklist progress, individual PASS/FAIL/N/A changes and draft
saves remain private in the engineer's durable local draft. They are not live office
activity. An explicit completed-job package may contain the finished answers,
necessary defect information and inspection evidence, without answer-edit histories
or per-question timing. Offline completion remains Pending Sync until acknowledged.
End-of-day submission and office approval remain separate business events.

## Data minimisation and audit boundary

Collect only what is necessary for scheduling, legitimate inspection records,
defects, compliance documentation and approvals. Keep audit logs limited to
meaningful record and approval events: explicit job start/completion, record
submission, authorised corrections and office review decisions. Necessary record
creation/commit timestamps do not authorise per-question timestamps or interaction
monitoring. Do not use status/completion times for productivity scoring.

Local durability/recovery metadata exists to preserve work. It must not be exported
or repurposed as an employee activity feed. This principle does not authorise
deleting existing inspection records or recovery data. Any future retention or
audit redesign must preserve legitimate records and recoverability.

The [job synchronisation proposal](engineer-jobs-and-day-approval-proposal.md)
must follow this boundary. That proposal remains unimplemented. Recording this
principle changes documentation/instructions only; it is not a runtime privacy
audit or a claim that third-party dependency behaviour has been independently
verified.
