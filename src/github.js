// The Contents API of GitHub, the only network API of the app (GH-5). `fetch` is injected, so a
// test runs with no network.
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(type, status = 0) {
    super(`GitHub ${type} (${status})`);
    this.type = type;
    this.status = status;
  }
}

// btoa and atob work on bytes as Latin-1 text: go through UTF-8 bytes for accents and emoji.
export const encodeBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

export const decodeBase64 = (base64) => {
  const binary = atob(base64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

const typeOf = (response) => {
  if (response.status === 401) return 'auth';
  if (response.status === 403) return response.headers.get('x-ratelimit-remaining') === '0' ? 'rateLimit' : 'auth';
  if (response.status === 404) return 'notFound';
  if (response.status === 409 || response.status === 422) return 'conflict';
  return 'network';
};

const urlOf = (repo, path) => `${API}/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

export const createClient = ({ token, fetch }) => {
  const call = async (method, url, body) => {
    let response;
    try {
      response = await fetch(url, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError('network');
    }
    if (!response.ok) throw new GitHubError(typeOf(response), response.status);
    try {
      return await response.json();
    } catch {
      throw new GitHubError('network', response.status);
    }
  };
  return {
    getFile: async (repo, path) => {
      const data = await call('GET', urlOf(repo, path));
      return { text: decodeBase64(data.content), sha: data.sha };
    },
    putFile: async (repo, path, { text, sha, message }) => {
      const data = await call('PUT', urlOf(repo, path), { message, content: encodeBase64(text), sha });
      return data.content.sha;
    },
  };
};
