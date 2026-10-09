// Online repository checks, one adapter per supported git host.
//
// Each adapter answers the same questions (exists and public, archived, has a
// README, has a release) so validate.mjs can treat hosts uniformly. Only a 404
// is a definitive failure; any other non-OK response or network error becomes
// a "could not verify" warning so rate limits never fail a build.

const USER_AGENT = 'synthux-community-projects-validator';

/** Split a repo URL into { host, owner, name }. Assumes it passed the schema. */
export function parseRepo(url) {
  const { hostname, pathname } = new URL(url);
  const [, owner, name] = pathname.split('/');
  return { host: hostname, owner, name };
}

async function getJson(fetchImpl, url, headers) {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
    const body = res.ok ? await res.json() : null;
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: null, networkError: err.message };
  }
}

export const HOSTS = {
  'github.com': {
    label: 'GitHub',
    tokenEnv: 'GITHUB_TOKEN',
    // Anonymous GitHub API access is limited to 60 requests/hour, so require a token.
    requiresToken: true,
    api(fetchImpl, token) {
      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      };
      return (p) => getJson(fetchImpl, `https://api.github.com${p}`, headers);
    },
    repoPath: (owner, name) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    readmePath: (base) => `${base}/readme`,
    readmeFound: (body) => Boolean(body),
    releasesPath: (base) => `${base}/releases?per_page=1`,
  },
  'codeberg.org': {
    label: 'Codeberg',
    tokenEnv: 'CODEBERG_TOKEN',
    // Codeberg (Forgejo) allows anonymous API access; a token is optional.
    requiresToken: false,
    api(fetchImpl, token) {
      const headers = { Accept: 'application/json', ...(token ? { Authorization: `token ${token}` } : {}) };
      return (p) => getJson(fetchImpl, `https://codeberg.org/api/v1${p}`, headers);
    },
    repoPath: (owner, name) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    // Forgejo has no /readme endpoint: list the root of the default branch instead.
    readmePath: (base) => `${base}/contents`,
    readmeFound: (body) => Array.isArray(body) && body.some((f) => f.type === 'file' && /^readme(\..+)?$/i.test(f.name)),
    releasesPath: (base) => `${base}/releases?limit=1`,
  },
};

/**
 * Run the online checks for one entry.
 * `tokens` maps env var names to values; `fetchImpl` is injectable for tests.
 * Returns [{ file, severity, message }].
 */
export async function checkRepo({ file, data }, { tokens = {}, fetchImpl = fetch } = {}) {
  const out = [];
  const add = (severity, message) => out.push({ file, severity, message });
  const couldNotVerify = (what, res) =>
    add('warning', `could not verify ${what} for ${data.repo} (${res.networkError ?? `HTTP ${res.status}`}); will not fail the build`);

  const { host, owner, name } = parseRepo(data.repo);
  const adapter = HOSTS[host];
  if (!adapter) {
    add('error', `/repo host "${host}" is not supported`);
    return out;
  }
  const token = tokens[adapter.tokenEnv];
  if (adapter.requiresToken && !token) {
    add('warning', `online checks for ${data.repo} skipped (${adapter.tokenEnv} not set)`);
    return out;
  }

  const api = adapter.api(fetchImpl, token);
  const base = adapter.repoPath(owner, name);

  const repo = await api(base);
  if (repo.status === 404) {
    add('error', `/repo ${data.repo} does not exist or is not public`);
    return out;
  }
  if (!repo.body) {
    couldNotVerify('repository', repo);
    return out;
  }
  if (repo.body.private) add('error', `/repo ${data.repo} is private; it must be public`);
  if (repo.body.archived) add('warning', `/repo ${data.repo} is archived`);

  const readme = await api(adapter.readmePath(base));
  // A 404 here means no README (GitHub) or an empty repository (Codeberg).
  if (readme.status === 404 || (readme.body && !adapter.readmeFound(readme.body))) {
    add('error', `/repo ${data.repo} has no README`);
  } else if (!readme.body) {
    couldNotVerify('README', readme);
  }

  const releases = await api(adapter.releasesPath(base));
  if (Array.isArray(releases.body)) {
    if (releases.body.length === 0) add('warning', `/repo ${data.repo} has no releases (future flashing support will need them)`);
  } else {
    couldNotVerify('releases', releases);
  }

  return out;
}
