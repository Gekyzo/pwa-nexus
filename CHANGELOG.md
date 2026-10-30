# Changelog

Technical changes, newest first. What a user sees of a version goes to `release-notes/`, in each language of the app.

## Unreleased

- The Ideas section (IDEA-1 … IDEA-10): `IDEAS.md` of `Gekyzo/pwa-nexus` in the shape of a ROADMAP.md, an idea an H2 with the parts `Features`, `Specs` and `Notes`. `src/ideas.js` adds, renames, deletes and restores an idea; `src/ui/ideas.js` lists the ideas and catches a new one by its name. A queue entry names its `file` when it is not ROADMAP.md (SYNC-1), the cache key of a second file is `<repo>:<file>` (CACHE-1), and the first action of a missing file creates it (`putFile` with no sha, `syncRepo` with `create`, GH-3, SYNC-3). The sync does IDEAS.md after the projects, as one more step (SYNC-9). Keys `nav.ideas`, `ideas.*`, `error.name*`, `error.idea*`; icon `bulb`.
- An idea opens in the pane (IDEA-11 … IDEA-14): its parts as the sections of the roadmap, Rename, and Delete with Undo, which queues a `restoreIdea` marked `sent` when the delete may have reached GitHub. The item sheet works on a target file (`ui.sheetTarget`, UI-3), so the entries of an idea use the same add, edit, move and delete; its picker lists only the parts of the idea. `sectionNodes` and `staleBanner` of `src/ui/projects.js` are shared.

## 0.1.20 - 2026-10-30

- Bodega is `Gekyzo/pwa-shopping-list`, the name that GitHub gives the repository now (PROJ-6). The API followed the old name, but GitHub Pages does not, so the icon and the link of the app gave 404. `normalizeDoc` renames the old name in the projects, the queue and `defaults` of a stored or imported doc; the cache entry moves too (`renameEntries`).
- **Delete all data** in Settings › Backup, as in pwa-shopping-list (SET-2): `resetAll` in `src/storage.js` removes each `localStorage` key of the app, `<slug>.*`, the token included, and no key of another app of the origin; the page loads again as a new install. Keys `settings.reset`, `reset.confirm`, `error.resetFailed`.
- `Gekyzo/pwa-fittings` leaves the default projects (PROJ-1): a new install has ten. A stored doc keeps its list, so a device that has Fittings keeps it until the user removes it in Settings (PROJ-2).
- Design system 0.8.1 (`npm run ds`): the shared wide layout (LAY-1 to LAY-5, DSV-5). From 600px the rail stands at the start with either hand, and the `body` rule pads `--rail-width` at the start and `--frame-side` at the end; from 1024px the app stands in a centred frame with a sidebar; from 840px the roadmap is a card beside the list and a sheet with a head is a card below the header (`--header-height` from a `ResizeObserver` in `src/app.js`). The Sync button and the project cards drop their own side padding from 600px, so they line up with the title. `.version-status` is relative, so Settings no longer scrolls the page as well.
- The home of Projects is a grid of cards with the icon of each app (UI-1). The project screen starts with a head: the icon, the repository and a link to the app at its GitHub Pages site (UI-12). `appUrl` and `iconUrl` in `src/projects.js` derive both from the repository (PROJ-5).
- `Gekyzo/pwa-learning-swe` and `Gekyzo/pwa-training-routines` join the default projects as LearnSWE and Routines (PROJ-1). A stored list gets them once at the next start (PROJ-4).

## 0.1.19 - 2026-10-28

- New art in `icons/source.png`, a molecule of four coloured spheres; `npm run icons` wrote the PNG icons and the logo again (VER-15).

## 0.1.18 - 2026-10-24

- `Gekyzo/pwa-landlord` and `Gekyzo/pwa-tenant` join the default projects as Landlord and Tenant (PROJ-1). A stored list gets them once at the next start (PROJ-4).
- `Gekyzo/pwa-fittings` joins the default projects as Fittings (PROJ-1). A stored list gets it once at the next start (PROJ-4).

## 0.1.17 - 2026-10-24

- `app.title` is a translated descriptor, then the brand (`<descriptor> - <short_name>`), so the title follows the language; the static `<title>` and the manifest `name` and `description` hold the fallback text of their `lang`. A test in `tests/i18n.test.js` keeps them in step.

## 0.1.16 - 2026-10-24

