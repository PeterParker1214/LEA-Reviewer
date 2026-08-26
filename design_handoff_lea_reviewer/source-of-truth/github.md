repo: PeterParker1214/LEA-Reviewer
branch: main

## Last sync

date: 2026-08-25T07:19:08Z

### Updated in this project

- Recreated the current UI (home/auth, subject dashboard, subject page, quiz, results) from source.
- Proposed a phone-first restructure: one merged subject list, three run modes, flag/skip/jump, action-led results.
- Designed the new modes: daily drill, mock exam, question map, search, saved items, standings, display name.
- Report-a-question plus admin editing, authored on admin.html's real components after reading the file in full.
- Added onboarding, drill reminders and profile pictures, then light-mode and desktop passes.
- Shipped slice 1 as real code: build/index.html removes the source layer from the repo's index.html.

## Screen map

| Project screen | Repo files |
| --- | --- |
| 1a Current UI — Home signed out / subject dashboard | index.html, assets/theme.js |
| 1a Current UI — Subject page | subjects/structural/index.html, assets/module-progress.js, assets/presence.js |
| 1a Current UI — Quiz question / results | subjects/structural/quizzes/… , assets/quiz-resume.js, assets/sfx.js |
| 2a–2e Proposal — Home / Subject / Quiz / Results / Sign in | same sources, restructured (no new tokens) |
| 3a–3h New modes — drill, mock exam, question map, search, saved, standings, display name | index.html tokens + module-progress.js, quiz-resume.js semantics |
| 4a Report sheet | quiz page shell (subjects/*/quizzes/*.html) |
| 4b Admin — reports tab | admin.html |
| 5a Admin — question form from a report | admin.html `renderQuestionsList()` .q-card / .q-opts / .field-label / .save-status |
| 5b Admin — Pages & Quizzes with collapsed rows | admin.html `renderPagesTab()` / `renderQuizEditor()`, .file-list / .file-item |
| 5c–5e Onboarding / reminders / profile | new; toggles use admin.html's .toggle-btn (.on = green) |
| 6a–6b Light mode — Home / Quiz | index.html `body.light-mode` tokens |
| 7a–7b Desktop — Home / Quiz | index.html tokens; 720px column replaced by 296/flex/264 and a persistent question map |

## admin.html components used verbatim

- `.wrap` max-width 820px; `h1` 36px Big Shoulders 800 uppercase + `.sub` muted 14px.
- `.tab-btn` padding 10px 16px, 14px, radius 8px 8px 0 0, no bottom border, bg `--bg-panel-deep`; `.active` = `--bg-panel` + gold-bright + 600. Tabs today: Subjects / Pages & Quizzes / Add Module (Reports is the proposed fourth).
- `button` padding 7px 10px, 13px, radius 8, bg `--bg-panel-deep`; `.primary` = gold bg, `--bg-deep` text, no border, 600; `.danger` = bad border+text; `.toggle-btn.on` = good border+text.
- `input/textarea/select` padding 8px 10px, radius 8, bg `--bg-panel-deep`, 14px, width 100%.
- `.card`, `.q-card`, `.q-opts` (grid auto/1fr, radio + text), `.field-label`, `.row`, `.status-tag`, `.actions`, `.save-status.ok/.err`, `.msg.info/.error`, `.file-list`/`.file-item`.
- Saving goes through `callSave(path, content, message)` → Supabase function `admin-save-file`; the commit message is generated in code (`Admin: update quiz — <path>`), so no message field belongs in the UI.

## Shipped code

| File | Purpose |
| --- | --- |
| build/index.html | Patched root index.html — source layer removed, subject list merged. Ready to copy over index.html. |
| build/index.original.html | The file it was patched from (main @ 2026-08-25), for diffing. |
| build/README.md | What changed, what was verified, and the follow-ups it exposes. |
| build/assets/theme.js | Copied only so build/index.html previews locally; the shipped file resolves assets/theme.js at the repo root. |

## Notes

- admin.html's existing per-question form has a danger "Delete this question". Mastery is stored as question INDICES, so deleting shifts every later index — the proposal replaces it with Hide (keeps the slot, stops serving). Full rules in engine-spec.md §4.
- The "Add Module" tab already auto-detects four quiz formats (native / blueprint / practice / generic) and appends a LEAProgress adapter — the one-engine work in engine-spec.md should absorb this rather than duplicate it.
- Sources (A–D) are dropped in the proposal: remove `SOURCES`, `currentSourceId`, `leaLastSource` and every `?source=` link (admin.html's generated subject pages emit these too).
- Avatars need a storage bucket + `profiles.avatar_url`; the presence payload currently carries only `username`.
