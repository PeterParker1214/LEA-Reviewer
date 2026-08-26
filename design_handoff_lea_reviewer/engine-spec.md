# LEA Reviewer — one engine, one manifest

Goal: every subject renders from the same template + data. No more per-subject
page logic, no more 500 KB single-file subjects. **Existing progress must
survive** — see §4.

---

## 1. What exists today

Two patterns are in the repo:

| Pattern | Subjects | Shape |
| --- | --- | --- |
| Shared engine | structural, building-utilities, professional-practice, theory-of-architecture-and-planning, architectural-sites-proponents-styles | `subjects/<id>/index.html` + `quizzes/*.html`, mastery via `window.LEAProgress` |
| One-off monolith | history-of-architecture (514 KB), building-laws (93 KB) | `MODULES` + all questions inline in one page, own render code |

Shared scripts already doing the right thing, keep them:
`assets/module-progress.js` (mastery + Supabase `progress` blob),
`assets/quiz-resume.js` (unfinished attempt), `assets/theme.js`,
`assets/presence.js`, `assets/sfx.js`.

## 2. Target file layout

```
data/subjects.json            # the catalogue (replaces the SUBJECTS + SOURCES arrays in index.html)
data/<subject>/<module>.json  # one module = one question array
subject.html                  # ONE subject page, reads ?s=<subjectId>
run.html                      # ONE run page, reads ?s=&m=&mode=study|exam|drill
index.html                    # home: countdown, streak, drill, subjects
```

Sources are gone. Delete `SOURCES`, `currentSourceId`, the `leaLastSource`
localStorage key and every `?source=` query string.

## 3. Data format

`data/subjects.json`

```json
[
  { "id": "structural",
    "name": "Structural",
    "blurb": "Mechanics, strength of materials, and structural analysis.",
    "modules": [
      { "id": "masangkay-quiz1", "no": "01", "title": "Mechanics & Strength of Materials", "total": 30,  "file": "data/structural/01.json" },
      { "id": "veron-exam1",     "no": "02", "title": "RC Design & NSCP Provisions",      "total": 200, "file": "data/structural/02.json" }
    ]
  }
]
```

- `id` — **never change these**, they are the progress keys (§4).
- `no` + `title` — what the UI shows. Renaming these is free.
- `total` — trusted for the progress denominator, so keep it in step with the file.

Question object (already the shape used in the quiz pages):

```json
{ "s": "Statics of Structures",
  "q": "…question text…",
  "o": ["…", "…", "…", "…"],
  "c": 0,
  "ref": "NSCP 2015 Vol. 1 — reactions on simple spans",
  "n": "…explanation…",
  "steps": ["Total load = w·L = 6000 kN", "Symmetry → R = wL/2", "R = 3000 kN"],
  "img": "img/q0002.png" }
```

`steps` is new (the "＋ Steps" expander in 2c). Optional. `ref` must cite the
code or principle only — no quiz, author or reviewer name.

## 4. Progress migration — non-negotiable

Mastery lives in one Supabase row per user, `progress.data`, keyed
`data[subjectId][moduleId] = { mastered:[qIndex], bestCorrect, bestTotal, attempts }`,
mirrored in localStorage under `lea_progress_<subjectId>_<moduleId>_v1`.

Rules:

1. **Keep every existing `subjectId` and `moduleId` verbatim**, including the
   author-flavoured ones (`masangkay-quiz1`, `veron-exam1`, `annie-exam1`,
   `zhardei-preboard`, …). They are opaque keys; display names come from the
   manifest. Renaming them orphans saved mastery.
2. `mastered` holds **question indices**, so question order inside a module
   file must not change. Append new questions at the end; never reorder or
   delete. If a question must go, blank it and keep the slot.
3. The monoliths write under the same scheme (`history`, `building-laws`), so
   they migrate by moving their inline `QUESTIONS` into `data/…` files with the
   order preserved — no data change at all.
4. `__meta` (last-activity marker) stays as-is.

If a module ID ever must change, ship a one-time remap in
`module-progress.js`: `{ old: 'veron-exam1', new: 'structural-02' }`, union the
`mastered` arrays, keep the better best score, then delete the old key.

## 5. Run modes (all three on one page)

| Mode | Clock | Feedback | Writes |
| --- | --- | --- | --- |
| `study` | none | after each answer, full explanation | `markMastered` per correct answer, `recordRunScore` at end |
| `exam` | one global timer (200 items / 5 h, or 50-item sim) | only after submit | same, at submit |
| `drill` | none | after each answer | same — no SRS state, see §5.1 |

Shared: flag, skip, question map, resume (`quiz-resume.js` already stores
`{answeredCount,total,position,payload}` — extend `payload` with `flagged[]`).

### 5.1 Subject-page mode selector (not a launcher)

The three "run mode" rows on `subject.html` (Study / Mock exam / Drill my
misses) select a mode, they don't start a run directly — you can't resolve
"Study" to one specific module for a 12-module subject without guessing. The
gold-filled row is the *selected* mode, persisted per subject in
`localStorage` as `lea_mode_<subjectId>` (default `study`). The Modules list
below is the actual launcher: each row links to
`run.html?s=&m=&mode=<selected>` and shows a number relevant to that mode
(mastery % in Study, module length in Mock exam, unmastered+flagged count in
Drill).

**Mock exam** needs no dedicated exam-shaped module — any module can run
timed with feedback withheld until submit; the 200-item/5h vs. 50-item-sim
length choice is offered on `run.html` itself at start. Do not try to guess
an "exam" module by title/id matching — `exam`/`preboard` wording was
deliberately stripped from every module title for copyright reasons, so
nothing will ever match.

**"Drill my misses" is not the Daily Drill SRS** (§6). Two separate features
share the word "drill":

- **Subject/module-level** (built in `run.html`'s `study`-shaped `drill`
  mode): sources questions in *this module* that are absent from
  `mastered[]`, plus anything in `flagged[]`. No SRS state, ships on the
  existing progress schema.
- **Daily Drill** (screens 3a/3b, cross-subject): the SRS queue with
  `{box, dueAt, misses}` from §6. Separate feature, separate build step.

A subject/module with nothing left to drill (unmastered ∪ flagged is empty)
disables that row/card rather than starting an empty run — it reads as
"done," not as a dead click.

## 6. Daily drill (SRS)

Fixed **20 items a day**, mixed across subjects. Store per question:
`{ box, dueAt, misses }`, five boxes at 1 / 3 / 7 / 21 / 60 days.
Correct → next box; wrong → box 1, `dueAt` tomorrow. Selection order:
overdue → due today → most-missed unmastered → unseen. Streak increments the
first day all 20 are answered; extra practice doesn't advance the queue.

## 7. Offline

Cache `data/subjects.json` + the last 3 opened module files + the app shell in a
service worker. Search (3e) runs over cached files only, and says so. Writes
queue in localStorage and flush on reconnect — `module-progress.js` already
keeps the local cache warm, so this is mostly a flush-on-online listener.

## 8. Build order

1. `data/subjects.json` + extract the two monoliths into module files (order preserved).
2. `subject.html` from screen 2b, reading the manifest.
3. `run.html` with `study` mode = today's behaviour, then `exam`, then `drill`.
4. Home (2a) with countdown + streak; delete sources.
5. Search, saved list, leaderboard tabs, display-name step.
