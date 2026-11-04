# AGENTS.md

This file provides guidance to AI coding agents working on the `skillhub-cli` CLI codebase.

## Project Overview

`skillhub-cli` is the CLI for the open agent skills ecosystem.

## Commands

| Command                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `skillhub-cli`                    | Show banner with available commands                 |
| `skillhub-cli add <pkg>`          | Install skills from git repos, URLs, or local paths (aliases: `a`, `i`, `install`) |
| `skillhub-cli experimental_install` | Restore skills from skills-lock.json             |
| `skillhub-cli experimental_sync`  | Sync skills from node_modules into agent dirs       |
| `skillhub-cli list`               | List installed skills (alias: `ls`)                 |
| `skillhub-cli update [skills...]` | Update skills to latest versions                    |
| `skillhub-cli audit <skill_id>` | Show security audit result (risk level + risk signals) |
| `skillhub-cli get <skill_id>` | View skill details (author/category/version/description/tags) |
| `skillhub-cli init [name]`        | Create a new SKILL.md template                      |

Aliases: `skillhub-cli a`, `skillhub-cli i`, and `skillhub-cli install` all work as aliases for `add` (install skills from a repo/URL/skill_id). `skillhub-cli ls` works for `list`. `skillhub-cli experimental_install` restores skills from `skills-lock.json` — the only command that does; `skillhub-cli install` without arguments does NOT restore the lock (it errors with "Missing required argument: source"). `skillhub-cli experimental_sync` crawls `node_modules` for skills.

## Architecture

```
src/
├── cli.ts           # Main entry point, command routing, init/check/update
├── cli.test.ts      # CLI tests
├── add.ts           # Core add command logic
├── add-prompt.test.ts # Add prompt behavior tests
├── add.test.ts      # Add command tests
├── audit.ts         # Security audit command (risk level + risk signals)
├── audit.test.ts    # Audit command tests
├── constants.ts      # Shared constants
├── find.ts           # Find/search command
├── get.ts            # Get command - view skill details
├── get.test.ts       # Get command tests
├── list.ts          # List installed skills command
├── list.test.ts     # List command tests
├── remove.ts         # Remove command implementation
├── remove.test.ts    # Remove command tests
├── agents.ts        # Agent definitions and detection
├── installer.ts     # Skill installation logic (symlink/copy) + listInstalledSkills
├── skills.ts        # Skill discovery and parsing
├── skill-lock.ts    # Global lock file management (~/.agents/.skill-lock.json)
├── local-lock.ts    # Local lock file management (skills-lock.json, checked in)
├── sync.ts          # Sync command - crawl node_modules for skills
├── source-parser.ts # Parse git URLs, GitHub shorthand, local paths
├── git.ts           # Git clone operations
├── telemetry.ts     # Anonymous usage tracking
├── types.ts         # TypeScript types
├── mintlify.ts      # Mintlify skill fetching (legacy)
├── plugin-manifest.ts # Plugin manifest discovery support
├── prompts/         # Interactive prompt helpers
│   └── search-multiselect.ts
├── providers/       # Remote skill providers (GitHub, HuggingFace, Mintlify)
│   ├── index.ts
│   ├── registry.ts
│   ├── types.ts
│   ├── huggingface.ts
│   ├── mintlify.ts
│   └── wellknown.ts
├── init.test.ts     # Init command tests
└── test-utils.ts    # Test utilities

tests/
├── cross-platform-paths.test.ts # Path normalization across platforms
├── full-depth-discovery.test.ts # --full-depth skill discovery tests
├── openclaw-paths.test.ts       # OpenClaw-specific path tests
├── plugin-manifest-discovery.test.ts # Plugin manifest skill discovery
├── sanitize-name.test.ts     # Tests for sanitizeName (path traversal prevention)
├── skill-matching.test.ts    # Tests for filterSkills (multi-word skill name matching)
├── source-parser.test.ts     # Tests for URL/path parsing
├── installer-symlink.test.ts # Tests for symlink installation
├── list-installed.test.ts    # Tests for listing installed skills
├── skill-path.test.ts        # Tests for skill path handling
├── wellknown-provider.test.ts # Tests for well-known provider
├── xdg-config-paths.test.ts   # XDG global path handling tests
└── dist.test.ts               # Tests for built distribution
```

## Update Checking System

### How `skillhub-cli check` and `skillhub-cli update` Work

1. Read `~/.agents/.skill-lock.json` for installed skills
2. Filter to GitHub-backed skills that have both `skillFolderHash` and `skillPath`
3. For each skill, call `fetchSkillFolderHash(source, skillPath, token)`. Optional auth token is sourced from `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token` to improve rate limits.
4. `fetchSkillFolderHash` calls GitHub Trees API directly (`/git/trees/<branch>?recursive=1` for `main`, then `master` fallback)
5. Compare latest folder tree SHA with lock file `skillFolderHash`; mismatch means update available
6. `skillhub-cli update` reinstalls changed skills by invoking the current CLI entrypoint directly (`node <repo>/bin/cli.mjs add <source-tree-url> -g -y`) to avoid nested npm exec/npx behavior

### Lock File Compatibility

The lock file format is v3. Key field: `skillFolderHash` (GitHub tree SHA for the skill folder).

If reading an older lock file version, it's wiped. Users must reinstall skills to populate the new format.

## Key Integration Points

| Feature                    | Implementation                                                |
| -------------------------- | ------------------------------------------------------------- |
| `skillhub-cli add`              | `src/add.ts` - full implementation                            |
| `skillhub-cli experimental_sync` | `src/sync.ts` - crawl node_modules                           |
| `skillhub-cli check`            | `src/cli.ts` + `fetchSkillFolderHash` in `src/skill-lock.ts`  |
| `skillhub-cli update`           | `src/cli.ts` direct hash compare + reinstall via `skillhub-cli add` |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test locally
pnpm dev add vercel-labs/agent-skills --list
pnpm dev experimental_sync
pnpm dev check
pnpm dev update
pnpm dev init my-skill

# Run all tests
pnpm test

# Run specific test file(s)
pnpm test tests/sanitize-name.test.ts
pnpm test tests/skill-matching.test.ts tests/source-parser.test.ts

# Type check
pnpm type-check

# Format code
pnpm format

# Check formatting
pnpm format:check

# Validate and sync agent metadata/docs
pnpm run -C scripts validate-agents.ts
pnpm run -C scripts sync-agents.ts
```

## Code Style

This project uses Prettier for code formatting. **Always run `pnpm format` before committing changes** to ensure consistent formatting.

```bash
# Format all files
pnpm format

# Check formatting without fixing
pnpm format:check
```

CI will fail if code is not properly formatted.

## Publishing

```bash
# 1. Bump version in package.json
# 2. Build
pnpm build
# 3. Publish
npm publish
```

## Adding a New Agent

1. Add the agent definition to `src/agents.ts`
2. Run `pnpm run -C scripts validate-agents.ts` to validate
3. Run `pnpm run -C scripts sync-agents.ts` to update README.md and package keywords
