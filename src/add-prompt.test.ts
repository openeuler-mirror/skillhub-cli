import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectAgentsInteractive } from './add.js';
import * as skillLock from './skill-lock.js';
import * as searchMultiselectModule from './prompts/search-multiselect.js';

// Mock dependencies
vi.mock('./skill-lock.js');
vi.mock('./prompts/search-multiselect.js');
vi.mock('./telemetry.js', () => ({
  setVersion: vi.fn(),
  track: vi.fn(),
}));
vi.mock('../package.json', () => ({
  default: { version: '1.0.0' },
}));

const searchMultiselectMock = vi.mocked(searchMultiselectModule.searchMultiselect);

interface MenuOptions {
  initialSelected?: unknown;
  lockedSection?: { title: string; items: Array<{ value: string }> };
}

/** Capture the options passed to the interactive menu. */
function lastMenuOptions(): MenuOptions {
  return searchMultiselectMock.mock.calls[0]![0] as MenuOptions;
}

/**
 * Mock searchMultiselect so it behaves like the real component: locked values
 * are always merged into the returned selection.
 */
function mockMenuResult(toggled: string[] = []): void {
  searchMultiselectMock.mockImplementation(async (opts) => {
    const locked = (opts.lockedSection?.items ?? []).map((i) => i.value as string);
    return [...locked, ...toggled] as never;
  });
}

describe('selectAgentsInteractive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(skillLock.getLastSelectedAgents).mockResolvedValue(undefined);
  });

  it('should not pre-select any agents when there is no history', async () => {
    mockMenuResult();

    await selectAgentsInteractive({});

    expect(lastMenuOptions().initialSelected).toEqual([]);
  });

  it('should pre-select detected agents over selection history', async () => {
    vi.mocked(skillLock.getLastSelectedAgents).mockResolvedValue(['cursor']);
    mockMenuResult(['trae-cn']);

    await selectAgentsInteractive({ preset: ['trae-cn'] });

    expect(lastMenuOptions().initialSelected).toEqual(['trae-cn']);
  });

  it('should use last selected agents when no preset is given', async () => {
    vi.mocked(skillLock.getLastSelectedAgents).mockResolvedValue(['trae']);
    mockMenuResult(['trae']);

    await selectAgentsInteractive({});

    expect(lastMenuOptions().initialSelected).toEqual(['trae']);
  });

  it('should filter out invalid agents from history', async () => {
    vi.mocked(skillLock.getLastSelectedAgents).mockResolvedValue(['trae', 'invalid-agent']);
    mockMenuResult(['trae']);

    await selectAgentsInteractive({});

    expect(lastMenuOptions().initialSelected).toEqual(['trae']);
  });

  it('should save selected agents if not cancelled', async () => {
    mockMenuResult(['trae']);

    await selectAgentsInteractive({});

    expect(skillLock.saveSelectedAgents).toHaveBeenCalled();
  });

  it('should not save agents if cancelled', async () => {
    searchMultiselectMock.mockResolvedValue(Symbol('cancel'));

    const result = await selectAgentsInteractive({});

    expect(result).toBeTypeOf('symbol');
    expect(skillLock.saveSelectedAgents).not.toHaveBeenCalled();
  });

  it('should pin -a agents in the locked section and keep universal agents opt-in', async () => {
    // The real menu always includes locked values in its result.
    mockMenuResult();

    const result = await selectAgentsInteractive({ locked: ['claude-code'] });

    expect(lastMenuOptions().lockedSection?.title).toContain('-a');
    expect(lastMenuOptions().lockedSection?.items.map((i) => i.value)).toEqual(['claude-code']);
    // Explicit -a selection governs: universal agents are not auto-appended.
    expect(result).toEqual(['claude-code']);
  });

  it('should include universal agents for menu selections without -a', async () => {
    mockMenuResult(['trae']);

    const result = (await selectAgentsInteractive({})) as string[];

    expect(result).toContain('trae');
    // Hidden universal agents are always installed alongside the visible ones.
    expect(result).toContain('amp');
    expect(result).toContain('cline');
  });
});
