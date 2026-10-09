// Online-check adapters, exercised against a stubbed fetch (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRepo, parseRepo } from '../scripts/hosts.mjs';

const entry = (repo) => ({ file: 'projects/x.json', data: { id: 'x', repo } });

/** Build a fetch stub from a map of URL -> [status, body]; unknown URLs 404. */
function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const [status, body] = routes[url] ?? [404, null];
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetchImpl, calls };
}

const messages = (problems) => problems.map((p) => `${p.severity}: ${p.message}`);

test('parseRepo splits host, owner and name', () => {
  assert.deepEqual(parseRepo('https://codeberg.org/alice/synth'), { host: 'codeberg.org', owner: 'alice', name: 'synth' });
});

test('Codeberg: healthy repo passes with anonymous access', async () => {
  const api = 'https://codeberg.org/api/v1/repos/alice/synth';
  const { fetchImpl, calls } = stubFetch({
    [api]: [200, { private: false, archived: false }],
    [`${api}/contents`]: [200, [{ type: 'dir', name: 'src' }, { type: 'file', name: 'README.md' }]],
    [`${api}/releases?limit=1`]: [200, [{ tag_name: 'v1' }]],
  });
  const problems = await checkRepo(entry('https://codeberg.org/alice/synth'), { fetchImpl });
  assert.deepEqual(problems, []);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('Codeberg: token is sent when provided', async () => {
  const { fetchImpl, calls } = stubFetch({});
  await checkRepo(entry('https://codeberg.org/alice/synth'), { fetchImpl, tokens: { CODEBERG_TOKEN: 'abc' } });
  assert.equal(calls[0].headers.Authorization, 'token abc');
});

test('Codeberg: missing README, archived and no releases are reported', async () => {
  const api = 'https://codeberg.org/api/v1/repos/alice/synth';
  const { fetchImpl } = stubFetch({
    [api]: [200, { private: false, archived: true }],
    [`${api}/contents`]: [200, [{ type: 'dir', name: 'readme' }, { type: 'file', name: 'main.cpp' }]],
    [`${api}/releases?limit=1`]: [200, []],
  });
  const m = messages(await checkRepo(entry('https://codeberg.org/alice/synth'), { fetchImpl }));
  assert.ok(m.some((x) => /^warning: .* is archived/.test(x)));
  assert.ok(m.some((x) => /^error: .* has no README/.test(x)));
  assert.ok(m.some((x) => /^warning: .* has no releases/.test(x)));
});

test('Codeberg: README detection accepts common variants', async () => {
  const api = 'https://codeberg.org/api/v1/repos/alice/synth';
  for (const name of ['README', 'readme.md', 'README.rst', 'Readme.txt']) {
    const { fetchImpl } = stubFetch({
      [api]: [200, {}],
      [`${api}/contents`]: [200, [{ type: 'file', name }]],
      [`${api}/releases?limit=1`]: [200, [{}]],
    });
    assert.deepEqual(await checkRepo(entry('https://codeberg.org/alice/synth'), { fetchImpl }), [], name);
  }
});

test('Codeberg: 404 is a definitive error', async () => {
  const { fetchImpl } = stubFetch({});
  const m = messages(await checkRepo(entry('https://codeberg.org/alice/gone'), { fetchImpl }));
  assert.deepEqual(m, ['error: /repo https://codeberg.org/alice/gone does not exist or is not public']);
});

test('Codeberg: 403 / 429 / 5xx / network errors only warn', async () => {
  for (const status of [403, 429, 503]) {
    const { fetchImpl } = stubFetch({ 'https://codeberg.org/api/v1/repos/alice/synth': [status, null] });
    const problems = await checkRepo(entry('https://codeberg.org/alice/synth'), { fetchImpl });
    assert.deepEqual(problems.map((p) => p.severity), ['warning'], `HTTP ${status}`);
  }
  const failing = async () => { throw new Error('ECONNRESET'); };
  const problems = await checkRepo(entry('https://codeberg.org/alice/synth'), { fetchImpl: failing });
  assert.match(problems[0].message, /could not verify repository .* \(ECONNRESET\)/);
});

test('GitHub: skipped with a warning when no token is set', async () => {
  const { fetchImpl, calls } = stubFetch({});
  const m = messages(await checkRepo(entry('https://github.com/alice/synth'), { fetchImpl }));
  assert.deepEqual(m, ['warning: online checks for https://github.com/alice/synth skipped (GITHUB_TOKEN not set)']);
  assert.equal(calls.length, 0);
});

test('GitHub: private repo and missing README are errors', async () => {
  const api = 'https://api.github.com/repos/alice/synth';
  const { fetchImpl, calls } = stubFetch({
    [api]: [200, { private: true, archived: false }],
    [`${api}/releases?per_page=1`]: [200, [{}]],
  });
  const m = messages(await checkRepo(entry('https://github.com/alice/synth'), { fetchImpl, tokens: { GITHUB_TOKEN: 't' } }));
  assert.deepEqual(m, [
    'error: /repo https://github.com/alice/synth is private; it must be public',
    'error: /repo https://github.com/alice/synth has no README',
  ]);
  assert.equal(calls[0].headers.Authorization, 'Bearer t');
});
