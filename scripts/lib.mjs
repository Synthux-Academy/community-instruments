// Shared helpers for validate.mjs and build-site.mjs.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECTS_DIR = path.join(ROOT, 'projects');
export const SCHEMA_PATH = path.join(ROOT, 'schema', 'project.schema.json');

/** Escape a value for safe use in HTML text and quoted attribute values. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Path shown in messages and annotations, relative to the repo root. */
export function displayPath(file) {
  const rel = path.relative(ROOT, file);
  return rel.startsWith('..') ? file : rel.split(path.sep).join('/');
}

let cachedValidator;
export async function getSchemaValidator() {
  if (!cachedValidator) {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    cachedValidator = ajv.compile(schema);
  }
  return cachedValidator;
}

/** Turn an Ajv error into a readable one-line message. */
function formatAjvError(err) {
  const where = err.instancePath || '/';
  switch (err.keyword) {
    case 'additionalProperties':
      return `${where} has unknown property "${err.params.additionalProperty}"`;
    case 'required':
      return `${where} is missing required property "${err.params.missingProperty}"`;
    case 'enum':
      return `${where} must be one of: ${err.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
    case 'const':
      return `${where} must be ${JSON.stringify(err.params.allowedValue)}`;
    case 'pattern':
      if (where === '/description') return `${where} must be a single line (no newlines)`;
      if (where === '/repo') return `${where} must look like https://github.com/<owner>/<repo> or https://codeberg.org/<owner>/<repo> (no trailing slash or sub-paths)`;
      return `${where} must match pattern ${err.params.pattern}`;
    case 'not':
      if (where === '/repo') return `${where} must not end in ".git"`;
      return `${where} ${err.message}`;
    default:
      return `${where} ${err.message}`;
  }
}

/**
 * Load every file in a projects directory and run all offline checks.
 * Returns { projects: [{ file, data }], problems: [{ file, severity, message }] }.
 * `projects` only contains entries that parsed and passed schema validation.
 */
export async function loadAndCheckProjects(dir = PROJECTS_DIR) {
  const validate = await getSchemaValidator();
  const problems = [];
  const projects = [];
  const error = (file, message) => problems.push({ file, severity: 'error', message });

  let names;
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, isFile: d.isFile() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    error(dir, `cannot read projects directory: ${err.message}`);
    return { projects, problems };
  }

  for (const { name, isFile } of names) {
    const file = path.join(dir, name);
    if (!isFile || !name.endsWith('.json')) {
      error(file, 'only *.json files are allowed in projects/');
      continue;
    }

    let data;
    try {
      data = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      error(file, `invalid JSON: ${err.message}`);
      continue;
    }

    let ok = true;
    if (!validate(data)) {
      ok = false;
      for (const err of validate.errors) error(file, formatAjvError(err));
    }

    const expectedId = name.slice(0, -'.json'.length);
    if (data && typeof data === 'object' && data.id !== expectedId) {
      ok = false;
      error(file, `/id must equal the filename without .json ("${expectedId}"), got ${JSON.stringify(data.id)}`);
    }

    if (ok) projects.push({ file, data });
  }

  // Duplicate repo + platform (repo compared case-insensitively). Duplicate ids
  // are impossible once id === filename holds.
  const seen = new Map();
  for (const p of projects) {
    const key = `${p.data.repo.toLowerCase()}|${p.data.platform}`;
    const first = seen.get(key);
    if (first) {
      error(p.file, `/repo ${p.data.repo} is already listed for platform "${p.data.platform}" in ${displayPath(first.file)}`);
    } else {
      seen.set(key, p);
    }
  }

  return { projects, problems };
}
