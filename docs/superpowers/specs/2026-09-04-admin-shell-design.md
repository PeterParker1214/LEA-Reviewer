# Admin shell — design

Task 2 from `HANDOFF.md`. Rebuilds the frame the admin panel's tabs sit in, and
the Deleted tab. Owner's brief for the panel: "more user friendly, organized,
intuitive, no complex wordings, easy to use." It is mostly opened on a phone.

Everything here is in `admin.html`.

## The problem, measured

On a 375px phone the tab strip is **566px wide inside a 343px container** with
`overflow-x: visible`. It does not scroll on its own — it drags the whole page,
which becomes 582px wide. Reports and Deleted Modules sit off the right edge.
The tab carrying incoming work is the one that cannot be reached on the device
the panel is mostly used on.

On a 1440px laptop the panel is a centred 820px column: **310px of unused grid
on each side**, and **156px of vertical chrome** (32px body padding, a 43px
title, an 18px subtitle, a 39px tab strip, plus margins) above the first card.

Separately, `HANDOFF.md` records the Add Module tab as deleted. It is not — the
button is at `admin.html:344` and `renderUploadTab` at `admin.html:2235`. It
still accepts only self-contained HTML quiz files, the format the previous
session converted away from and archived.

## Decisions taken

| Question | Decision |
| --- | --- |
| Add Module tab | Delete it. Rework already accepts `.docx` / `.html` / `.json` and writes the JSON format the site reads. Add Module is the last route that puts the old format back. |
| Phone navigation | Bottom bar, five items, pinned. |
| Laptop navigation | Sidebar, with the page title folded into its top. |
| Scope | Shell plus the Deleted tab. Pages & Quizzes keeps its innards. |
| Question editor | Explicitly **out of scope**, by the owner's request, for its own later task. |

Rejected along the way, with reasons, so they are not revisited:

- **Swipeable tab strip.** Fixes the page overflow but leaves Reports starting
  off-screen and easy to miss.
- **Hamburger drawer.** Two taps instead of one to five sections used daily,
  and the Reports count collapses to a bare dot on the icon — it can say
  something arrived, never what. Right for eight-plus destinations; wrong here.
- **Pills under the title on the laptop.** Keeps both measured problems: the
  620px of unused grid and the four stacked bands above the first card.
- **Splitting `admin.html` into separate files.** Worth doing one day — it is
  3,400 lines — but it would swamp the UI work actually asked for.

## 1. Navigation

### One list, three readers

The five sections are declared once, in order:

```js
const SECTIONS = [
  { id:'subjects', label:'Subjects',   icon:'grid',  render:renderSubjectsTab, once:false },
  { id:'pages',    label:'Questions',  icon:'pencil',render:loadFileTree,      once:true  },
  { id:'rework',   label:'New module', short:'New',
                                       icon:'plus',  render:renderReworkTab,   once:false },
  { id:'deleted',  label:'Deleted',    icon:'undo',  render:scanDeletedModules,once:false },
  { id:'reports',  label:'Reports',    icon:'flag',  render:openReportsTab,    once:false,
                                       badge:openReportCount },
];
```

`once: true` means the render runs on first open only — today's
`if(btn.dataset.tab === 'pages' && fileTree.length === 0)`. `once: false` runs
on every open, which is what the other three do now.

The bottom bar, the sidebar and the section switcher all read from it. Renaming
a section is one edit; so is deleting one. The phone and the laptop cannot
disagree, because there is only one list to disagree with.

`short` is used where the bottom bar's cell is too narrow for `label`.

**`assets/icons.js` has no navigation icons** — it holds only `eye`, `flame`,
`moon`, `power`, `sun` and `trophy`. The five named above have to be added to
it. That is the one file other than `admin.html` this task touches, and adding
to it means bumping the `?v=` query on its script tag.

This replaces the six hard-coded `classList.toggle` lines at `admin.html:751`
with a single `showSection(id)` that hides every section panel and shows one.
The lazy-load rules currently trailing those toggles (`loadFileTree` on first
open of Pages, `renderReworkTab` on every open of Rework, and so on) move onto
the section entries as the `render` field, keeping the same first-open and
every-open behaviour each tab has today.

### The one programmatic jump

`admin.html:2855` switches tabs from code, not from a click:
`document.querySelector('.tab-btn[data-tab="pages"]').click()`. It is how
"open this question" in a report lands you in the editor, and it is followed by
its own `loadFileTree()` guard. Removing `.tab-btn` breaks it silently — the
selector returns `null` and the jump throws.

It becomes `showSection('pages')`. `showSection` must therefore be safe to call
from code as well as from a tap, and must run the section's `render` the same
way either way, or the file tree stops loading on that path.

### Placement

One media query at **720px** decides where the nav sits. Below it, a fixed
bottom bar with an icon and a short label per item; the body gains bottom
padding equal to the bar's height so the last card is never covered. At or
above it, a sidebar to the left of the content, with the `ADMIN` title and
`LEA Reviewer` subtitle inside its top; those are removed from the document
flow above the content, which is what recovers the 156px.

The sidebar is `position: sticky` so the nav stays put on the long tabs
(Questions and Reports scroll furthest).

### The Reports count

A red count on the Reports item, visible from every other section.

Reports are currently fetched only when the Reports tab is opened
(`openReportsTab` → `loadReports`, `admin.html:679`). For the badge the count
has to exist at startup, so `loadReports()` is called once during boot after
`loadSubjects()`. The number shown is the count of distinct question refs
needing a look — the same number the Reports tab's own heading already prints,
so the two can never disagree. Zero renders no badge at all, not a "0".

If that startup fetch fails, the badge is simply absent; a failed count must
never block the panel from loading.

## 2. Names

