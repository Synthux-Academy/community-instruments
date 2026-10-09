# Adding your project

Thanks for sharing your work! This guide walks you through listing a project in the Synthux community directory. You don't need to be a programmer: adding a project means adding one small text file.

## 1. What this is (and isn't)

This repository is a **community directory**: a list of projects made by community members for Synthux platforms, with a link to each project's own repository on GitHub or Codeberg.

- **Listing is not endorsement.** Synthux does not test, review, or audit the code or firmware of listed projects.
- The directory only links to your repository. It does not host or mirror your files, and it does not flash firmware.
- Everything about your project (code, instructions, downloads) stays in your repository.

## 2. Before you submit

Your project needs:

- A **public repository** on [GitHub](https://github.com) or [Codeberg](https://codeberg.org).
- A **README** that explains what the project does and how to use it.

Recommended (not required yet):

- **Tagged releases** with the firmware attached as release assets. Use lowercase, hyphenated names that end in `.bin`, for example `my-project-v1.2.0.bin`. This isn't enforced now, but it will be needed if one-click flashing is added to the directory later.

## 3. How to add your project

1. **Fork** this repository (button at the top right on GitHub).
2. In your fork, copy [`templates/example-project.json`](templates/example-project.json) to `projects/<your-id>.json`. Pick an `id` such as `my-cool-synth`.
3. Edit the fields (see the table below), including `id` so it matches your new filename.
4. **Open a pull request** to this repository. Fill in the checklist in the PR description.

You can do all of this in the GitHub web interface: in your fork, use "Add file → Create new file". This directory lives on GitHub, so you need a GitHub account to open the pull request even if your project is on Codeberg.

### Field reference

| Field | Required | What to put |
|---|---|---|
| `schema_version` | yes | Always `1`. |
| `id` | yes | Unique short name: lowercase letters, digits and single hyphens, 3–64 characters (e.g. `my-cool-synth`). **Must match the filename** (`projects/my-cool-synth.json`). |
| `name` | yes | Display name, up to 80 characters. |
| `description` | yes | One line, up to 200 characters. No line breaks. |
| `author.name` | yes | Your name or handle, up to 80 characters. |
| `author.url` | no | A link to your homepage or profile. Must start with `https://`. |
| `repo` | yes | Your repository URL, exactly like `https://github.com/you/your-project` or `https://codeberg.org/you/your-project`. No trailing `/`, no `.git`, no sub-paths. Other hosts aren't supported yet. |
| `platform` | yes | One of `spotykach`, `touch`, `audrey` (see [Platforms](#9-platforms)). |
| `firmware` | no | **Reserved for future flashing support; ignored for now.** You may leave it out. |

Any other field is rejected, so typos are caught early.

### Full example

```json
{
  "schema_version": 1,
  "id": "example-project",
  "name": "Example Project",
  "description": "A one-line description of what this firmware does.",
  "author": { "name": "Jane Doe", "url": "https://example.com" },
  "repo": "https://github.com/janedoe/example-project",
  "platform": "touch"
}
```

Optional reserved block (ignored by the site today):

```json
"firmware": {
  "asset_pattern": "*.bin",
  "hardware": ["rev2"],
  "min_bootloader": "v6.0"
}
```

> **About `templates/example-project.json`:** it lives outside `projects/` so it never shows up in the directory. Please don't edit it; copy it into `projects/` under your own name instead.

## 4. What the automated checks do

When you open a pull request, a **Validate** check runs automatically. It verifies that:

- your file is valid JSON and follows the format above (required fields, allowed values, no unknown fields);
- the filename matches the `id`;
- no other entry already lists the same repository for the same platform.

During review, a maintainer also runs a **repository check** that looks at your repository on GitHub or Codeberg. It verifies that:

- your repository exists and is **public**;
- your repository has a **README**.

It also gives warnings (which don't block your PR) if your repository is archived or has no releases yet. If GitHub or Codeberg can't be reached, the result is a "could not verify" warning instead of a failure. You don't need to do anything to start it; if it finds a problem, the reviewer will tell you in the PR.

**Reading the results:** if the check fails, open the **Files changed** tab of your PR. Problems are shown as red annotations directly on your file, for example:

```
projects/my-cool-synth.json: /platform must be one of: "spotykach", "touch", "audrey"
```

The part starting with `/` tells you which field is wrong (`/author/url` means the `url` inside `author`). You can also click **Details** next to the check to see the full log. All problems are listed at once, so you can fix them in one go and push again.

## 5. What reviewers check

A maintainer will look at your PR and check that:

- the repository exists and matches the entry;
- it has a README;
- it plausibly targets the platform you chose;
- the name and description are accurate and not misleading.

Reviewers **do not** test, run, or audit your firmware or code.

## 6. Updating or removing your entry

Open a PR that edits or deletes your file in `projects/`. Entries rarely need updating: the directory links to your repository, so new releases, docs and changes show up there automatically.

## 7. Removal policy

Maintainers may delist entries that:

- are broken (for example, the repository no longer exists or is no longer public);
- are abandoned (repository deleted or archived without notice);
- misrepresent what they do;
- are harmful or malicious.

A weekly automated check may flag such entries in a tracking issue. Removal is not a judgment on the author; you are welcome to re-submit once the problem is fixed.

## 8. Code of conduct

Be kind and constructive in issues and pull requests. Harassment or abusive behaviour leads to removal from the project. <!-- TODO: link the Synthux code of conduct here if the org has one. -->

## 9. Platforms

| Value | Platform |
|---|---|
| `spotykach` | Spotykach, the Synthux hardware instrument. |
| `touch` | Simple Touch, the Synthux Daisy-based touch board. |
| `audrey` | Audrey, the Synthux string-feedback drone synth. |

Each entry targets **exactly one** platform. If your repository has firmware for several platforms, add one file per platform with distinct ids, for example `my-synth-touch.json` and `my-synth-audrey.json`, both pointing to the same `repo`.

**Need a platform that isn't listed?** Open an issue describing the platform. Adding one is a small change to the schema by a maintainer.
