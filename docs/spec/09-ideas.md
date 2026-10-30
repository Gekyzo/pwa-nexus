# Ideas

The ideas of new apps that have no repository yet, kept in one `IDEAS.md`.

## Model

`src/ideas.js` holds the idea operations. Its functions are pure: no DOM, no network.

- **IDEA-1** The ideas live in `IDEAS.md` (`IDEAS_PATH`) of `Gekyzo/pwa-nexus` (`IDEAS_REPO`).
  The app has one ideas file; Settings does not change it.
- **IDEA-2** `IDEAS.md` has the shape of a `ROADMAP.md`, and `src/roadmap.js` reads it (ROAD-1 …
  ROAD-11). An idea is an H2 section; its title is the name of the idea. Its parts are the H3
  sections under it. A new idea gets `### Features`, `### Specs` and `### Notes` (`PARTS`), in that
  order and in English whatever the language of the screen. An entry is an item of a part, with the
  rules of ROAD-7. An H3 part written by hand takes entries like the three of `PARTS`.
- **IDEA-3** `cleanName(name)` trims the name and makes each run of spaces one space. It is
  required (`error.nameRequired`), at most 80 characters (`error.nameTooLong`), and has no `/`
  (`error.nameSlash`), because a `/` would break the path of a part (ROAD-2).
- **IDEA-4** `addIdea(md, name)` puts the idea, with its three empty parts, at the end of the file,
  one blank line after the last text; an empty file gets `# Ideas` first. `renameIdea(md, name,
  to)` rewrites the H2 line only. `deleteIdea(md, name)` removes the H2 and each line up to the next
  H1 or H2, and leaves no double blank line. `restoreIdea(md, name, lines)` puts the lines of an
  idea back at the end of the file, as `addIdea` does. `ideaText(md, name)` gives the lines of an
  idea, with no blank line at their end. Two ideas with one name, in any case, are
  `error.ideaTaken`; a rename to the same name changes nothing, and a rename that changes only the
  case is allowed. A name that the file does not have is `error.ideaMissing`. The functions keep
  the line ending and the final newline of the file.
- **IDEA-5** `ideasOf(md)` lists the ideas in file order, each with its parts, its `total` and the
  item counts of the three parts of `PARTS` (`counts`); the entries of a part written by hand are
  not in `counts`. An H3 before the first H2 is no part of an idea and stays in the file. A later
  H2 with the name of an earlier one, in any case, is `duplicate`: an action reaches only the
  first one.
- **IDEA-6** A test proves that `tests/fixtures/ideas/IDEAS.md` comes back byte for byte after an
  `addIdea` and the `deleteIdea` of the same idea, and after a `renameIdea` to the same name.

## Actions

- **IDEA-7** A `renameIdea` or a `deleteIdea` carries the lines of the idea as the phone saw them
  (`base`, from `ideaText`). If the idea on GitHub has other lines, the action is stale
  (`error.itemChanged`), as SYNC-6 says, so text written elsewhere is never lost.

## Screen

- **IDEA-8** Ideas is the second section (NAV-1), and the module `ideas` turns it off (MOD-1). It
  lists the ideas of `ideasOf` in file order, as rows with the name and a count line: the counts of
  the parts of `PARTS` that have entries, joined with ` · ` (`ideas.features`, `ideas.specs`,
  `ideas.notes`), or `ideas.nameOnly`. A `duplicate` idea shows `ideas.duplicate` and does not
  open. With `IDEAS.md` read and no idea, the list says `ideas.empty`, with the button
  `ideas.new`. The actions of `IDEAS.md` that are stale or no longer apply show above the list as
  the banners of UI-5.
- **IDEA-9** **+** in Ideas, and `ideas.new`, open the name sheet (SHEET-1): its head, one field
  (`ideas.name`, at most 80 characters) with the keyboard on it, and **Save**. Save checks the name
  (IDEA-3, IDEA-4) against the ideas on the screen, queues an `addIdea` and starts a sync. The text
  on the screen is the cached `IDEAS.md` with the waiting actions on top (SYNC-2); with no
  `IDEAS.md` read on this device, it starts empty, and the list says `ideas.notLoaded` above the
  ideas that wait. So an idea is caught offline before the first sync; a name that GitHub has
  already makes the `addIdea` stale (SYNC-6). With no token, **+** and `ideas.new` are off (TOK-3).
- **IDEA-10** A sync does `IDEAS.md` after the projects (SYNC-8), as one more step of its bar
  (SYNC-9), with `create` (SYNC-3), also while the module `ideas` is off. A missing `IDEAS.md`
  with no action is cached as `missing` and is no error.
