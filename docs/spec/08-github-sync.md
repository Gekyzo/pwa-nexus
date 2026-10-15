# GitHub sync

How the app reads each `ROADMAP.md` from GitHub and commits the actions of the user back.

## Client

- **GH-1** `createClient({ token, fetch })` of `src/github.js`. `fetch` is injected, so the tests
  need no network.
- **GH-2** `getFile(repo, 'ROADMAP.md')` calls `GET /repos/{repo}/contents/ROADMAP.md` past the
  HTTP cache and returns `{ text, sha }`. The base64 decode is UTF-8 safe (accents, emoji), and
  ignores the line breaks of the content.
- **GH-3** `putFile(repo, path, { text, sha, message })` calls `PUT` on the same URL and returns
  the new `sha`.
- **GH-4** The errors are a `GitHubError` with a type: `auth` (401, or 403 with requests left),
  `notFound` (404), `conflict` (409, or 422 for a stale sha), `rateLimit` (403 with
  `x-ratelimit-remaining: 0`), and `network` (fetch throws, any other status, or a body that is
  not JSON).
- **GH-5** The token goes only to `https://api.github.com`, in the `Authorization` header. The
  client sends no other header that identifies the user.

## Queue and sync

- **SYNC-1** Every action is first an entry of the queue, `{ id, repo, op, args, createdAt }`, in
  the doc. `op` is `add`, `edit`, `move` or `delete`. An entry that a sync could not apply has
  `stale: true`.
- **SYNC-2** The screen shows the cached text of a repository with its queued actions applied on
  top, in their order. An action shows at once, online or offline.
- **SYNC-3** `syncRepo` of `src/queue.js` gets the file, then for each queued action in order:
  it applies the action, puts the file with the last sha, and the action leaves the queue. One
  action is one commit. An action that changes no byte leaves the queue with no commit.
- **SYNC-4** The commit messages are `Add roadmap item: <title>`, `Edit roadmap item: <title>`,
  `Move roadmap item to <path>: <title>` and `Delete roadmap item: <title>`. An edit or a move
  names the title before the action.
- **SYNC-5** On a `conflict`, the sync gets the file again and retries that action once. A
  second conflict stops the sync of that repository and keeps the action.
- **SYNC-6** An action whose item or section no longer exists on GitHub is marked stale. It stays
  in the queue until the user discards it, and the sync goes on with the next action. A sync
  never drops an action silently, and never sends a stale one again.
