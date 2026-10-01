# Implementation state

Handoff notes for anyone (human or agent) picking up this repo. The source of truth for requirements is `SPEC.md` (kept locally, **gitignored**, so it may not be present in a fresh clone). This file describes what is built, where, and what's left.

Last updated: 2026-10-01.

## Status

All of SPEC.md §3–§9 is implemented, including the optional `link-check.yml` (§6.3). The acceptance criteria in §10 are covered by `npm test`, apart from the two workflow criteria, which can only be verified on GitHub. Nothing has run in GitHub Actions yet, because the repo hasn't been pushed with these files.

Verified locally (Node 26, which is newer than the Node 20 the workflows use):
- `npm ci && npm run validate && npm run build && npm test` pass (9 tests).
- The online path was smoke-tested with a bogus token: a 401 response produces a "could not verify" warning and exit code 0. Real online checks with a valid token have **not** been run.

## Layout

```
.github/workflows/validate.yml   PR checks: npm ci, validate (online, changed entries only), build smoke test, npm test
.github/workflows/pages.yml      push to main, weekly, dispatch: validate --offline, build, deploy to Pages
.github/workflows/link-check.yml weekly: validate --all, opens/updates/closes one issue labelled "link-check"
.github/CODEOWNERS               placeholder team @Synthux-Academy/maintainers (TODO)
.github/PULL_REQUEST_TEMPLATE.md checklist (CONTRIBUTING §2 + §4)
projects/example-project.json    real entry -> Synthux-Academy/simple-touch-instruments (MIT, has README, no releases)
schema/project.schema.json       JSON Schema 2020-12, schema_version 1
scripts/lib.mjs                  shared: escapeHtml, displayPath, getSchemaValidator, loadAndCheckProjects (all offline checks)
scripts/validate.mjs             CLI: offline checks + GitHub API checks, CI annotations, --summary markdown
scripts/build-site.mjs           CLI: dist/index.html, dist/projects.json, dist/.nojekyll
test/validate.test.mjs           node:test suite (npm test)
test/fixtures/{broken,xss,future}/  fixtures; never put these in projects/
```

## Key behaviours and decisions

- **Example entry:** chose the "real entry" option from §4.2, not the `_`-prefix convention. The `id` is `example-project`, but the content describes the real `simple-touch-instruments` repo, so it passes the online checks (apart from a "no releases" warning). The convention is documented in CONTRIBUTING §3.
- **Offline checks** (`loadAndCheckProjects`): non-`.json` files are errors; dotfiles are ignored, so `.DS_Store` doesn't break anything. The other checks are JSON parse, Ajv (`allErrors`, `strict`, `ajv-formats`), id == filename, and duplicate `repo`+`platform` (repo compared case-insensitively; the same repo on different platforms is allowed). All problems are collected before exiting.
- **Schema details beyond the spec table:** `description` uses the pattern `^[^\r\n]*$` (single line). `repo` has `not: { pattern: "\\.git$" }`. `author.url` is `format: uri` plus `^https://`. `firmware` is optional, has `additionalProperties: false`, and is not read by the site.
- **Error messages** are mapped from Ajv to readable text in `formatAjvError` (lib.mjs). Format: `ERROR projects/foo.json: /path message`.
- **Annotations** (`::error file=...::msg`) are emitted only when `GITHUB_ACTIONS=true`, to keep local output clean.
- **Online checks** (validate.mjs `onlineChecks`) run only if `GITHUB_TOKEN` is set and `--offline` is not passed. With `BASE_REF` set, they cover only files that `git diff --diff-filter=AMR origin/$BASE_REF...HEAD` reports, and fall back to all entries if the diff fails. Only a 404 is treated as a definitive failure. Any other non-OK status or network error becomes a "could not verify" warning. Severities follow §5.2, **except the license check, which was removed at the maintainer's request (2026-10-05): a license is not required, checked or mentioned in the docs.**
- **Site:** no JS, inline CSS (about 20 lines), dark mode via `prefers-color-scheme`. Rows are sorted by name (case-insensitive), then by id. `projects.json` is sorted by id. Footer links come from `GITHUB_REPOSITORY`, falling back to `Synthux-Academy/community-instruments`. The CONTRIBUTING link assumes the default branch is `main`.
- **Actions** are pinned to full SHAs (checkout v7.0.1, setup-node v7.0.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1), with the version in a trailing comment.
- **Extra over spec:** an `npm test` script, `--dir`/`--out`/`--summary` CLI flags (for tests and link-check), and the `test/**` path in the validate.yml trigger.

## Open decisions for the maintainer (spec §11 + found during implementation)

1. Final URL: README currently has a placeholder, `synthux-academy.github.io/community-instruments/`. Decide between a custom domain, a proxy, or linking from synthux.academy.
2. The real CODEOWNERS team/handle (TODO in `.github/CODEOWNERS`).
3. Whether to keep `link-check.yml`. It's implemented and needs `issues: write`.
4. The workflows use Node 20 as the spec says, but Node 20 reached end-of-life in April 2026. Consider bumping `node-version` to 22 or 24 in all three workflows (and `engines` in package.json).
5. The one-line platform descriptions in CONTRIBUTING §9 are best guesses; maintainers should check them.
6. CONTRIBUTING §8 has a TODO to link a code of conduct.
7. Pages must be enabled with Source = "GitHub Actions" in repo settings.

## Ideas for next steps

- Push and confirm on GitHub: open a PR containing a broken entry and check that it gets annotations, then merge to `main` and confirm the Pages deploy.
- Run `GITHUB_TOKEN=<pat> npm run validate:online -- --all` once with a real token.
- When flashing is added: read `firmware` in the build, add a maintainer-owned `verified.json` (CODEOWNERS), and keep new schema fields optional.
