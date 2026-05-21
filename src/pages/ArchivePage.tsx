import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type TagFilter } from '../api';
import { StoryTags } from '../components/StoryTags';
import type { Story } from '../types';

const PAGE_SIZE = 30;

const AXIS_LABELS: Array<{ key: keyof TagFilter; label: string }> = [
  { key: 'genre', label: 'ジャンル' },
  { key: 'tone', label: 'トーン' },
  { key: 'aftertaste', label: '読後感' },
  { key: 'plot_arc', label: '展開' },
  { key: 'theme', label: '主題' },
  { key: 'atmosphere', label: '雰囲気' },
];

type TagCounts = Record<string, Array<{ value: string; count: number }>>;

export function ArchivePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TagFilter>({});
  const [tagCounts, setTagCounts] = useState<TagCounts | null>(null);

  // 初回 + フィルタ変更で再ロード
  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .archive({ limit: PAGE_SIZE, filter })
      .then((r) => {
        setStories(r.stories);
        setCursor(r.next_cursor);
        setHasMore(r.next_cursor !== null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [filter]);

  // タグ集計を一度だけ取得
  useEffect(() => {
    api
      .tags()
      .then((r) => setTagCounts(r.counts))
      .catch(() => setTagCounts({}));
  }, []);

  const activeFilterCount = useMemo(
    () => Object.values(filter).filter(Boolean).length,
    [filter],
  );

  const setAxis = (key: keyof TagFilter, value: string) => {
    setFilter((prev) => {
      const next = { ...prev };
      if (!value || prev[key] === value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const resetFilter = () => setFilter({});

  const loadMore = async () => {
    if (cursor === null) return;
    setLoading(true);
    try {
      const r = await api.archive({ cursor, limit: PAGE_SIZE, filter });
      setStories((prev) => [...prev, ...r.stories]);
      setCursor(r.next_cursor);
      setHasMore(r.next_cursor !== null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="archive-head">
        <h2>過去の作品</h2>
        <p className="archive-sub">完結した短編の一覧 — 軸を選んで絞り込めます</p>
      </header>

      <div className="filter-panel">
        {AXIS_LABELS.map(({ key, label }) => {
          const options = tagCounts?.[key] ?? [];
          const selected = filter[key];
          if (options.length === 0) return null;
          return (
            <div key={key} className="filter-row">
              <span className="filter-axis-label">{label}</span>
              <div className="filter-options">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`filter-chip ${selected === opt.value ? 'active' : ''}`}
                    onClick={() => setAxis(key, opt.value)}
                    type="button"
                  >
                    {opt.value}
                    <span className="filter-count">{opt.count}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {activeFilterCount > 0 && (
          <button className="filter-reset" onClick={resetFilter} type="button">
            フィルタをリセット ({activeFilterCount})
          </button>
        )}
      </div>

      {error && <p className="error">エラー: {error}</p>}
      {!error && stories.length === 0 && !loading && (
        <p className="empty">該当する作品はありません</p>
      )}

      <ul className="archive-list">
        {stories.map((s) => (
          <li key={s.id} className="archive-item">
            <Link to={`/story/${s.id}`} className="archive-link">
              <span className="archive-no">No.{String(s.id).padStart(4, '0')}</span>
              <span className="archive-title">
                {s.final_title ?? s.raw_title}
                <StoryTags story={s} compact />
              </span>
              {s.pen_name && <span className="archive-pen">{s.pen_name}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button className="load-more" onClick={loadMore} disabled={loading}>
          {loading ? '読込中...' : 'さらに読み込む'}
        </button>
      )}
    </>
  );
}
