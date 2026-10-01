#!/usr/bin/env node
// Validate every entry in projects/.
//
// Usage: node scripts/validate.mjs [--offline] [--all] [--dir <path>] [--summary <file>]
//   --offline        skip GitHub API checks (also skipped when GITHUB_TOKEN is unset)
//   --all            run online checks for every entry, not only changed ones
//   --dir <path>     validate a different projects directory (used by tests)
//   --summary <file> write a Markdown summary of all problems (used by link-check.yml)
//
// Env: GITHUB_TOKEN enables online checks. BASE_REF (e.g. "main") limits online
// checks to entries added/changed relative to origin/<BASE_REF>.
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_DIR, ROOT, displayPath, loadAndCheckProjects } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const offline = flag('--offline');
const checkAll = flag('--all');
const dir = option('--dir') ? path.resolve(option('--dir')) : PROJECTS_DIR;
const summaryFile = option('--summary');
const token = process.env.GITHUB_TOKEN;
const inActions = process.env.GITHUB_ACTIONS === 'true';

const { projects, problems } = await loadAndCheckProjects(dir);

if (offline) {
  console.log('Online checks skipped (--offline).');
} else if (!token) {
  console.log('Online checks skipped (GITHUB_TOKEN not set).');
} else {
  const targets = checkAll ? projects : selectChanged(projects);
  console.log(`Running online checks for ${targets.length} of ${projects.length} entr${projects.length === 1 ? 'y' : 'ies'}.`);
  for (const p of targets) problems.push(...(await onlineChecks(p)));
}

report(problems, projects.length);
if (summaryFile) await writeFile(summaryFile, markdownSummary(problems));
process.exit(problems.some((p) => p.severity === 'error') ? 1 : 0);

// ---------------------------------------------------------------------------

/** Entries added or modified relative to the base ref; all entries if unknown. */
function selectChanged(all) {
  const baseRef = process.env.BASE_REF;
  if (!baseRef) return all;
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=AMR', `origin/${baseRef}...HEAD`, '--', path.relative(ROOT, dir)],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const changed = new Set(out.split('\n').filter(Boolean).map((f) => path.resolve(ROOT, f)));
    return all.filter((p) => changed.has(p.file));
  } catch (err) {
    console.log(`Could not diff against origin/${baseRef} (${err.message.trim()}); checking all entries.`);
    return all;
  }
}

async function gh(apiPath) {
  try {
    const res = await fetch(`https://api.github.com${apiPath}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'synthux-community-projects-validator',
      },
    });
    const body = res.ok ? await res.json() : null;
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: null, networkError: err.message };
  }
}

async function onlineChecks({ file, data }) {
  const out = [];
  const add = (severity, message) => out.push({ file, severity, message });
  const couldNotVerify = (what, res) =>
    add('warning', `could not verify ${what} for ${data.repo} (${res.networkError ?? `HTTP ${res.status}`}); will not fail the build`);

  const [, owner, name] = new URL(data.repo).pathname.split('/');
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  const repo = await gh(base);
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

  const readme = await gh(`${base}/readme`);
  if (readme.status === 404) add('error', `/repo ${data.repo} has no README`);
  else if (!readme.body) couldNotVerify('README', readme);

  const releases = await gh(`${base}/releases?per_page=1`);
  if (releases.body) {
    if (releases.body.length === 0) add('warning', `/repo ${data.repo} has no releases (future flashing support will need them)`);
  } else {
    couldNotVerify('releases', releases);
  }

  return out;
}

function escapeAnnotation(s, isProperty = false) {
  let r = String(s).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  if (isProperty) r = r.replaceAll(':', '%3A').replaceAll(',', '%2C');
  return r;
}

function report(list, count) {
  for (const p of list) {
    const rel = displayPath(p.file);
    const line = `${p.severity === 'error' ? 'ERROR' : 'WARNING'} ${rel}: ${p.message}`;
    (p.severity === 'error' ? console.error : console.log)(line);
    if (inActions) console.log(`::${p.severity} file=${escapeAnnotation(rel, true)}::${escapeAnnotation(p.message)}`);
  }
  const errors = list.filter((p) => p.severity === 'error').length;
  const warnings = list.length - errors;
  console.log(`\nChecked ${count} valid entr${count === 1 ? 'y' : 'ies'}: ${errors} error(s), ${warnings} warning(s).`);
}

function markdownSummary(list) {
  if (list.length === 0) return '';
  const rows = list.map((p) => `| ${p.severity} | \`${displayPath(p.file)}\` | ${p.message.replaceAll('|', '\\|')} |`);
  return ['| Severity | File | Problem |', '|---|---|---|', ...rows, ''].join('\n');
}
