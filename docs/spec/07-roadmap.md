# Roadmap

The model of a project's `ROADMAP.md` and the screen that shows it.

## Model

`src/roadmap.js` is a lossless, line-based model. Its functions are pure: no DOM, no network.

- **ROAD-1** `parse(md)` returns the sections. A section is an H2 or H3 heading with its lines,
  up to the next H1, H2 or H3. The H1 and the lines before the first section are the preamble.
  They are not a section and the app never changes them.
- **ROAD-2** A section has `{ path, title, level, items }`. `path` is the title, prefixed by the
  parent H2 title for an H3: `Pro / Cloud storage`. A path identifies a section.
- **ROAD-3** An item is a line that starts with `- ` or `* `, plus the indented lines that follow
  it. `- **Title.** body` gives `{ title: 'Title', body: 'body' }`. A bullet with no bold title
  gives `{ title: <its text>, body: '' }`. Intro prose of a section is not an item, and an H4 is
  not a section.
- **ROAD-4** An item is addressed by `{ path, title }`, never by line number. A queued action
  then still applies after the file changes on GitHub.
- **ROAD-5** `addItem(md, path, { title, body })` puts `- **Title.** body` after the last item of
  the section. A section with no item gets it after its intro lines, after one blank line.
- **ROAD-6** `editItem(md, ref, { title, body })` rewrites the lines of that item only. An edit
  that keeps the body changes only the bold title of the first line: sub-bullets, continuation
  lines and a body of any length stay as they are. `moveItem(md, ref, toPath)` deletes the lines
  of the item and puts them, unchanged, at the end of the target section.
  `deleteItem(md, ref)` removes the lines of that item only, and leaves no double blank line.
- **ROAD-7** The title is trimmed and required (`error.titleRequired`), at most 80 characters
  (`error.titleTooLong`). Asterisks and trailing periods are dropped: the format adds the period.
  The body is one line of at most 500 characters (`error.bodyTooLong`): line breaks become
  spaces. Two items of one section with one title, in any case, are `error.titleTaken`. A move
  to the section the item is in changes nothing.
- **ROAD-8** A `ref` or `path` that does not exist is `error.itemMissing` or
  `error.sectionMissing`, and the text does not change.
- **ROAD-9** The functions keep the line ending and the final newline of the file. A test proves
  that each real `ROADMAP.md` of the default projects (`tests/fixtures/roadmaps/`) comes back byte
  for byte after an add and a delete in each section, and after an edit with the same values.
- **ROAD-10** `treeOf(sections)` nests each H3 section under the H2 before it, as `children`.
  `total` is the item count of a section plus that of its children. An H3 before the first H2
  stays at the top level. `outlineOf(sections)` lists the tree flat, in its order, as
  `{ path, title, depth }`: depth 0 with the path, depth 1 for a nested H3 with its title.
- **ROAD-11** `filterTree(tree, query)` keeps the items whose title or body holds each word of
  the query, in any case and with no accents (`menu` finds `Menú`), and the sections that keep an
  item or a child. `total` counts the matches. A blank query gives the tree as it is.

## Screen

- **UI-1** Projects is the first section. It lists one row for each project, with its label and
  one line: its item count, its waiting actions (`projects.pending`) and the time of its last
  sync, or `projects.notLoaded` / `projects.noRoadmap`. A tap opens its roadmap in the pane
  (LAY-3), and the header shows the label of the project. With no project, the list shows
  `projects.empty` and the button `projects.add`, which opens Settings with the focus in the
  repository field.
- **UI-2** The roadmap shows the sections as a tree in file order (ROAD-10): an H2 head with its
  path and its `total`, its items, then each H3 head, one level in, with its title and its item
  count. A tap on a head folds the section; a folded H2 also hides its H3 sections. The items are rows with their title and body.
  With no cache the detail says `roadmap.notLoaded`; with no `ROADMAP.md`, `roadmap.missing`.
  A tap on an item row opens the item sheet with its section, title and body, and **Delete**.
- **UI-5** An action that the sync marked stale, or that no longer applies to the cached text,
  shows above the roadmap as a banner (`sync.staleTitle`) with its commit message and
  **Discard**. Discard removes it from the queue; the toast `toast.discarded` offers **Undo**.
- **UI-10** An **Undo** is the inverse of its action on the doc as it is when Undo is pressed,
  never a copy of the doc from before: what a sync settled meanwhile stays settled. Undo of
  **Discard** puts the action back at its place in the queue. Undo of **Remove** puts the project
  back at its place, with its actions after the queue. Undo of **Import** goes back to the doc
  before the import. An action that a sync of this start committed is never put back.
- **UI-11** An action finds an item by its section and its title, so it reaches only the first
  item of a title in a section. A later item with the same title is `duplicate` (`sectionsOf`):
  its row shows the warning `item.duplicate` and does not open. The first one opens, and an edit
  that keeps its title applies: the clash was in the file already.
- **UI-3** With a roadmap open, **+** opens the sheet of a new item: a section picker with no
  default (`item.pickSection`), a title and a body. The body field starts three lines high and
  grows with its text up to 40% of the screen, then scrolls. The picker lists the sections as the tree of
  `outlineOf` (ROAD-10): a nested H3 by its title after the mark `└`; its value is the path. Save queues an `add` action and starts a sync.
  An action that fails its check against the roadmap on the screen (ROAD-7, ROAD-8) shows its
  message, and nothing is queued. Below the body, `item.alsoTo` lists the other projects as
  chips, none pressed; it is hidden when editing and when there is no other project. A chip is
  enabled only if the roadmap on the screen of its repository has a section with the exact path
  picked (`hasSection`); otherwise it shows `item.noSection`, and a change of section rebuilds
  the chips. Save queues the same `add` in the open repository and in each pressed one, one
  commit each. `checkEach` checks them all first: if one fails, `item.failedIn` names its project
  and the reason, and nothing is queued in any.
- **UI-4** **Delete** queues a `delete` action; the toast `toast.itemDeleted` offers **Undo** for 5
  seconds. While the action waits and surely was not sent, also during a sync, Undo removes it
  from the queue, and the sync does not send it (SYNC-10). When it may have reached GitHub (its
  commit is on its way, or it is marked `sent`), Undo removes it and queues an `add` of the item
  marked `sent`: the sync adds the item at the end of its section, or finds it there (SYNC-11).
  Once GitHub has the delete, Undo queues that `add`.
- **UI-7** The item sheet edits title, body and section together. Save with a changed title or
  body queues an `edit`; a changed section queues a `move` after it: two actions, two commits.
  A save that changes nothing queues nothing.
- **UI-9** The item sheet has a head with its title and a close button (`item.close`), a body
  with the fields, and a foot with **Delete** and **Save** (SHEET-1). The close button, a tap on
  the veil, Escape and a drag down from the grab or the head close it and save nothing. From
  840px it is a side sheet.
- **UI-8** With a roadmap that has sections, a search field (`roadmap.search`) shows above it. Each
  key filters the roadmap with ROAD-11. While the search has text, each section is open and a tap
  on a head does nothing; the folds come back when the field is empty. No match shows
  `roadmap.noMatch`. The text is not saved, and opening a project empties it.
- **UI-6** Settings starts with the GitHub group: the token field, **Test the token** and the
  help text of TOK-1. The Projects group lists each project as a field with its label, its
  repository below it and **Remove** (PROJ-2); a changed field renames the project. The field
  below the list adds a project and starts a sync. The template's settings follow.
