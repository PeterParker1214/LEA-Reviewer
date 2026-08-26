# Slice 1 — remove sources

`build/index.html` replaces the repo's root `index.html`. `build/index.original.html` is the
file it was patched from (main @ 2026-08-25), so you can diff before copying.

44,052 → 37,849 bytes. Nothing but the source layer was touched.

## What changed

- Deleted the `SOURCES` array and the `source:` field on every entry in `SUBJECTS`.
- Deleted `openSource()`, `backToSources()`, `currentSourceId` and both back-link handlers.
- Deleted the `#sourcePanel` and `#comingSoonPanel` markup, the "← All sources" button, and the
  now-dead `.source-*` / `.coming-soon-panel` / `.back-link` CSS.
- `renderSubjectGrid()` no longer filters by source — it renders all ten subjects.
- `showSignedIn()` no longer reads `?source=` or `localStorage.leaLastSource`; it shows the
  subject panel directly. Signing in now lands on the subject list instead of a picker.
- Removed the parse-time `renderSubjectGrid()` call; it renders once progress has loaded, as before.

Checked: both inline scripts parse, every `getElementById` target still exists in the markup,
65 divs open and close, and no reference to `SOURCES`, `currentSourceId`, `leaLastSource`,
`sourceGrid`, `comingSoon` or `source-card` remains.

## Follow-ups this exposes (not in this slice)

1. **Subject and quiz pages still link `../../index.html?source=jpt`.** Harmless — the param is
   now ignored — but worth stripping. Affects every `subjects/*/index.html` and
   `subjects/*/quizzes/*.html`, plus `subjects/architectural-design.html`,
   `building-technology.html`, `professional-planning.html`.
2. **`admin.html` generates `?source=` links** in `buildSubjectIndexHtml()` and
   `buildAdaptedQuizHtml()` (its `includeBackLink` branch), and its Subjects tab writes
   `SOURCES` back into `index.html` when saving. Both need updating or the source layer
   reappears the next time an admin saves.
3. `SUBJECTS` still carries `totalQuestions` / `totalModules` duplicated from each subject page.
   The manifest in `engine-spec.md` §3 replaces that.

## Not done here

The home screen redesign (screen 2a — countdown, streak, drill, search) is a separate slice.
This one only removes the source gate, so it can ship on its own and be reverted on its own.
