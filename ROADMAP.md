# Roadmap

## Planned

- **Undo of a delete during a sync.** Undo re-adds the item at the end of its section whenever any sync runs, even when the delete has not reached GitHub yet: two extra commits. Track the actions in flight and discard the delete when it was not sent.
- **Undo restores a whole old state.** Undo after Discard, Remove project or Import brings back actions that a sync committed in the same 5 seconds. Make each undo the inverse action, not a copy of the old doc.
- **Remove a project during a sync.** Its waiting actions still commit, and the sync writes its cache entry back. Check that the project still exists before and after the sync of each repository.
- **Two items with one title.** When a section of the file already has two items with the same title, both rows open and change the first one. Warn, and make the later ones read-only.
- **Lost response after a commit.** When GitHub commits a change but the response is lost, the next sync marks the action stale instead of done. No text is lost.
- **Project rows of Settings.** The rows of the project editor sit flush with the screen edge, while the other groups are inset.

## Deferred
