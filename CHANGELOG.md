# Changelog

User-visible changes, newest first.

## Unreleased

- A new install lists five projects: Shifts and Nexus join Shopping, Wardrobe and Financial
  calculator.

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
