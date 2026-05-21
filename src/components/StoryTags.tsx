import type { Story } from '../types';

interface Props {
  story: Story;
  /** archive 行用の compact レイアウト */
  compact?: boolean;
}

interface Tag {
  label: string;
  value: string;
}

function collectTags(story: Story): Tag[] {
  const tags: Tag[] = [];
  if (story.genre) tags.push({ label: 'ジャンル', value: story.genre });
  if (story.tone) tags.push({ label: 'トーン', value: story.tone });
  if (story.aftertaste) tags.push({ label: '読後感', value: story.aftertaste });
  if (story.plot_arc) tags.push({ label: '展開', value: story.plot_arc });
  if (story.theme) tags.push({ label: '主題', value: story.theme });
  if (story.atmosphere) tags.push({ label: '雰囲気', value: story.atmosphere });
  return tags;
}

export function StoryTags({ story, compact = false }: Props) {
  const tags = collectTags(story);
  if (tags.length === 0) return null;

  return (
    <div className={`story-tags ${compact ? 'compact' : ''}`}>
      {tags.map((t) => (
        <span key={t.label} className="tag-chip" title={t.label}>
          {compact ? '' : <span className="tag-label">{t.label}</span>}
          <span className="tag-value">{t.value}</span>
        </span>
      ))}
    </div>
  );
}
