#!/usr/bin/env node

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runAdd, parseAddOptions, initTelemetry } from './add.ts';
import { runAudit } from './audit.ts';
import { runFind } from './find.ts';
import { runGet } from './get.ts';
import { runInstallFromLock } from './install.ts';
import { runList } from './list.ts';
import { removeCommand, parseRemoveOptions } from './remove.ts';
import { runSync, parseSyncOptions } from './sync.ts';
import { flushTelemetry } from './telemetry.ts';
import { isRunningInAgent } from './detect-agent.ts';
import { runUpdate } from './update.ts';
import { runValidate } from './validate.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const VERSION = getVersion();
initTelemetry(VERSION);

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
// 256-color grays - visible on both light and dark backgrounds
const DIM = '\x1b[38;5;102m'; // darker gray for secondary text
const TEXT = '\x1b[38;5;145m'; // lighter gray for primary text

const LOGO_LINES = [
  '███████╗██╗  ██╗██╗██╗     ██╗     ██╗  ██╗██╗   ██╗██████╗',
  '██╔════╝██║ ██╔╝██║██║     ██║     ██║  ██║██║   ██║██╔══██╗',
  '███████╗█████╔╝ ██║██║     ██║     ███████║██║   ██║██████╔╝',
  '╚════██║██╔═██╗ ██║██║     ██║     ██╔══██║██║   ██║██╔══██╗',
  '███████║██║  ██╗██║███████╗███████╗██║  ██║╚██████╔╝██████╔╝',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝',
];

// 256-color middle grays - visible on both light and dark backgrounds
const GRAYS = [
  '\x1b[38;5;250m', // lighter gray
  '\x1b[38;5;248m',
  '\x1b[38;5;245m', // mid gray
  '\x1b[38;5;243m',
  '\x1b[38;5;240m',
  '\x1b[38;5;238m', // darker gray
];

