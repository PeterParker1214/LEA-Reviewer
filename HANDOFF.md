# LEA Reviewer — admin panel handoff

Context for continuing work on `admin.html`. Written after a session that
converted the question bank to a single format and rebuilt two of the tabs.

## The app in one paragraph

Static site on GitHub Pages. `index.html` → `subject.html` → `run.html?s=<subject>&m=<module>`
is the reader's path. `data/subjects.json` is the manifest: every subject has a
`modules[]` list, each entry `{ id, no, title, total, file, format }`.
`assets/quiz-source.js` (`LEAQuizSource`) is the single reader for module
questions — **treat it as the source of truth for how a module is parsed.**
`admin.html` is a separate password-gated page that edits the repo through a
Supabase edge function (`admin-save-file`) which commits to GitHub.

Canonical question shape: `{ s, q, o[], c, n, ref?, img?, hidden?, scenario? }`
— `s` topic, `q` stem, `o` choices, `c` index of the correct choice, `n`
explanation.

## What was just done (already deployed)

- **All 76 modules are now `format: "json"`.** 17 legacy standalone HTML quiz
  pages were converted and archived to `archive/legacy-quiz-pages/`.
- **Reports tab rebuilt** — reports open inline with a full question editor;
  "Save fix & tell <name>" writes the fix then closes the report and notifies
  the reporter. Reader-side notification lives in `run.html`
  (`checkReportUpdates`). DB has `admin_reply`, `replied_at`, `resolved_at`,
  `seen_by_reporter` on `reports`, plus a `mark_reports_seen()` RPC.
- **Rework tab rebuilt** — batch queue (`rwJobs`), one card per dropped file
  with its own destination, shared shuffle options, per-question editor, and a
  single save pass that writes the manifest once at the end.
- **Add Module tab deleted** — it only added back the HTML format that was just
  removed. (This was written before the tab was actually removed; it is now
  gone — `grep -n "tab-btn\|tabUploadEl\|renderUploadTab" admin.html` returns
  nothing.)
- Source numbering ("36. A foreign architect...") is now stripped on import by
  `stripLeadingNumber` in `assets/quiz-rework.js`.
- `run.html` hides a topic label when it gives away its own answer
  (`topicGivesAwayAnswer`) — 698 questions were affected.

## Remaining work, in order

### 1. Subjects tab — done
Rebuilt as one collapsed card per subject, in the `.rep-*` shape: head shows
the name, an Available / Coming soon pill and "4 modules · 210 questions";
tapping it opens the editor (name, the line under the name, show-to-readers,
the module list, Move up / Move down, Delete subject). The ↑/↓ glyphs, the
`data/subjects.json` path, the subject id and each module's file path are all
gone from the screen — the paths still live in the Pages tab. The unlisted-file
scanner moved into a closed `<details>` at the bottom.

Which cards are open is held in `openSubjects`, a Set of subject **ids**, not
indexes: re-rendering after a toggle or a Move up must leave the card the owner
is working in open, and an index would follow the wrong card the moment two
subjects swap places. Nothing about the manifest, the removal bookkeeping
(`removedModuleKeys`, `pendingModuleArchives`) or `saveSubjects` changed.

### 2. The shell — done
Five tabs (Subjects, Pages & Quizzes, Rework, Deleted, Reports), one nav
(bottom bar under 720px, sidebar above it), one `.panel-card` base every
family (`.rep-*`, `.rw-*`, `.subj`, and now the Deleted tab's cards) opts
into. Jargon and file paths are out of the tab copy; the Add Module tab and
its `tab-btn` markup are gone. The Deleted tab's headline is the module's own
name instead of the archive filename, restoring one is a single "Put it
back" button, and the module id is derived as `<subject-id>-<no>` rather
than typed — a restore that would collide is refused, never silently
renumbered. See `.superpowers/sdd/2026-09-04-admin-shell/` for the
task-by-task plan and reports.

### 3. Optional
Seven `.html` files in `subjects/*/quizzes/` are in no manifest and never were,
including a `PP_BldgLaws_Preboard_Quiz_Pedro.html` duplicated across two
subjects. Unreferenced; left alone deliberately. Decide separately.

## Things that will bite you

- **Read `assets/quiz-source.js` before concluding anything is broken.** It
  already resolves `fig` keys through a page's `FIGURES` table and rebases
  relative image paths against the module's own directory. Two wrong diagnoses
  last session came from not checking it first.
- **Never renumber or reorder questions.** `mastered[]`, `flagged[]`, `notes{}`
  and the `reports.question_ref` column are all keyed by
  `subject/module/index`. Hiding uses a `hidden: true` flag precisely so the
  slot survives. Same for module `id` and `no`.
- **Image paths are relative to the module file.** A module that moves needs
  its `img` values re-anchored, or every figure 404s.
- **Bump `VERSION` in `sw.js`** whenever `run.html`, another shell page, or
  `data/subjects.json` changes — they're precached, so installed users
  otherwise keep the old copy. Currently `lea-v8`.
- **`admin.html` has two large inline `<script>` blocks**, and block 1 contains
  template literals holding the literal text `<script>`. Split on whole lines
  when parsing the file programmatically, not on substrings.
- The manifest is fetched once and written once per save pass. Writing it per
  module makes each save race the previous commit.

## Testing without a browser

`admin.html` can be exercised in jsdom: create the DOM, then run both inline
script blocks with `vm.runInContext` against `dom.getInternalVMContext()` (a
plain `window.eval` does not put the declarations on `window`). Stub
`supabase`, `LEAQuizSource`, `LEAQuizRework`, `LEADocxQuiz`, `LEAConfirm`,
`LEAIcons`, `LEATheme` and `fetch`. That caught a real numbering-collision bug
in the batch save.

For module data, run `assets/quiz-source.js` itself with a `fetch` shim reading
from disk, snapshot all modules before a change and after, and diff. That is
what proved the 2,510-question conversion lossless.
