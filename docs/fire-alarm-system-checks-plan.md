# Fire Alarm System Checks: implementation plan additions

Status: user-supplied candidate topics, Pending Technical Validation. This update
changes the plan only, not the working Device Testing screen, local drafts or
Firebase. These six topics extend the eventual system checklist; they are not
a complete BS 5839-1 service schedule or a certification procedure.

## Engineer-facing candidate questions

| Stable candidate check | Short wording | Scope to retain during technical review |
| --- | --- | --- |
| visible-cables-connections | Visible cables and connections undamaged and satisfactory? | Visible/accessibly inspected portions only. Never imply concealed cables were inspected. |
| circuit-wiring-monitoring | Circuit wiring condition and relevant fault monitoring satisfactory? | Relevant circuits/monitoring under the approved system procedure; do not derive a PASS from individual device results. |
| panel-equipment-condition | Panel and accessible equipment clean and satisfactory? | Accessible equipment only; do not imply an internal or inaccessible inspection occurred. |
| fuse-ratings | Correct fuse ratings fitted, where verifiable? | Verification against applicable equipment documentation; no guessed ratings or automatic PASS when unverified. |
| mains-isolation-protection | Dedicated mains supply, labelled isolation and protection satisfactory? | Include relevant unswitched spur checks in the approved procedure. Keep the row concise; no extra identification form. |
| arc-signalling-receipt | ARC signal tested and receipt confirmed, where connected? | Only an applicable monitored connection; requires an actual verified transmission/receipt test. |

Include **Additional Comments (optional)** after the checks. It is a free-text
draft field, not a seventh scored question, a completion requirement or a substitute
for a mandatory FAIL explanation. Blank comments must remain valid.

## Result controls and layout

- Place these under **System Checks** in the selected system flow, separate from
  Device Testing. Do not insert them into every device card or add administrative
  menus, repeated panel identification forms or a new migration screen.
- One short question per row with large PASS / FAIL / N/A controls. All results
  start unanswered; there is no Pass All action or preselected outcome.
- PASS is one tap with no extra typing. N/A is one tap with no explanation. FAIL
  reveals a short required fault explanation; whitespace does not satisfy it.
- Permit partial saves and continuing to other checks while a FAIL reason is being
  typed. A FAIL without its explanation is not a completed check. Unanswered checks
  never count as completed. Changing an outcome retains earlier saved fault text
  safely without making notes mandatory for PASS/N/A.
- Keep one short Pending Validation notice. No raw template IDs, storage IDs,
  repeated standards paragraphs, extra required PASS fields or certification claims
  appear in the normal engineer view.
- Device tested/failed totals continue to count devices only. Any System Checks
  progress is separate and must not inflate or reset the Device Testing counts.

## Applicability and ARC verification

Applicability comes from the private installed-system configuration and actual
equipment, never a global MxPro family template or a device PASS count. Do not infer
that a communicator exists because a panel family supports networking. Networking
capability is not evidence of an ARC connection or successful signalling.

For a recorded monitored connection, include the ARC row. Where connection status
is unknown, retain the conditional wording and leave it unanswered; do not assume
absence, hide uncertainty or automatically select N/A. For a confirmed unmonitored
system, N/A is available without a reason when the row is shown. The technically
approved template must settle final applicability/presentation consistently;
do not add an extra required communicator-identification form to this stage.

An engineer's one-tap PASS records their explicit confirmation that transmission
was tested and receipt verified. The application must not automatically assert
PASS based on a panel indication, a connected network, the presence of an ARC
configuration, previous visits or elapsed time. Do not claim the application itself
verified receipt when it has no approved integration to do so. Retain any legitimate
existing signalling-test reference with the work record if available; this plan
does not add a mandatory reference/comment field for PASS or N/A.

## Offline draft extension: compatibility first

Reuse the existing Fire Alarms storage/session protocol and fixture-only namespace,
two-copy persistence, read-back acknowledgement, session isolation, save draining,
navigation guards and explicit archive-before-recovery behaviour.

The current Fire Alarm draft is a strict schemaVersion 1 with device answers only;
do not append system fields without a reviewed versioned reader/validator. Plan a
compatible draft extension containing a distinct System Checks template snapshot,
stable check IDs/results/fault explanations and an optional comments string.
Never use system-check IDs as device IDs or replace the existing device-answer list.

Preserve original raw copies before any schema upgrade. Existing device IDs,
results, fault notes and recovery copies must survive unchanged. Attaching the
new candidate system snapshot starts only its checks unanswered; it must not
reset device results, infer answers or silently update an existing checklist
snapshot. Older app builds must fail closed on a newer unsupported draft version
rather than discard it. Fixtures remain separate from real company data.

Autosave system answers, FAIL explanations and optional comments to the local
system draft. They must survive filters, Back/bottom navigation, restart and
temporary network loss. Save failure retains editor work and stored copies;
recovery remains explicit. No per-question timestamps, button-press history,
activity tracking or office progress feed is introduced. Nothing is uploaded or
marked Synced/submitted by this plan. Later job completion synchronisation remains
a separately reviewed explicit operation.

## Implementation and test sequence

1. Add a versioned candidate System Checks definition and pure validation/progress
   tests using fixtures only. Validate applicability against recorded system data;
   do not invent manufacturer procedures or numerical electrical limits.
2. Extend the Fire Alarm local draft reader/validator with migration/recovery tests
   before adding the UI section. Keep the working Device Testing contract intact.
3. Render the compact section and optional comments using the existing controls/
   offline protocol. Test PASS/N/A without notes, FAIL/whitespace validation,
   continuing after FAIL, no defaults, optional blank comments, changed outcomes,
   save/resume, hidden-device preservation through filters, rapid edits, failed
   writes, process restart, user/company switching and explicit damaged-copy recovery.
4. Test monitored/unmonitored/unknown ARC configurations, no automatic PASS/N/A,
   and preservation of manually confirmed outcomes. Verify visible-only wording
   never implies inspection of concealed wiring. Run existing device, tenant,
   catalogue and extinguisher regressions as well as native Expo Go checks.

## Technical approval and certification gate

Before certification is enabled, a competent technical reviewer must validate the
**complete final checklist**, applicability and procedures against the licensed
BS 5839-1:2025 text and the exact panel, power-supply/protective equipment and
communicator manufacturer's documentation. Capture the approved checklist version,
sources and review decision. A public standards summary or catalogue metadata alone
does not establish this validation.

Reference for obtaining/reviewing the standard:
[BSI BS 5839-1:2025](https://knowledge.bsigroup.com/products/fire-detection-and-fire-alarm-systems-for-buildings-design-installation-commissioning-and-maintenance-of-systems-in-non-domestic-premises-code-of-practice).
The licensed technical content has not been reviewed as part of this plan update.
No BS clause mapping, complete compliance claim or manufacturer sign-off is asserted.

Formal certification and submission remain disabled until both the technical
procedures and secure server submission contract are approved and implemented.
No production rules/deployment, record changes, UI changes or draft migrations
are authorised or performed by this document update.