function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}${RESET}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(`${DIM}The open agent skills ecosystem${RESET}`);
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli add ${DIM}<package>${RESET}        ${DIM}Add a new skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli remove${RESET}               ${DIM}Remove installed skills${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli list${RESET}                 ${DIM}List installed skills${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli find ${DIM}[query]${RESET}         ${DIM}Search for skills${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli update${RESET}               ${DIM}Update installed skills${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli experimental_install${RESET} ${DIM}Restore from skills-lock.json${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli init ${DIM}[name]${RESET}          ${DIM}Create a new skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli validate ${DIM}<path>${RESET}   ${DIM}Validate a local skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillhub-cli experimental_sync${RESET}    ${DIM}Sync skills from node_modules${RESET}`
  );
  console.log();
  console.log(`${DIM}try:${RESET} npx skillhub-cli add atomgit:openeuler/witty-diagnosis-agent`);
  console.log();
  console.log(`Discover more skills at ${TEXT}https://skillhub.openeuler.org/${RESET}`);
  console.log();
}

function showHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skillhub-cli <command> [options]

${BOLD}Manage Skills:${RESET}
  add <package>        Add a skill package (alias: a)
                       e.g. vercel-labs/agent-skills
                            https://github.com/vercel-labs/agent-skills
  remove [skills]      Remove installed skills
  list, ls             List installed skills
  find [query]         Search for skills interactively
  audit <skill_id>       Show security audit result (risk level + risk signals)
  get <skill_id>         View skill details (author/category/version/description/tags)
  validate <path>     Validate a local skill for spec compliance (SKILL.md filename,
                       frontmatter, required fields name/description, etc.)

${BOLD}Find Options:${RESET}
  --owner <owner>        Filter by Git owner (GitHub/AtomGit)
  --category <cats>      Filter by category (comma-separated)
  --tag <tags>           Filter by tags (comma-separated)
  --platform <plats>     Filter by platform: community, enterprise, personal
  --risk <levels>        Filter by risk level: safe, low, medium, high
  --sort <sort>          Sort by: relevance, download_count, updated_at
  --limit <n>            Max results returned (1-100, default 10)
  --mode <mode>          Search mode: text, semantic, hybrid (default text)

${BOLD}Updates:${RESET}
  update [skills...]   Update skills to latest versions (alias: upgrade)

${BOLD}Update Options:${RESET}
  -g, --global           Update global skills only
  -p, --project          Update project skills only
  -y, --yes              Skip scope prompt (auto-detect: project if in a project, else global)

${BOLD}Project:${RESET}
  experimental_install Restore skills from skills-lock.json
  init [name]          Initialize a skill (creates <name>/SKILL.md; defaults to my-skill/)
  experimental_sync    Sync skills from node_modules into agent directories

${BOLD}Add Options:${RESET}
  -g, --global           Install skill globally (user-level) instead of project-level
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -s, --skill <skills>   Specify skill names to install (use '*' for all skills)
  -l, --list             List available skills in the repository without installing
  -y, --yes              Skip confirmation prompts
  --copy                 Copy files instead of symlinking to agent directories
  --subagent <names>     Install to Eve subagents (use 'root' for the root agent)
  --all                  Shorthand for --skill '*' --agent '*' -y
  --full-depth           Search all subdirectories even when a root SKILL.md exists
  -v, --version <ver>    Download a specific skill version from skill_versions table

${BOLD}Configuration:${RESET}
  Backend API URL (used by add/search/download) resolved in priority order:
    1. ~/.config/skillhub-cli/cli.yaml  api_url
    2. SKILLS_API_URL env var            (auto-appends /api/v1)
    3. default: https://skillhub.openeuler.org/api/v1

${BOLD}Remove Options:${RESET}
  -g, --global           Remove from global scope
  -a, --agent <agents>   Remove from specific agents (use '*' for all agents)
  -s, --skill <skills>   Specify skills to remove (use '*' for all skills)
  -y, --yes              Skip confirmation prompts
  --all                  Shorthand for --skill '*' --agent '*' -y
  
${BOLD}Experimental Sync Options:${RESET}
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -y, --yes              Skip confirmation prompts

${BOLD}List Options:${RESET}
  -g, --global           List global skills (default: project)
  -a, --agent <agents>   Filter by specific agents
  --json                 Output as JSON (machine-readable, no ANSI codes)

${BOLD}Options:${RESET}
  --help, -h        Show this help message
  --version, -v     Show version number

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillhub-cli add https://atomgit.com/openeuler/witty-diagnosis-agent --skill system-resource-diagnosis
  ${DIM}$${RESET} skillhub-cli add https://atomgit.com/openeuler/witty-diagnosis-agent --skill system-resource-diagnosis -g
  ${DIM}$${RESET} skillhub-cli add https://atomgit.com/openeuler/witty-diagnosis-agent --skill system-resource-diagnosis --agent claude-code cursor
  ${DIM}$${RESET} skillhub-cli remove                        ${DIM}# interactive remove${RESET}
  ${DIM}$${RESET} skillhub-cli remove web-design             ${DIM}# remove by name${RESET}
  ${DIM}$${RESET} skillhub-cli rm --global frontend-design
  ${DIM}$${RESET} skillhub-cli list                          ${DIM}# list project skills${RESET}
  ${DIM}$${RESET} skillhub-cli ls -g                         ${DIM}# list global skills${RESET}
  ${DIM}$${RESET} skillhub-cli ls -a claude-code             ${DIM}# filter by agent${RESET}
  ${DIM}$${RESET} skillhub-cli ls --json                      ${DIM}# JSON output${RESET}
  ${DIM}$${RESET} skillhub-cli find                          ${DIM}# interactive search${RESET}
  ${DIM}$${RESET} skillhub-cli find typescript               ${DIM}# search by keyword${RESET}
  ${DIM}$${RESET} skillhub-cli find react --owner vercel     ${DIM}# search within an owner${RESET}
  ${DIM}$${RESET} skillhub-cli find k8s --category network --sort updated_at   ${DIM}# filter + sort${RESET}
  ${DIM}$${RESET} skillhub-cli update
  ${DIM}$${RESET} skillhub-cli update my-skill             ${DIM}# update a single skill${RESET}
  ${DIM}$${RESET} skillhub-cli update -g                    ${DIM}# update global skills only${RESET}
  ${DIM}$${RESET} skillhub-cli experimental_install            ${DIM}# restore from skills-lock.json${RESET}
  ${DIM}$${RESET} skillhub-cli init my-skill
  ${DIM}$${RESET} skillhub-cli experimental_sync              ${DIM}# sync from node_modules${RESET}
  ${DIM}$${RESET} skillhub-cli experimental_sync -y           ${DIM}# sync without prompts${RESET}

Discover more skills at ${TEXT}https://skillhub.openeuler.org/${RESET}
`);
}

function showInitHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skillhub-cli init [name]

${BOLD}Description:${RESET}
  Initialize a new skill by creating a SKILL.md template.

${BOLD}Arguments:${RESET}
  name              Optional skill name. Creates <name>/SKILL.md.
                    If omitted, defaults to my-skill/ (never the cwd itself).

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillhub-cli init                    ${DIM}# creates my-skill/SKILL.md${RESET}
  ${DIM}$${RESET} skillhub-cli init my-skill           ${DIM}# creates my-skill/SKILL.md${RESET}
  ${DIM}$${RESET} skillhub-cli init code-reviewer      ${DIM}# creates code-reviewer/SKILL.md${RESET}
`);
}

function showValidateHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skillhub-cli validate <path> [options]

${BOLD}Description:${RESET}
  Validate a local skill for spec compliance (SKILL.md filename, frontmatter,
  required fields, etc.). Reports errors (must-fix) and warnings (recommended).

${BOLD}Arguments:${RESET}
  path               Path to the skill directory or SKILL.md file.

${BOLD}Options:${RESET}
  --json             Output result as JSON (no ANSI colors).
  -h, --help         Show this help message.

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillhub-cli validate ./my-skill
  ${DIM}$${RESET} skillhub-cli validate ./my-skill/SKILL.md
  ${DIM}$${RESET} skillhub-cli validate ./my-skill --json
`);
}

function showRemoveHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skillhub-cli remove [skills...] [options]

${BOLD}Description:${RESET}
  Remove installed skills from agents. If no skill names are provided,
  an interactive selection menu will be shown.

${BOLD}Arguments:${RESET}
  skills            Optional skill names to remove (space-separated)

${BOLD}Options:${RESET}
  -g, --global       Remove from global scope (~/) instead of project scope
  -a, --agent        Remove from specific agents (use '*' for all agents)
  -s, --skill        Specify skills to remove (use '*' for all skills)
  -y, --yes          Skip confirmation prompts
  --all              Shorthand for --skill '*' --agent '*' -y

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillhub-cli remove                           ${DIM}# interactive selection${RESET}
  ${DIM}$${RESET} skillhub-cli remove my-skill                   ${DIM}# remove specific skill${RESET}
  ${DIM}$${RESET} skillhub-cli remove skill1 skill2 -y           ${DIM}# remove multiple skills${RESET}
  ${DIM}$${RESET} skillhub-cli remove --global my-skill          ${DIM}# remove from global scope${RESET}
  ${DIM}$${RESET} skillhub-cli rm --agent claude-code my-skill   ${DIM}# remove from specific agent${RESET}
  ${DIM}$${RESET} skillhub-cli remove --all                      ${DIM}# remove all skills${RESET}
  ${DIM}$${RESET} skillhub-cli remove --skill '*' -a cursor      ${DIM}# remove all skills from cursor${RESET}

Discover more skills at ${TEXT}https://skillhub.openeuler.org/${RESET}
`);
}

