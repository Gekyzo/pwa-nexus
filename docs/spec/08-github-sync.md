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
