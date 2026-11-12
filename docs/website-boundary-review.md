# Website boundary review

The independently maintained public website is at `D:\Instafire Pilot Website\website`. It contains its own Vite/React package and public-site Firebase Hosting configuration. The candidate root Firebase configuration continues to serve only the Office Portal.

The 29 historical website paths in the application repository have 17 differing and 12 identical counterparts in that independent tree. Their purpose is public marketing, product content, imagery, navigation, SEO and website build tooling; they are not engineer/office app modules. Newer public pages include pricing, contact and engineer downloads.

Deletion intent remains unconfirmed. Keep all 29 deletions out of the proposed app checkpoint. Once the owner explicitly confirms the independently maintained root as authoritative, use a separate documented boundary commit to record removal of these legacy paths while retaining every earlier version in Git history. Do not rewrite history, restore old files or merge the separate site automatically.

Until that decision, a fresh checkout of the proposed app checkpoint would retain the historical website tree even though it is absent from the current candidate worktree. The app/portal/backend scripts do not depend on that tree. This is an explicit unresolved repository boundary, not an approved deletion.
