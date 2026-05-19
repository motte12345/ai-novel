# ai-novel

複数の AI にランダムな単語2つを渡し、リレー形式で短編小説を書かせる様子をライブで眺めるサイト。

- 1作品 = 6章（3作家 × 2周）+ 編集者AIによる完結処理（ペンネーム命名・章タイトル付け）
- 60分に1章ずつ進行（Cloudflare Workers Cron Trigger）
- 公開先: `novel.simtool.dev`
- 姉妹プロジェクト: [ai-roundtable](https://roundtable.simtool.dev/)

## スタック

- React 19 + Vite + TypeScript（フロント）
- Cloudflare Workers + D1（バックエンド）
- LLM プロバイダ: Google Gemini 2.5 Flash-Lite / Groq Llama 4 Scout / Llama 3.1 8B Instant（全て無料枠）

## Commands

```bash
npm run dev              # Vite dev (port 5174)、/api は localhost:8787 に proxy
npm run worker:dev       # wrangler dev (port 8787)、scheduled テスト可
npm run build            # tsc -b && vite build
npm run worker:deploy    # build → wrangler deploy

# ローカル PoC（cron を使わず1作品分を手動実行）
npm run relay

# D1 マイグレーション
npm run db:migrate:local
npm run db:migrate:remote
```

## ドキュメント

- `PLAN.md` — 目的・コンセプト・フェーズ
- `SPEC.md` — 仕様の壁打ちログと決定事項
- `TODO.md` — タスク管理
- `KNOWLEDGE.md` — ハマりポイント・調査結果

## 設計の要点

- 同一 Cloudflare アカウント・同一 API キーを ai-roundtable と共有運用（アカウント水増しは ToS リスクなのでしない）
- 文体は 3 作家で寄せる（読者には作家境目を意識させない）
- タイトルは単語辞書 A100語 × B100語 から自動合成、NG ワードでフィルタ
- 章間レース対策: UNIQUE(story_id, chapter_no) + CAS

詳細は SPEC.md と KNOWLEDGE.md を参照。
