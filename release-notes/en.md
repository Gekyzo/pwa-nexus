# Release notes

What changes for you in each version of the app. The newest version is first.

## Unreleased

No change.

## 0.1.17 - 2026-10-24

- The title of the app is in the language of the app, for example in the window and the list of open apps.

## 0.1.16 - 2026-10-24

- Undo of a delete during a sync no longer adds the item back at the end of its section with two extra commits.
- A project removed during a sync no longer commits its waiting actions or comes back in the cache.
- A change that reached GitHub while the connection dropped is no longer shown as a failed change at the next sync.
- Undo after Discard, Remove or Import no longer brings back changes that a sync sent to GitHub in the meantime.
- When a section has two items with the same title, the later one is read-only and says to edit it on GitHub, instead of opening and changing the first one.

## 0.1.15 - 2026-10-24

- `Settings` › `Help` › `What's new` lists what changes in each version. After an update, it opens by itself once.
