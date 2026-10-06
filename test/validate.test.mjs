// Run with `npm test`. Fixtures live in test/fixtures/, never in projects/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../scripts/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => path.join(ROOT, 'test', 'fixtures', name);
const env = { ...process.env, GITHUB_TOKEN: '', GITHUB_ACTIONS: '' };

function run(script, ...args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, env, encoding: 'utf8' });
}

function build(dir) {
  const out = mkdtempSync(path.join(tmpdir(), 'synthux-site-'));
  const res = run('build-site.mjs', '--dir', dir, '--out', out);
  return { res, out, html: res.status === 0 ? readFileSync(path.join(out, 'index.html'), 'utf8') : '' };
}

test('real projects/ directory validates and builds', () => {
  assert.equal(run('validate.mjs', '--offline').status, 0);
  const { res, out } = build(path.join(ROOT, 'projects'));
  assert.equal(res.status, 0, res.stderr);
  const json = JSON.parse(readFileSync(path.join(out, 'projects.json'), 'utf8'));
  assert.equal(json.schema_version, 1);
  assert.ok(Array.isArray(json.projects) && json.projects.length > 0);
  rmSync(out, { recursive: true });
});

test('contributor template in templates/ stays valid', () => {
  const res = run('validate.mjs', '--offline', '--dir', path.join(ROOT, 'templates'));
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('broken entries report every problem in one run', () => {
  const res = run('validate.mjs', '--offline', '--dir', fixture('broken'));
  assert.equal(res.status, 1);
  const expected = [
    /Bad_Slug\.json: \/id must match pattern/,
    /bad-repo\.json: \/repo must not end in "\.git"/,
    /extra-prop\.json: \/ has unknown property "tags"/,
    /id-mismatch\.json: \/id must equal the filename/,
    /missing-field\.json: \/ is missing required property "description"/,
    /not-json\.json: invalid JSON/,
    /notes\.txt: only \*\.json files are allowed/,
    /unknown-platform\.json: \/platform must be one of/,
    /dup-b\.json: \/repo .* is already listed for platform "touch"/,
  ];
  for (const re of expected) assert.match(res.stderr, re);
  // Same repo on a different platform is allowed.
  assert.doesNotMatch(res.stderr, /dup-c\.json/);
});

test('GitHub annotations are emitted in Actions', () => {
  const res = spawnSync(process.execPath, ['scripts/validate.mjs', '--offline', '--dir', fixture('broken')], {
    cwd: ROOT, env: { ...env, GITHUB_ACTIONS: 'true' }, encoding: 'utf8',
  });
  assert.match(res.stdout, /^::error file=test\/fixtures\/broken\/extra-prop\.json::/m);
});

test('build refuses invalid data', () => {
  const { res } = build(fixture('broken'));
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Build aborted/);
});

test('HTML-significant characters render as inert text', () => {
  const { res, html } = build(fixture('xss'));
  assert.equal(res.status, 0, res.stderr);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>Mallory/);
  assert.match(html, /&lt;script&gt;alert\(&#39;name&#39;\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=&#39;x&#39;"/);
});

test('page has no scripts or external resources', () => {
  const { html } = build(path.join(ROOT, 'projects'));
  assert.doesNotMatch(html, /<script|<link|<img|<iframe|@import|url\(|src=/i);
  for (const a of html.match(/<a [^>]*>/g)) {
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer"/);
  }
});

test('empty directory shows the empty state', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'synthux-empty-'));
  const { res, html } = build(empty);
  assert.equal(res.status, 0, res.stderr);
  assert.match(html, /No projects are listed yet/);
  assert.doesNotMatch(html, /<table/);
});

test('optional reserved firmware block stays valid', () => {
  assert.equal(run('validate.mjs', '--offline', '--dir', fixture('future')).status, 0);
});

test('escapeHtml escapes all special characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

