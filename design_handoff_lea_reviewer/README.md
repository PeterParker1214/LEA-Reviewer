# Handoff: LEA Reviewer — restructure, new study modes, admin editing

## Overview

LEA Reviewer (`github.com/PeterParker1214/LEA-Reviewer`) is a static, GitHub Pages–hosted
reviewer for the Philippine architecture licensure exam (LEA). Supabase provides auth,
a per-user `progress` row, a `get_leaderboard()` RPC and realtime presence. There is no
build step: every page is hand-written HTML with an inline `<style>` block and inline
`<script>`.

This handoff covers three things:

1. **A restructure of the existing app** — the source-folder layer removed, one subject
   template for every subject, three explicit run modes, and results that end in an action.
2. **New capability** — daily spaced-repetition drill, timed mock exam, question map,
   search, saved items, standings with head-to-head, onboarding, drill reminders,
   profile pictures, and report-a-question.
3. **Admin work** — a Reports inbox and question editing, authored on `admin.html`'s
   existing components.

The driving constraints came from the product owner: reviewees are mostly on phones, some
on desktop, **most want it to work offline**, copy keeps its humour, and **existing saved
progress must survive** any rebuild.

## About the design files

`designs/LEA Reviewer - Current UI.dc.html` is a **design reference created in HTML** — a
prototype board showing intended look, layout and behaviour. It is **not production code to
copy**. It is one document containing 29 screen frames laid out side by side on a canvas,
plus a short caption under each frame explaining the design decision.

Your task is to **recreate these designs in the target environment**. For this project that
environment already exists and is deliberately plain: static HTML files, inline styles,
vanilla JS, Supabase via CDN, no bundler, no framework. Match that — do not introduce React
or a build step. If you are instead porting this into a new app, pick the framework that
suits it and treat the HTML as the visual spec.

`designs/support.js` is only the runtime that renders the reference board. Ignore it; it is
not part of the product.

Open the board in a browser and read the frame labels (`data-screen-label`) and the badge
ids (`1a`, `2a`…`7b`) — they are referenced throughout this README.

## Fidelity