- Review fixes: `normalizeDoc` keeps `sent`, so it outlives a restart; Undo of a delete that may have reached GitHub queues an `add` marked `sent` (`undoDeleteOf`) instead of waiting for the answer; a `sent` delete is done only when no item keeps its title or body; `viewOf` shows a `sent` action that the text has as applied; `editItem` lets the first of two items with one title change when its title stays; Undo of Discard leaves out committed actions.
- A sync reads the queue and the projects at each step (SYNC-10): `syncRepo` takes `keep`, checked just before each commit, and `onSend`, which names the entry on its way. Undo of a delete waits for that answer only for the entry in flight (UI-4). A project removed during the sync is skipped and keeps no cache entry.
- A commit with no answer marks its entry `sent` (`settleQueue` takes `sent`, `isEntry` accepts it). At the next sync a `sent` entry that no longer applies is done when the file already shows its result (`isApplied`), not stale (SYNC-11).
- Undo is the inverse of its action (UI-10): `showToast` and `apply` take `undo` as a function of the doc; `restoreEntry`, `restoreProject` and `withoutEntries` leave out what `committed` (the ids that the syncs of this start committed) holds.
- `sectionsOf` marks a later item with the title of an earlier one in its section as `duplicate`; its row is disabled with `item.duplicate` (UI-11).

## 0.1.15 - 2026-10-24

- Release notes: `release-notes/<lang>.md`, one file per catalog, released with the version by `npm run release`, which stops when the languages disagree. The app shows the unseen versions in a What's new sheet after an update (`nextSeen`, seen version in storage) and every version from Settings › Help. This file is now the technical record.

## 0.1.14 - 2026-10-24

- The message that shows after an action, with its undo, is a raised card in the colours of the screen. It is no longer a black box in light and a white box in dark.

## 0.1.13 - 2026-10-24

- Settings groups its rows as in the other apps: each preference shows its value, Export and Import are rows.

## 0.1.12 - 2026-10-24

- The bottom bar shows the name of each section under its icon again.

## 0.1.11 - 2026-10-24

- The icon of Settings is a gear, as in the other apps of the family.

## 0.1.10 - 2026-10-24

- The look of design system 0.7.1: the Geist font, the stone ground, smaller corners and heads in the colour of the text.

## 0.1.9 - 2026-10-20

- The Sync button of Projects keeps off the screen edge, in line with the header title.
- A press of Projects in the bottom bar, with a roadmap open, goes back to the project list.
- A bar on the bottom edge of the header shows the progress of a sync: it fills one step for each
  project.
- The bottom bar shows only the icon of each section, with no name.
- In Settings, the token field, its help and the project rows keep off the edges: no text
  touches the border of its group or the screen.
- The design system gives an input on the page the surface colour: in Settings the project names and
  the repository field stand out from the page.

## 0.1.8 - 2026-10-20

- The design system 0.5.0. The item sheet has a head with its title and a close button, and a
  foot with Delete and Save. A drag down from the head closes it, and on a wide screen it opens
  at the side.
- With no project, the list offers Add a project: it opens Settings at the repository field.
- From 600px the rail stands at the side of the hand.
- The default project `Gekyzo/pwa-lists` is labelled Stash, its new app name.

## 0.1.7 - 2026-10-17

- The default projects carry the new app names: Bodega, Attire, Compound and Rota.
- A new item can go to other projects too: pick them below the description. Only the
  projects with the same section can be picked.
- Lists (`Gekyzo/pwa-lists`) is a new default project. It joins the end of the list once, also on a phone that has a stored list.

## 0.1.6 - 2026-10-16

- A new app icon, drawn in the style that the family of apps shares.

## 0.1.5 - 2026-10-16

- The section picker marks each H3 section with `└` instead of an indent, so the closed field
  still shows that the section is inside another one.
- The description field of the item sheet grows with its text, and its label no longer covers
  the first line.
- A row of the roadmap keeps a margin above and below its text, so a long description no
  longer touches the lines between the rows.
- A search field above the roadmap shows only the items whose title or description holds each
  word you type, in any case and with or without accents.
- A commit of the app ends its subject with `[pwa-nexus]` and carries the trailer
  `Via: pwa-nexus <version>`, so the history of a repository shows which changes came from it.

## 0.1.4 - 2026-10-15

- A roadmap shows each H3 section inside its H2 section, one level in, as a folder. The H2
  count includes the items of its H3 sections, and folding an H2 also hides them.
- The section picker of the item sheet shows the same tree: each H3 section by its title,
  indented below its H2 section.

## 0.1.3 - 2026-10-15

- A new install lists five projects: Shifts and Nexus join Shopping, Wardrobe and Financial
  calculator. An installed app gets Shifts and Nexus once, at its next start; a project that you
  removed is not added back.

## 0.1.2 - 2026-10-15

- A project that the token cannot reach no longer stops the sync of the others.
- Editing an item's title keeps its sub-bullets and its text as written; moving an item keeps them too.
- An edit or a delete made on the phone no longer overwrites an item changed on the computer: it
  shows as **Could not apply**, with **Discard**.
- A broken backup can no longer stop the app from opening.

## 0.1.1 - 2026-10-15

- The Projects list, with the item count, the waiting changes and the last sync of each project.
- The roadmap of a project: its sections, which fold, and their items.
- Add, edit, move and delete an item. Each change is one commit on GitHub.
- Changes made offline wait in a queue and commit on the next sync. A change that no longer
  applies shows with **Discard**.
- Settings: the GitHub token with a test, and the list of projects.
