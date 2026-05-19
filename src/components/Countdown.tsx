import { useEffect, useState } from 'react';

interface Props {
  /** 最後の章が生成された unix 秒 */
  lastChapterAt: number | null;
  /** 章の間隔（秒）。本番は 3600 (60分) */
  intervalSec?: number;
}

/**
 * 次の章生成までのカウントダウン。
 * cron は毎時00分発火だが、最終章の created_at + interval を「目安」として表示する。
 */
export function Countdown({ lastChapterAt, intervalSec = 3600 }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!lastChapterAt) return null;

  const target = lastChapterAt + intervalSec;
  const remaining = target - now;

  if (remaining <= 0) {
    return <span className="countdown overdue">次章間もなく</span>;
  }

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="countdown">
      次章まで {m}:{String(s).padStart(2, '0')}
    </span>
  );
}
