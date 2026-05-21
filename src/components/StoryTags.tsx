import type { Story } from '../types';

interface Props {
  story: Story;
  /** archive 行用の compact レイアウト */
  compact?: boolean;
}

interface Tag {
  label: string;
  /** カンマ区切りの生値を配列化 */
  values: string[];
}

/** DB の TEXT カラムはカンマ区切り。空文字や null を除いて配列化する */
export function splitTagValues(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function collectTags(story: Story): Tag[] {
  const tags: Tag[] = [];
  const push = (label: string, raw: string | null) => {
    const values = splitTagValues(raw);
    if (values.length > 0) tags.push({ label, values });
  };
  push('ジャンル', story.genre);
  push('トーン', story.tone);
  push('読後感', story.aftertaste);
  push('展開', story.plot_arc);
  push('主題', story.theme);
  push('雰囲気', story.atmosphere);
  return tags;
}

export function StoryTags({ story, compact = false }: Props) {
  const tags = collectTags(story);
  if (tags.length === 0) return null;

  return (
    <div className={`story-tags ${compact ? 'compact' : ''}`}>
      {tags.flatMap((t) =>
        t.values.map((v) => (
          <span key={`${t.label}:${v}`} className="tag-chip" title={t.label}>
            {compact ? '' : <span className="tag-label">{t.label}</span>}
            <span className="tag-value">{v}</span>
          </span>
        )),
      )}
    </div>
  );
}
