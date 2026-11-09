import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFindOptions, searchSkillsAPI } from './find.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseFindOptions', () => {
  it('separates and normalizes an owner from a multi-word query', () => {
    expect(parseFindOptions(['react', 'native', '--owner', 'Vercel'])).toEqual({
      query: 'react native',
      options: { owner: 'vercel' },
      errors: [],
    });
  });

  it('supports the --owner=value form', () => {
    expect(parseFindOptions(['--owner=vercel-labs', 'next'])).toEqual({
      query: 'next',
      options: { owner: 'vercel-labs' },
      errors: [],
    });
  });

  it('rejects missing and invalid owners', () => {
    expect(parseFindOptions(['react', '--owner']).errors).toEqual(['--owner requires an owner']);
    expect(parseFindOptions(['react', '--owner', 'not/an/owner']).errors).toEqual([
      '--owner must be a valid owner',
    ]);
  });

  it('parses category/tag/platform/risk/sort/limit options', () => {
    expect(
      parseFindOptions([
        'network',
        '--category',
        'Monitoring, Security',
        '--tag=kubernetes,linux',
        '--platform',
        'community',
        '--risk',
        'low,medium',
        '--sort',
        'updated_at',
        '--limit',
        '25',
      ])
    ).toEqual({
      query: 'network',
      options: {
        category: 'monitoring,security',
        tags: 'kubernetes,linux',
        platform: 'community',
        risk: 'low,medium',
        sort: 'updated_at',
        limit: 25,
      },
      errors: [],
    });
  });

  it('rejects invalid sort and out-of-range limit', () => {
    expect(parseFindOptions(['--sort', 'name']).errors).toEqual([
      '--sort must be one of: relevance, download_count, updated_at',
    ]);
    expect(parseFindOptions(['--limit', '0']).errors).toEqual([
      '--limit must be a number between 1 and 100',
    ]);
  });

  it('parses --mode and rejects invalid values', () => {
    expect(parseFindOptions(['诊断', '--mode', 'semantic'])).toEqual({
      query: '诊断',
      options: { mode: 'semantic' },
      errors: [],
    });
    expect(parseFindOptions(['x', '--mode', 'fuzzy']).errors).toEqual([
      '--mode must be one of: text, semantic, hybrid',
    ]);
  });
});

describe('searchSkillsAPI', () => {
  it('calls the backend search endpoint with query and text mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchSkillsAPI('react native');

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/v1/index/search');
    expect(url.searchParams.get('q')).toBe('react native');
    expect(url.searchParams.get('mode')).toBe('text');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('maps backend results to SearchSkill', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            skill_id: 'atomgit:vercel/agent-skills/deploy-to-vercel',
            name: 'deploy-to-vercel',
            description: 'Deploy to Vercel',
            source: 'atomgit',
            source_url: 'https://atomgit.com/vercel/agent-skills.git',
            download_count: 1234,
            risk_score: 85,
          },
          {
            skill_id: 'atomgit:other/repo/some-skill',
            name: 'some-skill',
            description: 'Another skill',
            source: 'atomgit',
            source_url: 'https://atomgit.com/other/repo.git',
            download_count: 10,
            risk_score: 15,
          },
        ],
        total: 2,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { skills } = await searchSkillsAPI('deploy');

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      name: 'deploy-to-vercel',
      slug: 'atomgit:vercel/agent-skills/deploy-to-vercel',
      source: 'atomgit',
      installs: 1234,
      description: 'Deploy to Vercel',
      riskScore: 85,
      sourceUrl: 'https://atomgit.com/vercel/agent-skills.git',
    });
    // Sorted by installs descending
    expect(skills[0]!.name).toBe('deploy-to-vercel');
  });

  it('filters results by owner extracted from source_url when owner is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            skill_id: 'atomgit:vercel/repo/skills/a',
            name: 'a',
            description: 'a',
            source: 'atomgit',
            source_url: 'https://atomgit.com/vercel/repo.git',
            download_count: 10,
            risk_score: 10,
          },
          {
            skill_id: 'atomgit:other/repo/skills/b',
            name: 'b',
            description: 'b',
            source: 'atomgit',
            source_url: 'https://atomgit.com/other/repo.git',
            download_count: 20,
            risk_score: 10,
          },
        ],
        total: 2,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { skills } = await searchSkillsAPI('x', { owner: 'vercel' });

    expect(skills).toHaveLength(1);
    expect(skills[0]!.sourceUrl).toBe('https://atomgit.com/vercel/repo.git');
  });

  it('returns an error on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSkillsAPI('react')).resolves.toMatchObject({
      skills: [],
      error: expect.stringContaining('500'),
    });
  });

  it('returns an error on fetch failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSkillsAPI('react')).resolves.toMatchObject({
      skills: [],
      error: expect.any(String),
    });
  });

  it('passes filters and sort to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchSkillsAPI('k8s', {
      category: 'network',
      tags: 'linux',
      platform: 'community',
      risk: 'low',
      sort: 'updated_at',
      limit: 20,
    });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('category')).toBe('network');
    expect(url.searchParams.get('tags')).toBe('linux');
    expect(url.searchParams.get('platform')).toBe('community');
    expect(url.searchParams.get('security_level')).toBe('low');
    expect(url.searchParams.get('sort_by')).toBe('updated_at');
    expect(url.searchParams.get('limit')).toBe('20');
  });

  it('keeps backend order when sort is specified', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { skill_id: 'a', name: 'a', download_count: 1, risk_score: 10 },
          { skill_id: 'b', name: 'b', download_count: 99, risk_score: 10 },
        ],
        total: 2,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { skills } = await searchSkillsAPI('x', { sort: 'relevance' });

    // 后端已按相关性排序，客户端不重排，保持返回顺序
    expect(skills.map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('passes semantic mode to the backend and defaults to text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchSkillsAPI('x', { mode: 'semantic' });
    let url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('mode')).toBe('semantic');

    await searchSkillsAPI('x');
    url = new URL(fetchMock.mock.calls[1]![0] as string);
    expect(url.searchParams.get('mode')).toBe('text');
  });
});
