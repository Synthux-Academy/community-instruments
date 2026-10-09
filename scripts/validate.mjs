#!/usr/bin/env node
// Validate every entry in projects/.
//
// Usage: node scripts/validate.mjs [--offline] [--all | --only <ids>] [--dir <path>] [--summary <file>]
//   --offline        skip online repository checks
//   --all            online-check every entry (default when --only is not given)
//   --only <ids>     online-check only these comma-separated ids (at most MAX_ONLY)
//   --dir <path>     validate a different projects directory (used by tests and check-repos.yml)
//   --summary <file> write a Markdown summary of all problems (used by the workflows)
//
// Env: GITHUB_TOKEN is required to check github.com repos. CODEBERG_TOKEN is
// optional for codeberg.org repos (anonymous access works, with lower limits).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkRepo } from './hosts.mjs';
import { PROJECTS_DIR, displayPath, loadAndCheckProjects } from './lib.mjs';

// Caps API traffic per manual PR check; a real contribution adds one or two files.
const MAX_ONLY = 10;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const offline = flag('--offline');
const only = option('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const dir = option('--dir') ? path.resolve(option('--dir')) : PROJECTS_DIR;
const summaryFile = option('--summary');
const tokens = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, CODEBERG_TOKEN: process.env.CODEBERG_TOKEN };
const inActions = process.env.GITHUB_ACTIONS === 'true';

const { projects, problems } = await loadAndCheckProjects(dir);

if (offline) {
  console.log('Online checks skipped (--offline).');
} else if (only && !flag('--all') && only.length > MAX_ONLY) {
  problems.push({
    file: dir,
    severity: 'error',
    message: `${only.length} entries changed; online checks are limited to ${MAX_ONLY} per run. Please split the pull request.`,
  });
} else {
  const targets = only && !flag('--all') ? projects.filter((p) => only.includes(p.data.id)) : projects;
  console.log(`Running online checks for ${targets.length} of ${projects.length} entr${projects.length === 1 ? 'y' : 'ies'}.`);
  for (const p of targets) problems.push(...(await checkRepo(p, { tokens })));
}

report(problems, projects.length);
if (summaryFile) await writeFile(summaryFile, markdownSummary(problems));
process.exit(problems.some((p) => p.severity === 'error') ? 1 : 0);

// ---------------------------------------------------------------------------

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
