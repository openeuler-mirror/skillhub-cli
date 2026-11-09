export interface UpdateSourceEntry {
  source: string;
  sourceUrl: string;
  ref?: string;
  skillPath?: string;
}

export interface LocalUpdateSourceEntry {
  source: string;
  ref?: string;
  skillPath?: string;
}

export function formatSourceInput(sourceUrl: string, ref?: string): string {
  if (!ref) {
    return sourceUrl;
  }
  return `${sourceUrl}#${ref}`;
}

/**
 * Derive the skill's folder path from a SKILL.md-terminated skillPath.
 * Returns '' when the skill lives at the repo root.
 */
function deriveSkillFolder(skillPath: string): string {
  let folder = skillPath;
  if (folder.endsWith('/SKILL.md')) {
    folder = folder.slice(0, -9);
  } else if (folder.endsWith('SKILL.md')) {
    folder = folder.slice(0, -8);
  }
  if (folder.endsWith('/')) {
    folder = folder.slice(0, -1);
  }
  return folder;
}

/**
 * Whether a skill folder can be safely appended to the given source as a
 * subpath. Only true for sources the source-parser can resolve as a
 * GitHub/GitLab tree URL — owner/repo shorthand or an HTTPS URL on those
 * hosts. Full SSH URLs (`git@host:owner/repo.git`) and generic Git URLs
 * (anything ending in `.git`, or hosts other than github.com/gitlab.com)
 * cannot have a subpath appended without producing an unclonable URL.
 */
function supportsAppendedSubpath(source: string): boolean {
  if (source.startsWith('git@')) return false;
  if (source.endsWith('.git')) return false;
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const host = new URL(source).hostname;
      return host === 'github.com' || host === 'gitlab.com';
    } catch {
      return false;
    }
  }
  return true;
}

function appendFolderAndRef(source: string, skillPath: string, ref?: string): string {
  if (!supportsAppendedSubpath(source)) {
    return formatSourceInput(source, ref);
  }
  const folder = deriveSkillFolder(skillPath);
  const withFolder = folder ? `${source}/${folder}` : source;
  return ref ? `${withFolder}#${ref}` : withFolder;
}

/**
 * Build the source argument for `wittyhub add` during update.
 * Uses shorthand form for path-targeted updates to avoid branch/path ambiguity.
 */
export function buildUpdateInstallSource(entry: UpdateSourceEntry): string {
  if (!entry.skillPath) {
    return formatSourceInput(entry.sourceUrl, entry.ref);
  }
  return appendFolderAndRef(entry.source, entry.skillPath, entry.ref);
}

/**
 * Build the source argument for `wittyhub add` during project-level update.
 * Local lock entries don't carry `sourceUrl`, so we fall back to the bare
 * `source` identifier when no `skillPath` is available.
 */
export function buildLocalUpdateSource(entry: LocalUpdateSourceEntry): string {
  if (!entry.skillPath) {
    return formatSourceInput(entry.source, entry.ref);
  }
  return appendFolderAndRef(entry.source, entry.skillPath, entry.ref);
}

const SOURCE_TYPE_HOST: Record<string, string> = {
  github: 'github.com',
  atomgit: 'atomgit.com',
  gitlab: 'gitlab.com',
  gitee: 'gitee.com',
};

/**
 * 把 `owner/repo` 短名按 sourceType 还原成可直接 `git clone` 的 HTTPS URL。
 * local lock 只存了 source 短名 + sourceType，缺 host 信息，短名无法被
 * git/source-parser 正确解析（短名会被默认当成 GitHub），因此 update 时需要
 * 借 sourceType 还原 host。完整 URL、SSH（git@/ssh://）或未知 sourceType 原样返回。
 */
export function resolveSourceUrl(source: string, sourceType: string): string {
  const host = SOURCE_TYPE_HOST[sourceType];
  if (!host) return source;
  if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(source)) return source;
  const prefixed = source.includes(':') ? source.slice(source.indexOf(':') + 1) : source;
  const repo = prefixed.replace(/\.git$/, '');
  return `https://${host}/${repo}.git`;
}
