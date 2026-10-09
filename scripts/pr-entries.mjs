#!/usr/bin/env node
// Prepare a pull request's project entries for the manual repo check (check-repos.yml).
//
// Usage: node scripts/pr-entries.mjs <pr-number> <out-dir>
//
// Runs from a checkout of the default branch. Copies its projects/ into <out-dir>,
// then applies the PR's changes to projects/ by reading file contents with
// `git show`. PR files are only ever read as data; no code from the PR runs.
// Prints the changed ids (comma-separated) and writes `ids=` to $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, ROOT } from './lib.mjs';

const [pr, outArg] = process.argv.slice(2);
if (!/^[1-9][0-9]*$/.test(pr ?? '') || !outArg) {
  console.error('Usage: node scripts/pr-entries.mjs <pr-number> <out-dir>');
  process.exit(2);
}
const outDir = path.resolve(outArg);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

const prRef = `refs/remotes/pr/${pr}`;
git('fetch', '--no-tags', '--quiet', 'origin', `+refs/pull/${pr}/head:${prRef}`);
const base = git('merge-base', 'HEAD', prRef).trim();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.dirname(outDir), { recursive: true });
cpSync(PROJECTS_DIR, outDir, { recursive: true });

// -z output: status and path alternate, NUL-separated. --no-renames turns a
// rename into a delete plus an add.
const fields = git('diff', '--name-status', '-z', '--no-renames', base, prRef, '--', 'projects/').split('\0').filter(Boolean);
const ids = [];
for (let i = 0; i < fields.length; i += 2) {
  const [status, file] = [fields[i], fields[i + 1]];
  const rel = file.slice('projects/'.length);
  const target = path.join(outDir, rel.split('/')[0]);
  if (status === 'D') {
    if (!rel.includes('/')) rmSync(target, { force: true });
    continue;
  }
  if (rel.includes('/')) {
    // Subdirectories aren't allowed; recreate one so the validator reports it.
    mkdirSync(target, { recursive: true });
    continue;
  }
  writeFileSync(target, execFileSync('git', ['show', `${prRef}:${file}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }));
  // Only plain names reach $GITHUB_OUTPUT; anything odd fails the slug check anyway.
  const id = rel.slice(0, -'.json'.length);
  if (rel.endsWith('.json') && /^[A-Za-z0-9._-]+$/.test(id)) ids.push(id);
}

console.log(`PR #${pr} changes ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}: ${ids.join(', ') || '(none)'}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ids=${ids.join(',')}\n`);
