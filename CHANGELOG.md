# SimHub Change Log

All notable changes to SimHub are documented in this file, newest first.

---

## [2026-07-05] - Production Hardening

*   **Forced First-Login Password Rotation**: Provisional passwords — the seeded default accounts, admin-created accounts, admin password resets, and bulk-generated temporary passwords — must now be changed at first sign-in. Enforcement is server-side: every API call except the rotation flow itself is rejected until the owner sets their own password, so a known default credential cannot be used to read or change data. The UI presents a dedicated, non-dismissable "Set a New Password" modal and only loads the app once the rotation completes.
*   **Session Hygiene on Admin Resets**: When an administrator resets another account's password, that account's live sessions are revoked immediately, so the old password cannot outlive the reset.
*   **Persistent Sessions**: Active sign-ins are now persisted to `data/sessions.json` (written atomically), so a server restart or redeploy no longer signs everyone out. Expired entries are dropped on load and during the periodic sweep.
*   **Reverse-Proxy Support**: New `TRUST_PROXY` environment variable (`1` or the number of proxy hops) so login rate-limiting sees real client IPs behind nginx/Caddy/etc. Off by default so direct-connect deployments cannot be IP-spoofed.
*   **Login Screen**: Removed the demo-credentials disclosure panel.

## [2026-07-05] - Reliability & Data-Safety Fixes

*   **Corrupt-File Resilience**: A single unreadable JSON file no longer takes down a whole endpoint. The scenario catalog, programme list, recycle bin, and backup export now skip damaged files (logging them server-side) instead of returning a 500 for everything.
*   **Atomic Writes**: `users.json`, scenarios, and programmes are written via temp-file-plus-rename, so a crash mid-write can never leave a half-written file behind — previously a corrupted `users.json` silently reset all accounts to defaults on the next boot.
*   **Consistent Deletion**: Scenario deletion no longer reports failure after already moving the scenario to the recycle bin when a programme file is unreadable; per-programme cleanup failures are logged and skipped.
*   **JSON Error Responses**: Malformed or oversized request bodies now return a JSON error with the correct status instead of Express's default HTML error page (which can leak stack traces outside production).
*   **Session & Throttle Sweep**: Expired sessions and stale login-throttle entries are pruned on a 15-minute timer instead of only when next touched, preventing unbounded memory growth.
*   **Client Robustness**: User emails are URL-encoded in API paths (emails containing `%` previously broke routing); corrupted `localStorage` no longer prevents the app from loading; failures loading the programmes view now surface as an error toast instead of a silently empty page.

## [2026-06-19] - Programme-Scoped Editor Role

*   **New Middle Tier**: Added an **Editor** role between Admin and Read-Only. Editors can create, edit, and delete scenarios **only within the programmes they are allocated to**, and remain read-only everywhere else. Admins keep full access; Read-Only is unchanged.
*   **Server-Side Enforcement**: Authorisation is enforced on the API, not just hidden in the UI. Scenario `PUT`/`DELETE` require the scenario to belong to one of the Editor's allocated programmes; `POST` requires the new scenario to be attached to an allocated programme (it's added to that programme automatically). Allocations are read live so changes take effect immediately, and the last-admin guards are unaffected.
*   **Allocation Management (Admins only)**: The user create/edit modal gains an *Editor* option and an **Allocated Programmes** checklist; allocations are validated against existing programmes server-side. Programme creation and scenario-to-programme membership remain Admin-only.
*   **UI**: Violet *Editor* badge (with allocated-programme count) in the user table and header, an *Editor* option in the role filter and bulk role actions, per-scenario Edit/Delete buttons that appear only when the current user may edit that scenario, the *New Scenario* action enabled for Editors, and a required **Programme** selector when an Editor creates a scenario. `programmeIds` is exposed via the users API and login/session.

## [2026-06-19] - Account Activity Columns

*   **Created & Last Login**: The user administration table now shows when each account was created and when it last signed in, making stale accounts easy to spot and prune. `createdAt` is stamped on user creation (single and bulk) and `lastLogin` is recorded on every successful login (best-effort persistence that never blocks sign-in); both are exposed via the users API and included in the CSV export.
*   **Stale Highlighting**: Accounts that have never logged in, or whose last login is older than 90 days, are flagged with an amber cue. Last-login is shown in friendly relative terms ("Today", "3 days ago") with the full timestamp on hover.
*   **Backwards Compatible**: Accounts created before this change report "Unknown" creation and "Never" login rather than a misleading value, until their next sign-in records real data.

