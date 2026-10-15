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
- **ROAD-6** `editItem(md, ref, { title, body })` rewrites the lines of that item only.
  `moveItem(md, ref, toPath)` is a delete plus an add at the end of the target section.
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

## Screen
