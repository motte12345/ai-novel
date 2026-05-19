import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Story } from '../types';

export function Sidebar() {
  const [stories, setStories] = useState<Story[] | null>(null);

  useEffect(() => {
    api
      .recent(12)
      .then((r) => setStories(r.stories))
      .catch(() => setStories([]));
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-title">最近の作品</div>
      {stories === null && <div className="sidebar-loading">読込中...</div>}
      {stories?.length === 0 && <div className="sidebar-empty">まだ作品がありません</div>}
      {stories?.map((s) => {
        const isLive = s.status === 'active';
        return (
          <Link
            key={s.id}
            to={isLive ? '/' : `/story/${s.id}`}
            className={`sidebar-item ${isLive ? 'live' : ''}`}
          >
            <div className="sidebar-row">
              <span className={`sidebar-dot ${isLive ? 'live' : ''}`} />
              <span className="sidebar-title-text">
                {s.final_title ?? s.raw_title}
              </span>
            </div>
            {s.pen_name && <div className="sidebar-pen">{s.pen_name}</div>}
          </Link>
        );
      })}
    </aside>
  );
}
