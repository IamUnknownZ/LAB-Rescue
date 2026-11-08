# COM LAB RESCUE UX Contract

## Product context

The game helps Thai-speaking beginners practise computer basics by repairing three stations. The principal flow is home → registration → three stations → results. Instructions, explanations and errors are Thai. Scores and technical names may use Latin characters.

Stored timestamps use UTC. When human-readable dates are shown, use the Thai locale and the Asia/Bangkok timezone. This project has no date-entry or billing workflow. Accessibility targets native semantics, visible focus, keyboard-equivalent actions, readable contrast and reduced-motion support; it does not claim an independent accessibility certification.

## Business-context sources

| Scope | Authoritative source | Type |
| --- | --- | --- |
| Learning content and scoring | data/question-bank.json and the accepted game brief | Product requirements |
| Visual identity | User's Neo Brutalist direction and DESIGN.md | Accepted design |
| Online transport and validation | docs/API.md and apps-script/Code.gs | API contract |
| Google deployment permissions | docs/GOOGLE-SHEETS-SETUP.md and the account owner's deployment | External setup |
| Handoff and deployment limits | docs/HANDOFF.md | Delivery boundary |

The online database choice is Google Sheets accessed through Google Apps Script. A static development server does not store learner data.

## Visual contract

src/style.css is the canonical token and shared component source. DESIGN.md documents its values and rationale. src/scene.js adapts those colours to 3D materials. One light theme is supported.

## Canonical UI Map

| Capability | Canonical owner | Allowed variant | Verification |
| --- | --- | --- | --- |
| Buttons and focus | Shared .btn, .icon-btn, .nav-btn in src/style.css | Primary, secondary, plain, small | Pointer and keyboard |
| Forms | Registration and Google setup helpers in src/app.js | Native inputs with app validation | Empty, invalid and valid submit |
| Dialogs | app.js wrapper around the single native dialog | Help, settings, pause, confirmation, review | Escape and focus restore |
| Status/toast | Shared app.js announce/status helpers | Information, saved, pending, error | Live region and persistent error |
| Scrollbars | Global src/style.css baseline | Bounded leaderboard table | Narrow and desktop layouts |
| Data table | Dashboard renderer in src/app.js | Read-only, 10 rows per page | Empty state and page bounds |
| Gameplay progress | GameStore in src/store.js | Local practice or online session | Answer, resume and completion tests |
| 3D interaction | createLab in src/scene.js | Current-station raycast plus DOM station buttons | Touch and keyboard-equivalent flow |

There is no custom listbox, table selection, date picker or bulk-delete workflow.

## Core state and scoring

- A round uses 12 unique questions, 4 from each station. Every station includes both question formats and both difficulty levels.
- The first answer determines 0 or 10 points. Reopening a result or resending a network event cannot increase the same answer's score.
- A station is complete after all four answers and their feedback acknowledgements.
- Completing all 12 questions finishes the mission; 9 correct answers (75%) passes the learning threshold.
- Gold requires 11–12 correct, silver 9–10, bronze 0–8 after completion.
- There is no speed bonus or countdown. Active time stops while paused or while the document is hidden.
- Question IDs and option order are retained when resuming the round.
- The bank version and public question snapshot must match the embedded bank before provisional grading. An incompatible unfinished or unsent save is retained without replacement, remains exportable, and requires the matching HTML version to continue. Closed, fully synced runs from an older bank become archived history while retaining the player profile; their scores do not enter the new bank's statistics.

## Flow ledger

