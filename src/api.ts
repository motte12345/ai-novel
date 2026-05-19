import type { Chapter, Story } from './types';

interface CurrentResp {
  story: Story | null;
  chapters: Chapter[];
}

interface RecentResp {
  stories: Story[];
}

interface StoryResp {
  story: Story;
  chapters: Chapter[];
}

interface ArchiveResp {
  stories: Story[];
  next_cursor: number | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export const api = {
  current: () => fetchJson<CurrentResp>('/api/current'),
  recent: (limit = 10) => fetchJson<RecentResp>(`/api/recent?limit=${limit}`),
  story: (id: number) => fetchJson<StoryResp>(`/api/story/${id}`),
  archive: (opts: { cursor?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.cursor !== undefined) params.set('cursor', String(opts.cursor));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return fetchJson<ArchiveResp>(`/api/archive${qs ? '?' + qs : ''}`);
  },
};