## [2026-06-19] - Self-Service Password Change

*   **Change Your Own Password**: Any signed-in user (not just Admins) can now change their own password via a "Change Password" item in a new dropdown under the user chip. New `POST /api/me/password` endpoint re-authenticates with the current password, enforces a minimum length, and rejects reusing the current password.
*   **Session Hygiene**: On a successful change, every *other* live session for the account is revoked while the caller's own session is preserved, so a leaked or stale session cannot outlive a password rotation.
*   **UI**: The header user chip is now a dropdown (caret, click-outside / Escape to close) hosting the change-password action; the modal offers a one-click strong-password generator and validates match/length client-side before submitting.

## [2026-06-11] - Account Disable / Suspend

*   **Reversible Suspension**: Accounts can now be disabled instead of deleted (rotating faculty, leave of absence). Disabled accounts cannot sign in — the check runs only after password verification so the flag is not enumerable — and their live sessions are revoked immediately. Re-enabling restores access with no data loss.
*   **Bulk Disable/Enable**: New `disable`/`enable` actions on `POST /api/users/bulk` with the same server-side batch guards as delete/set-role: your own account is skipped, and a batch can never leave the system without an active Admin.
*   **Last-Admin Guard Fix**: The "at least one Admin must remain" guards now count only admins who can actually sign in, so a disabled Admin can still be demoted or deleted safely.
*   **UI**: Amber "Disabled" badge with dimmed row styling in the user management table, Disable/Enable buttons in the bulk action bar behind confirmation dialogs, and an Active/Disabled status column in the CSV export.

## [2026-06-10] - User Administration Upgrade

*   **Management Table**: The user-card grid is now a proper management table with live search, a role filter, an account count, and per-row edit/delete actions.
*   **Bulk Operations**: Select accounts via checkboxes (header checkbox selects all visible) and apply bulk role changes or bulk deletion from an action bar. New Admin-only `POST /api/users/bulk` endpoint validates the entire batch server-side — your own account is skipped, and a batch can never remove or demote the last Admin.
*   **Bulk Add**: Paste `email, name, role` lines (role optional, defaults to Read-Only) to create many accounts at once via `POST /api/users/bulk-create`. Secure temporary passwords are generated server-side, shown exactly once, and downloadable as a credentials CSV; invalid rows are reported with per-row reasons.
*   **Password Generator**: The add/edit user modal gains a one-click strong password generator that copies to the clipboard.
*   **CSV Export**: Download the account list (email, name, role — never credentials) as CSV.

## [2026-06-10] - Premium UI Overhaul

*   **Confirmation Dialogs**: Replaced every native browser `confirm()` with a styled in-app dialog (`app.confirm()`) featuring a blurred backdrop, scale-in animation, danger styling for destructive actions, Escape/backdrop-click dismissal, and safe text injection.
*   **Toast System**: Toasts now stack, slide in/out with animation, and carry an auto-dismiss progress bar; rapid successive messages no longer clobber each other.
*   **Dashboard**: New stats strip (scenario/programme counts, total run time, review-due-within-90-days warning), search box with icon + `/` keyboard shortcut + live result count, shimmer skeleton loaders while the catalog fetches, and friendlier empty states with a create CTA.
*   **Scenario Wizard**: The seven flat tabs are now a numbered stepper with completed-step checkmarks and connecting lines, plus a sticky footer so Back/Next/Save never scroll out of reach.
*   **Scenario Detail Sheet**: Content is centered with a sticky "On this page" table of contents featuring scroll-spy highlighting and smooth anchor scrolling.
*   **Run HUD**: Full-width scrolling ECG strip with a synthetic PQRST waveform paced live by the active phase's heart rate, a pulsing LIVE indicator in the monitor header, and a flash animation on vitals when phases transition.
*   **Design Discipline**: Single blue brand accent for section headings (semantic colors reserved for meaning), quieter borderless badge pills, spacing-scale tokens, tabular numerals on timers/vitals, visible `:focus-visible` keyboard rings, thin rounded scrollbars, deeper light-theme shadows, and `prefers-reduced-motion` support.
*   **Login**: Slow drifting aurora background, demo credentials tucked behind a disclosure, password/email/date inputs now styled consistently (fixes the unstyled native password field).