| Operation | Trigger | Pending | Success | Failure recovery |
| --- | --- | --- | --- | --- |
| Register | Submit learner form | Disable submit; preserve fields | Start a new player session | Inline error; focus invalid field |
| Start/resume | Home action | One operation at a time | Play scene with current station | Keep usable save and explain recovery |
| Enter station | Scene or DOM station button | Robot moves; block duplicate entry | Show current question | Keep station available |
| Answer | Select an option | Block second submission | Show result and explanation | Preserve first answer; queue transient online writes |
| Continue | Acknowledge feedback | Save progress | Next question, next station, or results | Retain pending item and retry |
| Return home | Home action | Save checkpoint | Home with resume action | Persistent save error if needed |
| Restart | Explicit restart action | App-owned confirmation if a round is active | Abandon current round and create another | Preserve existing data if the operation fails |
| View statistics | Statistics action | Loading state in content region | Class results or labelled local data | Recoverable error or labelled cached data |
| Connect Google | Validate /exec URL | Disable form submit; show connection state | Store endpoint after health verification | Keep entered URL and show error |
| Export | Keep/download results | Create local JSON download | File contains results and pending records | Explain download problem without discarding progress |
| Change player | Settings action | Check unsent work and confirm | Return to registration | Require sync or export when unsent work would be discarded |

## Dataset navigation

The scoreboard displays a maximum of ten visible rows per page and clamps the active page to available results. Best completed run per learner is used within the current class and question-bank version; equal scores share a rank. An empty scoreboard displays guidance rather than fabricated sample players.

Dashboard pagination is transient application state. Player names, tokens and class membership are not encoded in public URLs. This is an intentional exception to shareable grid URL state because the game is a single-document activity with learner-specific data.

## Navigation and responsive behaviour

Screen titles name the current task. Main-content focus moves to the relevant page/heading after navigation. The room and question are side by side on larger screens and stacked on narrow screens. The question body remains naturally scrollable; it must not be clipped behind fixed controls.

A native dialog suspends station input. Its close button and Escape return to the prior activity without submitting an answer. Keyboard users can select the current station through labelled DOM buttons without aiming at a 3D object.

## Overlays and feedback

The single app-owned native dialog is canonical. Preserve its accessible title, visible close affordance and focus restoration. Confirmation is reserved for replacing a current round or changing a player where progress could be affected.

Toasts are shared, short-lived, non-interactive acknowledgements. Critical errors also remain in their owning form or save-status surface. Do not use alert(), confirm() or prompt().

## Online and offline resilience

- Local practice results remain local. Connecting an endpoint does not relabel an existing local round as an online result.
- Google Apps Script URL configuration is checked before entering online mode.
- The app persists an outbox for an existing online round and resends events in order after connectivity returns.
- Offline provisional answers require a compatible question snapshot. Every content or answer-key change must increment the bank version in both the frontend bank and Apps Script; hidden answer-key-only edits cannot be detected from the public question payload.
- The first accepted answer is immutable. Apps Script owns authoritative scoring and validates session membership, question order and allowed options.
- Duplicate events must return the original accepted outcome or an explicit conflict rather than applying twice.
- The UI distinguishes in-device saves, waiting-to-send state, online confirmation, and failure.
- Save at answers, stage transitions and regular checkpoints; do not depend solely on page unload.
- Newer writes from another tab must not be silently overwritten. Expose the conflict and offer reload/recovery through the existing state owner.
- On authorization failure, retain local pending records for recovery/export; never silently create a different online learner.

## Validation and privacy

Registration requires full name, student code, class/group and nickname. Learner codes remain strings to preserve leading zeroes. Invalid fields have aria-invalid and an associated error message. Form values remain after a failed request.

The student code is identifying information, not a password. The initial backend returns a player capability token; the browser retains it to resume its own online activity. Exported results omit that token. Public scoreboards show nicknames rather than full names or learner codes.

The teacher's Google Sheet remains private. Entering an Apps Script URL does not require a Google password or API key in the game. Cross-device identity recovery and institution-specific authentication follow the deployment handoff rather than being inferred from student codes.

## Verification

Required checks are the production build, store tests, Apps Script mock tests, and browser checks for complete gameplay, reload/resume, wrong answers, dialog behaviour and a narrow viewport. The static server must serve dist only and reject traversal/symlink escapes.

Live Google authorization, permissions, ContentService redirects, real sheet writes and concurrency must be verified by the deployment owner with the target account. Local mocks do not prove those external behaviours. Exact completed checks are recorded in docs/HANDOFF.md.

