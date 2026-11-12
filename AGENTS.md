This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Core product principle: no employee tracking

InstaFirePilot is a professional fire safety work and inspection application, not
an employee surveillance platform. This applies to future features, integrations,
analytics, data models and office views.

- Do not implement GPS tracking, movement histories, activity monitoring,
  individual button-press tracking, per-question timestamps, productivity scoring
  or time-on-screen monitoring. Do not infer these indirectly from other data.
- Office visibility is limited to assigned jobs, explicit job statuses, completed
  inspection results and submitted-work review. Checklist progress and servicing
  draft saves remain private in the engineer's local draft until explicit job
  completion synchronisation; no per-question uploads or listeners.
- Collect only information necessary for scheduling, legitimate inspection
  records, defects, compliance documentation and approvals. Do not repurpose
  local recovery/save metadata into an employee activity feed.
- Limit audit logs to meaningful record and approval events, such as explicit
  job start/completion, submitted records, authorised corrections and reviews.
  Do not log interactions or draft activity as surveillance.
- Tracking capabilities require explicit prior user approval; ordinary feature
  requests, SDK defaults or analytics availability do not authorise them.

See [the product privacy principle](docs/no-employee-tracking.md).

## Non-negotiable multi-tenant data isolation

- Use one centrally managed, versioned global equipment catalogue across fire
  alarm panels, fire extinguishers, emergency lighting, fire doors and fire
  blankets. Shared definitions contain no customer installation or private data.
- Customer installations reference catalogue versions but retain company-private
  configurations, assets, inspections, defects, service histories and files.
  Catalogue updates must not overwrite site configuration or historical records.
- Never permit access to another company's private data. Enforce company isolation
  with Firebase Security Rules and trusted backend authorisation, not UI filtering.
  Apply the same boundary to Storage, queries, offline caches, backend functions
  and office portal access. Shared catalogue access never grants customer access.
- Before production release, automated cross-tenant access tests must pass for
  every equipment module and its associated files. Existing extinguisher tests
  alone do not establish coverage for other modules.
- Do not create test fire alarm records or modify production Firebase until the
  data model and permissions have been reviewed. Review does not itself authorise
  deployment or migration; obtain the required explicit production authorisation.

See [the catalogue and tenant isolation proposal](docs/global-catalogue-and-tenant-isolation.md).

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
