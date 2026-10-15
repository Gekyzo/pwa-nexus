import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubError, createClient, encodeBase64, decodeBase64 } from '#github';

const reply = (status, body = {}, headers = {}) => new Response(JSON.stringify(body), { status, headers });

// A fetch that answers with `responses` in order and records each call.
const fakeFetch = (...responses) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
};

test('base64 round-trips UTF-8 text (GH-2)', () => {
  for (const text of ['', 'abc', 'Café ñ 🍰', 'x'.repeat(100000)]) assert.equal(decodeBase64(encodeBase64(text)), text);
});

test('decodeBase64 ignores the line breaks that GitHub puts in content', () => {
  const encoded = encodeBase64('hello world, a long line');
  assert.equal(decodeBase64(`${encoded.slice(0, 8)}\n${encoded.slice(8)}\n`), 'hello world, a long line');
});

test('getFile reads the contents API of api.github.com with the token, past the cache (GH-2, GH-5)', async () => {
  const { fetch, calls } = fakeFetch(reply(200, { content: encodeBase64('# Roadmap\n'), sha: 'abc' }));
  const file = await createClient({ token: 't0k', fetch }).getFile('Gekyzo/pwa-x', 'ROADMAP.md');
  assert.deepEqual(file, { text: '# Roadmap\n', sha: 'abc' });
  assert.equal(calls[0].url, 'https://api.github.com/repos/Gekyzo/pwa-x/contents/ROADMAP.md');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.Authorization, 'Bearer t0k');
  assert.equal(calls[0].cache, 'no-store');
});

test('putFile sends the message, the base64 text and the sha, and returns the new sha (GH-3)', async () => {
  const { fetch, calls } = fakeFetch(reply(200, { content: { sha: 'new' } }));
  const sha = await createClient({ token: 't', fetch }).putFile('o/r', 'ROADMAP.md', { text: 'Té', sha: 'old', message: 'Add roadmap item: X' });
  assert.equal(sha, 'new');
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].body, { message: 'Add roadmap item: X', content: encodeBase64('Té'), sha: 'old' });
});

test('the errors of GitHub are typed (GH-4)', async () => {
  const cases = [
    [reply(401), 'auth'],
    [reply(403, {}, { 'x-ratelimit-remaining': '10' }), 'forbidden'],
    [reply(403, {}, { 'x-ratelimit-remaining': '0' }), 'rateLimit'],
    [reply(403, {}, { 'x-ratelimit-remaining': '10', 'retry-after': '60' }), 'rateLimit'],
    [reply(404), 'notFound'],
    [reply(409), 'conflict'],
    [reply(422), 'conflict'],
    [reply(502), 'network'],
    [new TypeError('Failed to fetch'), 'network'],
  ];
  for (const [response, type] of cases) {
    const { fetch } = fakeFetch(response);
    await assert.rejects(
      createClient({ token: 't', fetch }).getFile('o/r', 'ROADMAP.md'),
      (error) => error instanceof GitHubError && error.type === type,
      type,
    );
  }
});