## [2026-06-10] - Security & Reliability Hardening

*   **Session Security**: Tokens are now 256-bit crypto-random values (previously timestamp + `Math.random`), sessions carry an 8-hour sliding expiry, deleting a user revokes their live sessions, and role/name changes propagate into active sessions immediately.
*   **Login Protection**: Added per-IP/email brute-force throttling (10 failures per 15 minutes → `429`), switched password verification to non-blocking async scrypt, and equalised response timing for unknown accounts to prevent email enumeration.
*   **API Input Validation**: User-administration endpoints now enforce an email format check and an `Admin`/`Read-Only` role whitelist; the user store is a null-prototype object (immune to `__proto__`/`constructor` key tricks); the last remaining Admin account can no longer be deleted or demoted.
*   **Stored XSS Hardening**: User emails are no longer interpolated into inline `onclick`/`onsubmit` handler strings (HTML entity escaping is undone by the parser in that context); the admin users grid and user/programme modals now bind events via `data-*` attributes and `addEventListener`.
*   **Toast Notification Fix**: `showToast` destroyed its own text element on first use, silently suppressing every subsequent notification (including save errors). Toasts now render reliably on every call.
*   **Robustness & Hygiene**: Scenario creation returns `409 Conflict` instead of silently overwriting an existing file; unknown `/api/*` routes return a JSON `404` instead of the SPA shell; request body limits are scoped (2 MB default, 50 MB only for backup import); baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) are set on all responses; CDN assets carry Subresource Integrity hashes; admin credentials are no longer pre-filled in the login form; the dashboard no longer crashes when the selected programme was deleted; the debrief view requires an active run; ASPiH mappings match by exact domain; dead (unenforced) `required` attributes were removed from the scenario wizard; `puppeteer-core` moved to `devDependencies`. Verified against the full QA (37/37) and Puppeteer UI suites.

## [2026-06-09] - Critical Security Hardening

*   **Password Hashing**: Migrated credentials from plaintext to salted **scrypt** hashes with constant-time verification. Passwords are no longer returned by the user-administration API, user updates accept a blank password to retain the current one, and existing `users.json` records are automatically re-hashed on startup.
*   **Path-Traversal Protection**: Client-supplied identifiers for scenarios, programmes, recycle-bin items, and backup imports are now validated against a safe character set before any filesystem path is built, blocking directory-escape writes. Scenario creation also now returns a correct `201 Created` status.
*   **Stored XSS Prevention**: All user-authored content is HTML-escaped before rendering across the catalog, programmes, admin users, recycle bin, scenario detail sheet, run HUD, PEARLS debrief, toasts, and every scenario wizard field (form values round-trip safely on save). Verified against the full QA (37/37) and Puppeteer UI suites.
*   **Scenario Edit Fix**: Resolved an out-of-scope variable reference in the scenario wizard that silently aborted population of the dynamic repeaters (learning outcomes, SBAR handovers, faculty, equipment, medications, progression phases, and version history) when editing an existing scenario. Editing now fully reloads all sections and the form view.

## [2026-05-29] - Feature & Security Expansion

*   **Scenario Backup & Restore (Export/Import)**: Added secure, Admin-only JSON scenario database export and import endpoints protected by Bearer token auth, integrated a premium sidebar control widget, and expanded Puppeteer/QA test suites to 37 successful checkpoints.
*   **Clinical Code Base Fixes**: Resolved a leftover conflict marker (`<<<<<<< HEAD`) in `components.js` to restore flawless, instant catalog loading.
*   **User Administration**: Migrated credentials to JSON flat-file storage (`data/users.json`) and added Admin-only CRUD routes protected with lockout guards.
*   **Scenario PDF Export**: Integrated client-side vector PDF downloading using `html2pdf.js` styled with print-contrast clinical layouts.
*   **Scenario Recycle Bin**: Re-routed deletions to a recovery folder (`data/recycle_bin/`) enabling Admin-only file restoration or hard erasure.
