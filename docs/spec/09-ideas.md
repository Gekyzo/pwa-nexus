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