function runInit(args: string[]): void {
  const cwd = process.cwd();
  // Default to "my-skill" so `skillhub-cli init` always creates a dedicated
  // subdirectory instead of dropping SKILL.md into the current directory.
  const skillName = args[0] ?? 'my-skill';

  const skillDir = join(cwd, skillName);
  const skillFile = join(skillDir, 'SKILL.md');
  const displayPath = `${skillName}/SKILL.md`;

  if (existsSync(skillFile)) {
    console.log(`${TEXT}Skill already exists at ${DIM}${displayPath}${RESET}`);
    return;
  }

  mkdirSync(skillDir, { recursive: true });

  const skillContent = `---
name: ${skillName}
description: A brief description of what this skill does
version: 0.1.0  # optional; increment as needed
category: others  # optional;change if needed — full list at https://atomgit.com/openeuler/openEuler-skills
---

# ${skillName}

Instructions for the agent to follow when this skill is activated.

## When to use

Describe when this skill should be used.

## Instructions

1. First step
2. Second step
3. Additional steps as needed
`;

  writeFileSync(skillFile, skillContent);

  console.log(`${TEXT}Initialized skill: ${DIM}${skillName}${RESET}`);
  console.log();
  console.log(`${DIM}Created:${RESET}`);
  console.log(`  ${displayPath}`);
  console.log();
  console.log(`${DIM}Next steps:${RESET}`);
  console.log(`  1. Edit ${TEXT}${displayPath}${RESET} to define your skill instructions`);
  console.log(
    `  2. Update the ${TEXT}name${RESET} and ${TEXT}description${RESET} in the frontmatter`
  );
  console.log(
    `  3. Optionally set ${TEXT}version${RESET} and ${TEXT}category${RESET} (see the comment in ${TEXT}${displayPath}${RESET} for the full list of categories)`
  );
  console.log();
  console.log(`${DIM}Publishing:${RESET}`);
  console.log(
    `  Submit your skill to ${TEXT}https://atomgit.com/openeuler/openEuler-skills${RESET}`
  );
  console.log();
  console.log(
    `Browse existing skills for inspiration at ${TEXT}https://skillhub.openeuler.org/${RESET}`
  );
  console.log();
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inAgent = await isRunningInAgent();

  if (args.length === 0) {
    if (!inAgent) {
      showBanner();
    }
    return;
  }

  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case 'find':
    case 'search':
    case 'f':
    case 's':
      if (!inAgent) showLogo();
      console.log();
      await runFind(restArgs);
      break;
    case 'init':
      // Check for --help or -h flag
      if (restArgs.includes('--help') || restArgs.includes('-h')) {
        showInitHelp();
        break;
      }
      if (!inAgent) showLogo();
      console.log();
      runInit(restArgs);
      break;
    case 'experimental_install': {
      if (!inAgent) showLogo();
      await runInstallFromLock(restArgs);
      break;
    }
    case 'i':
    case 'install':
    case 'a':
    case 'add': {
      if (!inAgent) showLogo();
      const { source: addSource, options: addOpts } = parseAddOptions(restArgs);
      await runAdd(addSource, addOpts);
      break;
    }
    case 'remove':
    case 'rm':
    case 'r':
      // Check for --help or -h flag
      if (restArgs.includes('--help') || restArgs.includes('-h')) {
        showRemoveHelp();
        break;
      }
      const { skills, options: removeOptions } = parseRemoveOptions(restArgs);
      await removeCommand(skills, removeOptions);
      break;
    case 'experimental_sync': {
      if (!inAgent) showLogo();
      const { options: syncOptions } = parseSyncOptions(restArgs);
      await runSync(restArgs, syncOptions);
      break;
    }
    case 'list':
    case 'ls':
      await runList(restArgs);
      break;
    case 'audit': {
      if (!inAgent) showLogo();
      await runAudit(restArgs);
      break;
    }
    case 'get': {
      if (!inAgent) showLogo();
      await runGet(restArgs);
      break;
    }
    case 'validate':
    case 'check-skill': {
      // Check for --help or -h flag
      if (restArgs.includes('--help') || restArgs.includes('-h')) {
        showValidateHelp();
        break;
      }
      if (!inAgent) showLogo();
      console.log();
      await runValidate(restArgs);
      break;
    }
    case 'check':
    case 'update':
    case 'upgrade':
      await runUpdate(restArgs);
      break;
    case '--help':
    case '-h':
      showHelp();
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Run ${BOLD}skillhub-cli --help${RESET} for usage.`);
  }
}

main().finally(() => flushTelemetry().then(() => process.exit(0)));