**High fidelity.** Colours, typography, spacing and states are final and are taken from the
repository's own token blocks, not invented. Recreate pixel-perfectly using the values in
[Design tokens](#design-tokens).

Two caveats:

- Frames are drawn at **390px** (phone) or **1120px** (desktop) or **820px** (admin, matching
  `admin.html`'s `.wrap`). They are static — no scrolling, no live data.
- Screen group **1a** is a *recreation of the app as it exists today*, included so you can
  see what changes. Do not build 1a. Build 2a onward.

## Screen inventory

Badge ids match the board. Every frame carries a `data-screen-label` you can search for.

### 1a — Current UI (reference only, do not build)
Five frames recreating today's app from source: signed-out home, subject dashboard, subject
page, quiz question, quiz results. Useful for diffing against the proposal.

### 2a–2e — The restructured app (phone, 390px)

| Id | Screen | Purpose |
| --- | --- | --- |
| 2a | Home | One screen: countdown, readiness, streak, the three run verbs, resume, search, subject list |
| 2b | Subject | One template every subject uses; overall progress, run modes, topic breakdown, module list |
| 2c | Quiz — study mode | Question, answer, layered explanation, flag/skip, jump |
| 2d | Results | Score, one obvious next action, per-topic breakdown, mistakes with explanations |
| 2e | Sign in | Oversized wordmark, live countdown as motivation, labelled fields, keep-me-signed-in |

**2a Home** (390 × ~1900). Vertical stack, 16px side padding, 12px gaps:
1. Top bar — 44px power button, centred two-line wordmark (`Peter Parker's` 9px mono
   `.2em` over `LEA Reviewer` 22px Big Shoulders 800), 44px trophy button.
2. Presence strip — `#0a1520` on 1px border, 9px green dot with `box-shadow:0 0 6px`,
   `4 online` left, `◍ Offline-ready` right in `#8fc4ea`, 10.5px mono uppercase.
3. **Board countdown** — blueprint card (`#0e1c28`, 1px border, two 12px gold corner
   marks via `::before`/`::after`). Four split-flap panels in a
   `repeat(4,1fr)` grid, 8px gap: each `#0a1520`, 1px `rgba(111,168,207,0.28)`,
   a 50%-height white 4.5% top gradient, a 1px `rgba(0,0,0,0.55)` seam at 50%,
   value 34px Big Shoulders 800, label 8.5px mono `.14em`. Seconds panel uses a gold border
   and gold value. Ticks every second.
4. Readiness card — 84px conic-gradient ring (`#8fc4ea` to percentage, `#0a1520` rest,
   `::before` inset 8px filled `#0e1c28`), percentage 18px mono 600, title 20px, 1px gold
   rule at 60% opacity, two lines of 11px mono stats.
5. Streak card — title with inline flame icon, 7 day ticks (8px tall, gold filled /
   `rgba(111,168,207,0.18)` empty, 5px gap), then a one-line handwritten note with the
   number in gold mono. **Must stay one line** (`white-space:nowrap; text-overflow:ellipsis`).
6. **Daily drill** — the largest object: gold `#e0a83f` fill, `#1a1206` text, 12px radius,
   24px Big Shoulders title, `20 items →` 12px mono 600, 10.5px mono subline.
7. Two tiles side by side (`1fr 1fr`, 10px gap) — Mock exam (blue kicker), Topic drill
   (red kicker).
8. Resume card — 3px gold left border, `Unfinished attempt · Structural 02` kicker,
   module title, `Q84 of 200 · 3 h ago`, `Resume →`.
9. Search field — 13.5px, magnifier icon in `#8fc4ea`.
10. `Subjects` divider — 10.5px mono uppercase, 1px rules either side via flex.
11. Subject rows — name 17px Big Shoulders, percentage 10.5px mono (gold, or `#e2604a`
    under ~10%), 5px progress bar with the gold gradient. Then `All 7 subjects →`.

**2b Subject** (390 × ~1750). Back button, then a centred masthead (10px gold mono kicker,
38px Big Shoulders title, a marquee blurb — see [Interactions](#interactions--behaviour) —
and a full-width 2px gold rule). Then: overall-progress card with three stats spread
`space-between` (mastered / modules done / flagged) over an 8px bar; three run-mode rows
(01 Study on gold, 02 Mock exam, 03 Drill my misses, each 14px 16px with a 22px mono
number); a `Topics` card of rows — name, 64px bar, percentage, `→` — coloured `#e2604a`
under 70%, `#e0a83f` under 100%, `#5fbf82` at 100%; a `Modules` list where an in-progress
module gains a 3px gold left border and a `Resume Q84 →`; and a closing note about sync and
offline caching.

**2c Quiz — study mode** (390 × ~1500). Header: 44px back, centred `Structural · Module 01` /
`Question 7 / 30`, 44px flag button (gold border when flagged), 44px `⋯`. Then a 15-segment
tick strip (7px tall, 3px gap) using green/red/blue/gold/idle, a counts row, and a
`⊞ Jump` chip. The card is a blueprint frame with 12px corner marks: section tag (gold fill,
`#1a1206`, 10px mono `.1em`), a dashed `No clock · study mode` chip, question text
**17px weight 450 line-height 1.6** (deliberately not bold — 19px 600 tested as too heavy),
a dashed figure placeholder, then options at **min-height 56px** with a 1.5px dashed border
that goes solid on hover; answered states use `rgba(95,191,130,0.12)`/`#5fbf82` and
`rgba(226,96,74,0.12)`/`#e2604a` with a ✓ / ✕ at the end and 0.6 opacity on the rest.
The explanation panel below has a 3px left border in the verdict colour and **three layers** —
verdict (19px Big Shoulders), the worked reason, then `Rule` and `Source` rows in 10.5px mono
— plus three equal-width chips (`＋ Steps`, `✎ Note`, `↻ Drill`). Footer: `Skip` (52px,
blue) beside a gold `Next question →`.

**2d Results** (390 × ~1600). Blueprint card: kicker, **24 / 30** at 72px Big Shoulders 800
(the `/ 30` at 32px in `#8b98a5`), one comparison line (`80% — your best yet, was 71%`), a
**30-segment bar** (24 green, 6 red, 2px gaps) with `24 right` / `6 to revisit` beneath, a
1px rule, then `+6 questions newly mastered`. Then a gold `Drill the 6 now` primary and two
outline halves (`Queue for tomorrow`, `Retake timed`); a per-topic card; mistake cards with a
3px red left border carrying the question, your answer, the correct answer and a one-line
explanation; and a standings footer. **Deliberately excluded**: the streak (it lives on Home)
and any second copy of the same number.

**2e Sign in** (390 × 900, `overflow:hidden`). Decorative drafting geometry, absolutely
positioned and clipped: a 330px circle at `top:-120px;right:-130px` in
`rgba(224,168,63,0.22)`, a 210px circle at `top:-60px;right:-70px` in
`rgba(111,168,207,0.18)`, a 250px dashed square rotated 18° at `bottom:70px;left:-90px`,
and two `+` registration marks. Content: 10px mono `.28em` kicker, `LEA` in gold above
`Reviewer` at 60px Big Shoulders 800 `line-height:.86`, a 64px gold rule, a 16px handwritten
line, then a live `days : hrs : min` countdown beside `until the LEA · 17 January 2027`,
a Log in / Sign up segmented pair, two labelled 50px fields (9.5px mono `.14em` labels),
`Keep me signed in` (checked) with `Forgot?` opposite, a 54px gold `Start reviewing →`,
a Google button, and `4 reviewees studying right now` above a 1px top border.

### 3a–3h — New modes (phone, 390px)

| Id | Screen | Key detail |
| --- | --- | --- |
| 3a | Daily drill — run | Fixed **20 a day**, mixed subjects; each item shows *why* it surfaced (`Missed twice · due today`) in a dashed blue chip; subject tag replaces topic tag; `Later` + disabled `Pick an answer`; footer `All 20 keeps the streak · 14 left` |
| 3b | Daily drill — done | 62px gold ring with a check, `Done for today`, 7 day ticks with today lit, three stat tiles (16 right / 4 back tomorrow / +3 mastered), a blue-bordered `Tomorrow` card naming the queue, `Review today's 4 misses` primary, `Keep going anyway` outline, and an honest note that extra practice won't change tomorrow's queue |
| 3c | Mock exam — run | One global clock in a gold-bordered pill, 4px thin progress bar, a nowrap counts row, a dashed `No feedback until you submit` strip, options show `Chosen` not correct/incorrect, `Flag` + `Next`, `Submit exam early` underlined below |
| 3d | Question map | **Bottom sheet** (one-handed) over the dimmed exam — 2px gold top border, `box-shadow:0 -24px 60px rgba(0,0,0,0.5)`, legend, an 8-column `aspect-ratio:1` grid of states, and the two buttons that matter: `Go to 3 flagged`, `1 skipped` |
| 3e | Search | Gold-bordered active field, filter chips (All / Not mastered / Flagged / With notes), `12 of 2,838 questions` with `Drill all 12 →`, results carrying **status** (`Missed 2×`, `Mastered`, `Unseen`, `Flagged`) and the query bolded in gold, footer notes it runs on cached questions |
| 3f | Saved | Two tabs (`Flagged · 14`, `Notes · 6`), a `Drill all 14 flagged` primary, cards with a 3px gold left border where the user's note renders in **Architects Daughter** inside a tinted block, and per-card `Drill it` / `Edit note` / unflag |
| 3g | Standings | Overall / This week / Rivals tabs; a **closest rival** blueprint card (you vs the one person ahead, a two-tone bar, and a handwritten `57 questions behind. That's one drill and a half.`); then top 3 at display sizes, and **your row pinned** with a gold tint |
| 3h | Display name | `Step 1 of 1`, 40px two-line title, an explanation that this replaces the email prefix, a 54px field with a live green check, `Available` / `5 / 24`, three suggestion chips, `Continue →`, and `Changeable once, from your profile` |

### 4a–4b, 5a–5b — Reporting and admin

- **4a Report sheet** (390 × 900) — reached from the quiz card's `⋯`. Bottom sheet with a
  **red** 2px top border (the one report-a-problem action in a run), four single-select
  reason rows at 48px, an optional comment in the handwriting face, a red `Send report`,
  and `Queues offline · sends when you reconnect`.
- **4b Admin — Reports** (820px) — a **fourth tab** in `admin.html` beside Subjects /
  Pages & Quizzes / Add Module. Grouped **by question, not by report**: three people flagging
  one item is one card with a count. Key disputes show the disagreement inline
  (`Key: C · 6000 kN` / `Reporters: A · 3000 kN`). Actions: Edit question, Change key to A,
  Hide item, Dismiss.
- **5a Admin — question form** (820px) — `admin.html`'s **existing** `.q-card` reached from a
  report. Same `.field-label` copy verbatim (`Question 7 — topic/section`, `Question text`,
  `Answer choices (mark the correct one)`, `Reference (optional)`,
  `Explanation note (optional)`), same `.q-opts` radio + text grid, same `Save to site` +
  `.save-status`. New: the report banner, a `Solution steps` field, the key-change
  consequence line, and **`Hide this question` replacing the existing danger
  `Delete this question`**.
- **5b Admin — Pages & Quizzes** (820px) — the real file search + `.file-list`, tab-title and
  heading fields. What changes: today all 30 questions render as open forms, so finding the
  broken one means scrolling past 29. Rows collapse to a `.row` per question, expanded only
  where you are working, with report counts on the file list and an `Only reported` filter.

### 5c–5e — Onboarding, reminders, profile

- **5c Onboarding** — three screens, skippable, shown once. Progress as three 26×4px bars.
  Each teaches one thing the app does differently; the frame shows step 2, *"Mastered means
  right once"*, using the real progress components so the tour looks like the app.
- **5d Reminders** — a notification preview at the top carrying real numbers, then five rows
  using `admin.html`'s `.toggle-btn` (On = green border/text). Default on: daily drill,
  streak-at-risk. Default off: leaderboard movement, weekly summary. Also on: your report was
  fixed. A four-way time chooser (6am / 12pm / **7pm** / 9pm) and a note that reminders are
  device-local — no email, no SMS.
- **5e Profile** — 88px avatar square, **initials in gold on `#0a1520` as the default** so a
  profile never looks empty, with a 28px gold camera badge. `Upload` / `Initials` / `Remove`,
  `Square, up to 5 MB`, display name field with `One more change left`, then a note that
  everyone appears on the leaderboard and the online strip — **no opt-out** (product owner's
  call), and `Reminders` / `Log out`.

### 6a–6b — Light mode

> **Where the theme control lives:** the spec's top bar is power / wordmark / trophy
> and never placed one. The app previously had an unspecified 34px floating button
> (under the 44px floor) duplicated across six pages. It is now a single
> **`Appearance` row in the account sheet**, alongside Profile / Saved / Reminders /
> Log out, at full row height with the icon showing the mode you would switch *to*.
> Consequence worth knowing: theme can no longer be changed mid-quiz without
> returning Home.

Home and Quiz in `body.light-mode`. See [Light mode](#light-mode) — there are two traps.

### 7a–7b — Desktop (1120px)

> **Built.** Implementation notes: the three column wrappers are `display:contents`
> below 1120px, so they leave layout entirely and the phone stack is byte-for-byte
> what it was — there is no second render path to drift. The right rail is
> desktop-only rather than appended to the phone stack. The search field is a direct
> child of `#homeBody` so the header grid can place it, and holds its phone position
> (between resume and `Subjects`) with `order` rather than DOM order.
>
> On 7b the rail is a **sibling of `#pageBody`**, because every render replaces that
> element's `innerHTML` wholesale. It shares the sheet's state helpers, and renders
> nothing below 1120px. Two departures from the frame, both deliberate:
>
> - **During an exam the rail shows only Answered/Flagged**, never Correct/Wrong. An
>   always-open map must not leak grading that exam mode withholds until submit.
> - **The map scrolls within a capped height.** The frame shows 30 questions; real
>   modules run to 128 and 200, which would push `To resolve` below the fold.
>
> `Keys 1-4 · Enter` are wired, not decorative. They stand down inside inputs, while
> a sheet is open, and below 1120px.

- **7a Home** — the phone stack becomes `296px / 1fr / 264px`. Width buys context, not bigger
  type: all seven subjects at once in a 2-column grid, standings and saved counts always
  visible, search promoted into the header, avatar in the top right.
- **7b Quiz** — the Jump sheet **disappears**; the question map is permanently open in a
  300px right rail with a `To resolve` list beside it. The figure sits next to the question
  text, then options span the full card in two columns so every edge lines up with the action
  bar. Keyboard hints (`Keys 1-4 to answer · Enter for next`) appear because that is how
  people will answer on a laptop.

## Interactions & behaviour

**Run modes.** One run page serves all three (`?s=&m=&mode=study|exam|drill`):

| Mode | Clock | Feedback | Writes |
| --- | --- | --- | --- |
| study | none | after each answer, full explanation | `markMastered` per correct answer; `recordRunScore` at end |
| exam | one global timer (200 items / 5 h, or a 50-item sim) | only after submit | same, at submit |
| drill | none | after each answer | same, plus SRS state |

Today's quiz pages hard-code a **60-second per-question timer**; in the proposal the timer is
a property of exam mode, not a law.

**Flag and skip** are separate and both appear in the tick strip (gold = flagged,
blue = skipped). Both must be resolvable from the question map before finishing — that is what
the map's two footer buttons are for.

**Question map** is a bottom sheet on phone and a permanent rail on desktop. Same data.

**Daily drill selection** — fixed 20, ordered: overdue → due today → most-missed unmastered →
unseen. Five SRS boxes at 1 / 3 / 7 / 21 / 60 days; correct promotes a box, wrong resets to
box 1 due tomorrow. The streak increments the first time all 20 are answered in a day; extra
practice does not advance the queue (and the UI says so).

**Marquee** (2b subject blurb) — measure on mount and on resize. Only animate when the text
overflows by **more than 24px**; below that fall back to `text-overflow:ellipsis`. The
keyframes hold at rest for the first and last 12% of the cycle so the line is readable at a
glance, and the whole thing is disabled under `prefers-reduced-motion`. A naive
overflow-by-1px marquee scrolls permanently and reads as a rendering bug.

**Countdown** — ticks every second from a configurable exam date (`2027-01-17`).

**Reporting** — reason is single-select and required, comment optional, submission queues in
`localStorage` when offline. Reporters are notified when the admin resolves the item; that
feedback loop is what makes people report a second time.

**Offline** — cache the shell, `subjects.json` and the last 3 opened module files in a service
worker. Search runs over cached files only and says so. Writes queue locally and flush on
reconnect; `assets/module-progress.js` already keeps a warm local cache, so this is mostly a
flush-on-`online` listener.

**States to build that the frames do not show**: empty/first-run (a new account has 0%, no
streak, nothing due, no last activity), failed load, expired session, and a full-screen figure
zoom. These were consciously deferred — ask before inventing them.

## State management

Existing, keep as-is:

- `progress.data[subjectId][moduleId] = { mastered:[qIndex], bestCorrect, bestTotal, attempts }`
  — one Supabase row per user, mirrored to `localStorage` under
  `lea_progress_<subjectId>_<moduleId>_v1`. Plus top-level `total_mastered` / `avg_best_score`
  columns and a `__meta` last-activity marker.
- Unfinished attempts in `lea_quizstate_<subjectId>_<moduleId>_v1` via `assets/quiz-resume.js`
  (`{answeredCount, total, position, payload}`) — extend `payload` with `flagged[]`.
- Theme in `localStorage.leaTheme` via `assets/theme.js`. **Applied to `<html>` from
  `<head>`**, keyed off `data-alt-class` / `data-default-is` on the script tag, because
  `init()` runs far too late to decide the palette — at the end of the body on most
  pages, and on `welcome.html` only after two network round-trips, so light-mode
  readers saw a dark flash on every load. `apply()` mirrors the class onto `<body>`
  as well, and `LEATheme.toggle()` drives it from any control.
- Presence via a Supabase channel; payload currently carries only `username`.

New:

- SRS per question: `{ box, dueAt, misses }`; streak: `{ current, best, lastCompletedDate }`.
- `flagged[]` and `notes{}` per module.
- `reports` table: `question_ref` (subject + module + index), `reason`, `comment`, `user_id`,
  `status` (`open` | `fixed` | `dismissed`), `created_at`.
- `profiles.avatar_url` plus a storage bucket; add `avatar_url` to the presence payload and
  to `get_leaderboard()`.

### ⚠ The migration rule that governs everything

`mastered` is an array of **question indices**. Therefore:

1. **Never change an existing `subjectId` or `moduleId`.** Keep the author-flavoured ones
   (`masangkay-quiz1`, `veron-exam1`, `annie-exam1`, `zhardei-preboard`, …) — they are opaque
   keys, and display names now come from the manifest, so modules can be renamed freely in
   the UI without touching data.
2. **Never reorder or delete a question.** Append only. To retire an item, **hide** it — it
   keeps its slot and stops being served. `admin.html`'s current
   `Delete this question` button silently shifts every later index and corrupts saved mastery;
   replacing it is part of this work.
3. If an id truly must change, ship a one-time remap in `module-progress.js`: union the
   `mastered` arrays, keep the better best score, then drop the old key.

Full detail in `engine-spec.md` §4.

## Design tokens

Taken verbatim from `index.html` `:root` (all learner screens) and `admin.html` (identical
values). **Do not invent colours.**

### Dark (default)
| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#eef1e9` | Body text |
| `--bg-deep` | `#0a1218` | Page ground |
| `--bg-panel` | `#0e1c28` | Cards |
| `--bg-panel-2` / `-deep` | `#0a1520` | Inset panels, inputs, tracks |
| `--gold` | `#e0a83f` | Primary fill, corner marks |
| `--gold-bright` | `#f0c268` | Accent text, hover |
| `--blue` | `#6fa8cf` | — |
| `--blue-bright` | `#8fc4ea` | Secondary accent, ring |
| `--muted` | `#8b98a5` | Secondary text |
| `--good` | `#5fbf82` | Correct, online |
| `--bad` | `#e2604a` | Wrong, destructive |
| `--line` | `rgba(111,168,207,0.20)` | Borders |
| `--grid-line` | `rgba(111,168,207,0.09)` | Graph-paper ground |

Gold fills use **`#1a1206`** for their text on learner screens — hard-coded in
`.source-card`, `.auth-tab.active` and the submit button, and it does **not** vary by theme.
`admin.html`'s `.primary` is the exception: it uses `--bg-deep`.

### Light (`body.light-mode, :root.light-mode`)
`--ink #16202b` · `--bg-deep #d3dee6` · `--bg-panel #ffffff` · `--bg-panel-2 #e9eff4` ·
`--gold #b5791f` · `--gold-bright #7d520c` · `--blue #2f6c95` · `--blue-bright #1b4a6b` ·
`--muted #4f5d6a` · `--good #206b3c` · `--bad #a1372a` ·
`--line rgba(47,108,149,0.28)` · `--grid-line rgba(47,108,149,0.11)`

> **Revised from the original spec.** As first drawn, the ground was `#eef2f3` with white
> cards on top: **1.13:1** panel-against-ground, on an 88% luminance field. In practice
> panels stopped reading as panels and the screen glared — the product owner's words were
> that the text was drowning in it. The ground moved to a blueprint blue-grey and the
> accents darkened to compensate, giving **1.37:1** surface separation at **72%** luminance.
>
> Every colour now clears WCAG AA on both the panel and the ground. `--good` did **not**
> before: at `#2f8a55` it was 4.30:1 on white and 3.81:1 on the ground, i.e. below AA in
> the palette as originally specified.
>
> The selector gained `:root.light-mode` because the theme is now applied to `<html>` from
> `<head>` — see *Theme* below.

#### Light mode
Two traps:

1. **`--gold-bright` inverts.** At `#7d520c` it is *darker* than `--gold` `#b5791f`, so it
   stops being a highlight and becomes the accent **text** colour while `--gold` carries fills.
2. **`--good` and `--bad` are much darker** than their dark-mode twins. Any hard-coded
   `#5fbf82` / `#e2604a` will look wrong in light mode. Use the variables.
   (`assets/quiz-resume.js` was one such offender and has been fixed — it keyed its modal
   off `--paper-card` / `--primary` / `--ink-soft`, three tokens **no page defines**, so it
   always fell through to hardcoded grey-and-orange. It now uses `--bg-panel` / `--gold` /
   `--muted` / `--line`, which every page that loads it does define.)

Cards are white on a blue-grey ground, so they read as cards; the 1px rules and corner
registration marks still carry the structure. Feedback tints drop to 7–12%.

### Typography
| Token | Family | Use |
| --- | --- | --- |
| `--font-display` / `-head` | **Big Shoulders Display** 600/700/800 | All headings, uppercase, `letter-spacing:.01em`, `line-height:1`–`1.1` |
| `--font-body` | **Space Grotesk** 400/500/600/700 | Body, questions, options |
| `--font-mono` | **IBM Plex Mono** 400/500/600 | Labels, meta, numbers; uppercase with `.04`–`.24em` tracking |
| `--font-hand` | **Architects Daughter** | The app's voice: masthead line, streak note, user notes, rival nudge |

Loaded from Google Fonts. Quiz pages additionally load Bebas Neue / Barlow / Space Mono —
the proposal drops those in favour of the four above.

Sizes actually used: display 72 / 64 / 60 / 40 / 38 / 36 / 34 / 30 / 26 / 24 / 22 / 20 / 19 /
18 / 17 / 16 · body 19 / 17 / 16 / 15.5 / 14.5 / 14 / 13.5 / 13 · mono 12.5 / 12 / 11.5 / 11 /
10.5 / 10 / 9.5 / 9 / 8.5.

### Spacing, radius, shadow
- Gaps 2 / 3 / 5 / 6 / 7 / 8 / 9 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 26 / 28px.
  Phone side padding 16px; admin `.wrap` 820px; learner `.wrap` 720px; desktop frames 1120px.
- Radius: **0** on blueprint frames, tick strips, split-flap panels and admin `.q-card`
  interiors; 6 / 8 / 12 / 14px on rounded cards and buttons; 20px on `.status-tag` pills;
  50% on rings and dots. Blueprint objects are square by intent.
- Shadows are rare: sheets use `0 -24px 60px rgba(0,0,0,0.5)`, the notification preview
  `0 12px 30px rgba(0,0,0,0.35)`.
- **Corner registration marks**: a `position:relative` container with two pseudo-elements —
  12–14px squares, `2px solid var(--gold)`, `opacity:.9`, `border-width:2px 0 0 2px` at
  `top:-1px;left:-1px` and `0 2px 2px 0` at `bottom:-1px;right:-1px`.
- **Graph-paper ground**: two `repeating-linear-gradient`s at 0° and 90°, 1px of
  `--grid-line` every 34px, over `--bg-deep`.

### Touch targets
Every interactive element on a phone frame is **≥44px**; quiz options are **≥56px**; primary
actions 52–54px. This was a stated pain point — do not shrink them.

## Assets

- **No images.** The only bitmaps in the product are per-question figures already in the repo
  (`subjects/*/quizzes/img/q*.png`) and the favicons.
- **Icons are inline SVG**, drawn on Lucide geometry at `stroke-width:1.5`,
  `stroke="currentColor"`, 13–19px: power, trophy, sun, bookmark/flag, more (three dots),
  search, grid (question map), arrow-left, arrow-right, flame, check, close, clock, camera,
  eye. Inline, so they cost no request and work offline. **Done** — the emoji
  (`⏻ 🏆 ☀️ 🔖 🔥`) are gone, replaced by `assets/icons.js`. Beyond the
  explicit request, emoji ignore `currentColor` and render differently on every
  platform, so they could never follow `--gold` or the light/dark themes.

## Files in this bundle

| Path | What it is |
| --- | --- |
| `designs/LEA Reviewer - Current UI.dc.html` | The design board — 29 frames. Open in a browser. |
| `designs/support.js` | Runtime for the board only. Not product code. |
| `engine-spec.md` | Target file layout, the `subjects.json` manifest, question schema, run modes, SRS, offline, and the migration rules. **Read §4 before touching data.** |
| `slice-1-remove-sources/index.html` | Working code, ready to replace the repo's root `index.html`. |
| `slice-1-remove-sources/index.original.html` | The file it was patched from, for diffing. |
| `slice-1-remove-sources/README.md` | What that patch changed, what was verified, follow-ups. |
| `source-of-truth/github.md` | Repo association, screen → source-file map, and the admin components used verbatim. |

## Suggested build order

1. Apply `slice-1-remove-sources/` — but first patch `admin.html`, which writes `SOURCES`
   back into `index.html` on save and emits `?source=` links in its generators. Otherwise the
   layer returns.
2. `data/subjects.json` plus extracting the two monolith subjects
   (`subjects/history-of-architecture.html`, 514 KB, and `subjects/building-laws/index.html`,
   93 KB) into module files **with question order preserved**. Every other subject already
   runs on the shared `LEAProgress` engine.
3. `subject.html` from screen 2b, reading the manifest.
4. `run.html` — `study` mode first (today's behaviour plus flag/skip/map), then `exam`,
   then `drill`.
5. Home (2a) with countdown and streak; results (2d).
6. Admin: Reports tab (4b), question form (5a), collapsed module editor (5b).
7. Search, saved, standings, display name, onboarding, reminders, avatars.

Note that `admin.html`'s "Add Module" tab already auto-detects four quiz formats
(`native` / `blueprint` / `practice` / `generic`) and appends a `LEAProgress` adapter. The
one-engine work should absorb that logic rather than duplicate it.
