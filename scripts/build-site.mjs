#!/usr/bin/env node
// Build the static directory page into dist/.
//
// Usage: node scripts/build-site.mjs [--dir <projects dir>] [--out <output dir>]
// Env: GITHUB_REPOSITORY ("owner/repo") sets the repo used for footer links.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_DIR, ROOT, displayPath, escapeHtml, loadAndCheckProjects } from './lib.mjs';

const DEFAULT_REPOSITORY = 'Synthux-Academy/community-instruments';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = option('--dir') ? path.resolve(option('--dir')) : PROJECTS_DIR;
const outDir = option('--out') ? path.resolve(option('--out')) : path.join(ROOT, 'dist');

const { projects, problems } = await loadAndCheckProjects(dir);
const errors = problems.filter((p) => p.severity === 'error');
if (errors.length) {
  for (const p of errors) console.error(`ERROR ${displayPath(p.file)}: ${p.message}`);
  console.error(`\nBuild aborted: ${errors.length} validation error(s). Run "npm run validate" for details.`);
  process.exit(1);
}

const entries = projects.map((p) => p.data);
const repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY}`;

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'index.html'), renderPage(entries, repoUrl));
await writeFile(path.join(outDir, 'projects.json'), renderJson(entries));
await writeFile(path.join(outDir, '.nojekyll'), '');
console.log(`Built ${entries.length} project(s) into ${displayPath(outDir) || outDir}/`);

// ---------------------------------------------------------------------------

function renderJson(list) {
  const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ schema_version: 1, generated_at: new Date().toISOString(), projects: sorted }, null, 2) + '\n';
}

function link(href, text) {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function renderRow(p) {
  const author = p.author.url ? link(p.author.url, p.author.name) : escapeHtml(p.author.name);
  return `<tr>
<td>${link(p.repo, p.name)}<p class="desc">${escapeHtml(p.description)}</p></td>
<td>${author}</td>
<td><span class="platform">${escapeHtml(p.platform)}</span></td>
</tr>`;
}

function renderPage(list, repo) {
  const sorted = [...list].sort((a, b) => {
    const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return byName || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const body = sorted.length
    ? `<div class="scroll"><table>
<thead><tr><th scope="col">Name</th><th scope="col">Author</th><th scope="col">Platform</th></tr></thead>
<tbody>
${sorted.map(renderRow).join('\n')}
</tbody>
</table></div>`
    : '<p class="empty">No projects are listed yet. Be the first to add one!</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Synthux Community Projects</title>
<style>
:root { color-scheme: light dark; --fg: #1a1a1a; --bg: #fff; --muted: #5c5c5c; --line: #ddd; --accent: #0b57d0; --note-bg: #fff6e0; --note-line: #e0b84c; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #e8e8e8; --bg: #141414; --muted: #a8a8a8; --line: #333; --accent: #8ab4f8; --note-bg: #2b2414; --note-line: #8a6d1f; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main, footer { max-width: 60rem; margin: 0 auto; padding: 0 1rem; }
h1 { font-size: 1.75rem; margin: 2rem 0 1rem; }
a { color: var(--accent); }
.notice { background: var(--note-bg); border-left: 4px solid var(--note-line); padding: .75rem 1rem; margin: 0 0 1.5rem; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: .6rem .75rem; border-bottom: 1px solid var(--line); }
th { font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
td:first-child { min-width: 16rem; }
td a { font-weight: 600; }
.desc { margin: .2rem 0 0; color: var(--muted); font-size: .9rem; }
.platform { display: inline-block; padding: 0 .5rem; border: 1px solid var(--line); border-radius: 999px; font-size: .85rem; white-space: nowrap; }
.empty { color: var(--muted); }
footer { margin-top: 2rem; padding-bottom: 2rem; color: var(--muted); font-size: .9rem; }
</style>
</head>
<body>
<main>
<h1>Community projects</h1>
<p class="notice" role="note">Everything here is made and looked after by people in the Synthux community. We love sharing their work, but we haven't reviewed or tested these projects ourselves. Before installing, have a look at each project's repository.</p>
${body}
</main>
<footer>
<p>${link(`${repo}/blob/main/CONTRIBUTING.md`, 'Add your project')} · ${link(repo, 'Source on GitHub')}</p>
</footer>
</body>
</html>
`;
}
