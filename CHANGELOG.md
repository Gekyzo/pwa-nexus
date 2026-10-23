# Changelog

User-visible changes, newest first.

## Unreleased

No change.

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