| Was | Becomes | Why |
| --- | --- | --- |
| Subjects | Subjects | unchanged |
| Pages & Quizzes | **Questions** | it is where a question gets fixed, which is what you go there to do |
| Add Module | *(deleted)* | accepted only the old file format |
| Rework Module | **New module** | with Add Module gone, this is how a module gets made |
| Deleted Modules | **Deleted** | shorter; fits the bar |
| Reports | Reports | unchanged, now carries the count |

A wording pass over the headings and helper text inside the shell follows the
same rule the Reports and Rework tabs already set: say what the button does to
the site, not what it does to the repository.

## 3. Cards and buttons

The panel currently has three card idioms: the generic `.card`, the report
cards (`.rep-*`), and the rework cards (`.rw-*`). The Subjects tab was just
rebuilt onto the `.rep-*` shape.

Rather than invent a fourth, the shared shape the rebuilt tabs already use — a
bordered, rounded panel with a tappable head and a body that unfolds — is
lifted into one set of base rules that `.rep-*`, `.rw-*` and the new `.subj-*`
all build on. `.rep-*` and `.rw-*` keep their names, so the two tabs rebuilt
last session are not disturbed.

Buttons get one size floor for touch: no tap target under 32px high on a phone.

## 4. The Deleted tab

Today each archived module is one `.unlisted-row`: the archive's file path as
the headline, then a title box, a subject dropdown, a number box, an empty
"New module id" box and a Publish button, all on one wrapping flex line.

It already does more than it looks — the old title is recovered from the
archive commit message, and picking a subject prefills a free module number.

Rebuilt as one card per archived module, in the shell's shared card shape:

- **Headline** — the module's own recovered title.
- **Under it** — what it was and when: "Was module 2 of Building Laws · removed
  12 Dec · 150 questions".
- **Put it back** — primary. Restores it to the subject it came from, under the
  number that is free now.
- **Preview** — the existing peek, renamed.
- **Change where…** — a disclosure holding the subject dropdown and the number,
  for the case where it should not go back where it came from.

The file path moves out of the headline; it stays available inside the
disclosure, because it is the only unambiguous identifier when two archived
copies share a title.

**The "New module id" box is removed**, and the id is derived from the chosen
subject and number as `<subject-id>-<no>` rather than typed. This is the one
behaviour change in this task beyond navigation.

An earlier draft of this spec claimed ids are already `<subject-id>-<no>`
"throughout the manifest". **That is wrong, and the correction matters.** Of the
76 modules in `data/subjects.json`, 27 match that shape. The rest are either
free slugs carried over from the old hand-built pages (`prehistoric`, `ecbr`,
`grb`) or zero-padded (`architectural-design-05`). There is no single
convention, and this task does not impose one on modules that already exist.

The derivation is a reasonable default for a *newly restored* module — it is
the shape the most modules use, and it is predictable — but it is not a
description of what is there. Two consequences follow, and both are handled:

- The collision check compares ids with any zero-padding normalised away, so
  restoring at number `05` is correctly refused when `architectural-design-05`
  already holds that slot. An exact string compare would have missed it.
- A restore into a free slot mints `<sid>-5` where its siblings may read
  `<sid>-05`. That is cosmetic — ids are never shown to readers, only used as
  manifest keys — and it is not worth renaming existing modules to tidy, since
  their ids are part of the key that saved progress hangs on.

If the derived id collides with a module already in that subject, the restore
stops and says so, naming the module in the way — it does not silently pick
another number.

## What is not touched

- Every save path. Nothing about how files reach the site changes.
- `saveSubjects`, the manifest read-once/write-once rule, and the stale-read
  guard.
- The Subjects, Reports and Rework tabs' interiors.
- The question editor inside Questions — the frame around it only.
- Module numbers, module ids and question order. `mastered[]`, `flagged[]`,
  `notes{}` and `reports.question_ref` are keyed by `subject/module/index`.

## Testing

The jsdom harness written for the Subjects tab is reused: build the DOM, run
both inline script blocks with `vm.runInContext` against
`dom.getInternalVMContext()`, stub the globals. Splitting the file into script
blocks must be done on whole lines — block 1 contains template literals holding
the literal text `<script>`.

What gets asserted:

1. Every section in `SECTIONS` is reachable, and `showSection` leaves exactly
   one section panel visible.
2. The bottom bar and the sidebar render the same five ids in the same order —
   the property that makes "one list" worth having.
3. Each section's lazy-load rule fires when it did before: Pages loads the file
   tree on first open only, Rework and Deleted re-render on every open.
4. The Reports badge shows the same number as the Reports tab's own heading,
   renders nothing at zero, and a failed startup fetch leaves the panel usable.
5. Restoring an archived module derives the id as `<subject-id>-<no>`, and a
   collision refuses the restore rather than renumbering.
6. `manifestToJson(subjects)` is unchanged by navigating between every section.

Layout is checked in the browser at 375px and 1440px: no horizontal overflow at
either, the last card not covered by the bottom bar, and the sidebar present
only above 720px.

The three existing suites (`manifest-guard`, `sw-routing`, `module-order`) must
still pass.

## Notes for whoever picks this up

- `admin.html` is not in `sw.js`'s precache list, so shell changes here need no
  `VERSION` bump. Confirm that is still true before assuming it.
- The Add Module deletion removes `renderUploadTab`, its tab button, its
  `#tab-upload` div, its `tabUploadEl` reference and the drop-zone handlers it
  owns. **`assets/image-intake.js` stays** — it is used by `renderQuestionsList`
  (`admin.html:1783`) for pasting pictures into a question, not by Add Module.
- `renderUploadTab` also owns the only "+ New subject…" flow outside the
  Subjects tab. Subjects already has "+ Add subject", so nothing is lost, but
  check for other callers before deleting.
