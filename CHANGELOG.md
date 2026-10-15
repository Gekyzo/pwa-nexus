# Changelog

User-visible changes, newest first.

## Unreleased

No change.

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
