# TODO.md — ai-novel

最終更新: 2026-05-18

## Phase 0: 仕様策定（完了）
- [x] プロジェクト名・ドメイン決定（`ai-novel` / `novel.simtool.dev`）
- [x] PLAN.md / SPEC.md / TODO.md / CLAUDE.md 初版
- [x] 作家3人の文体プロンプト初版を書く
- [x] 編集者AIのプロンプト初版を書く
- [x] 単語辞書（A100語 + B100語）初版を作る。NG ワード辞書も併設
- [ ] D1 スキーマ草案を SQL に落とす（`workers/migrations/0001_init.sql`） — Phase 2 で

## Phase 1: PoC（完了、2026-05-19）
- [x] `scripts/run-relay.ts` を作成（ai-roundtable の `run-discussion.ts` 流用）
- [x] 単語ペア1つ選んで、6章 + 編集者ターンを手動実行 → JSON 出力
- [x] 出力を目視レビュー: 一貫性・文体寄せ・編集者の質
- [x] 字数オーバー対策（max_tokens調整、目標字数短縮、末尾トリム）
- [x] プロバイダ調整（writer_c と editor を Scout に振り替え）
- [ ] 別単語ペアで安定性確認（Phase 2 着手前に2〜3作品追加して挙動を見る）

## Phase 2: Workers Cron 自動化（完了、2026-05-19）
- [x] ai-roundtable から workers 骨格をコピー（providers / db / chapter-runner / line-notify）
- [x] Cron `0 * * * *`（毎時 00 分発火）で `advanceOneChapter` を呼ぶ
- [x] UNIQUE+CAS のレース対策（章順は UNIQUE(story_id, chapter_no)）
- [x] 失敗3回連続で LINE 通知（既存 line-notify 流用）— ※ LINE secret は未登録、必要時に追加
- [x] cron 失敗時の自動リトライ（次の cron で同 chapter_no 再試行）
- [x] D1 マイグレーション適用、wrangler 設定
- [x] API エンドポイント: `/api/current` `/api/story/:id` `/api/archive` `/api/recent`
- [x] リモートデプロイ完了。`https://ai-novel.dryad-ggl.workers.dev`、Version `ba552611`

## Phase 3: 公開・SEO（主要部分完了、2026-05-19）
- [x] フロント実装（Vite + React 19、ai-roundtable から雛形コピー）
  - [x] トップ: 進行中作品 + プログレス + カウントダウン
  - [x] 作品ページ: 縦に章を並べて表示
  - [x] archive ページ
- [x] 静的 OGP メタタグ + JSON-LD + GA4 埋め込み
- [x] robots.txt
- [x] Workers + フロント統合デプロイ (`https://ai-novel.dryad-ggl.workers.dev`)

### Phase 3 残作業
- [ ] **`novel.simtool.dev` のサブドメイン割当**（Cloudflare ダッシュボードで Workers Routes 設定。ユーザー作業）
- [ ] OGP 画像生成（共通方式 `scripts/generate-ogp.mjs`、ogp.png 配置）
- [ ] 動的 OGP メタタグ（`/story/:id` のシェア時に作品タイトルを反映、bot UA 判定で HTML を返す方式 ai-roundtable と同じ）
- [ ] sitemap.xml（動的、`/sitemap.xml` ハンドラを Worker に追加）
- [ ] RSS フィード `/rss.xml`（動的、完結作品のフィード）
- [ ] simtool-portal にリンク追加
- [ ] line-notify の collect.py に追加（ai-roundtable と同じスタイル）
- [ ] LINE 通知用 secret（LINE_CHANNEL_TOKEN / LINE_USER_ID）の登録（致命的エラー検知用）
- [ ] AdSense 申請（トラフィック様子見後）

## 直近の観察ポイント（運用後数日）
- [ ] 初日に最初の作品が走り切るか（7時間後、6章 + editor の完結フロー）
- [ ] editor 出力のパース成功率（`updateEditorOutput` がきちんと反映されているか）
- [ ] ai-roundtable との合算 API 消費（Gemini RPD、Groq Scout RPD/TPM）
- [ ] cron 失敗が出ていないか（D1 meta テーブルの `fail_count:` を確認）

## 要観察
- [ ] ai-roundtable と同居運用時の無料枠消費（Phase 2 公開直後、最低1週間）
- [ ] 作家3人の文体寄せが効いているか（連続性が崩れず読めるか）

## 見送り（明示）
- ~~音声化（TTS）~~ — ai-roundtable で MeloTTS 断念済み、新サイトで再挑戦するメリットなし
- ~~投票・コメント機能~~ — 観客モード徹底
- ~~ジャンル分類~~ — 編集者が個別タイトル付けるので分類軸不要
- ~~ハイライト機能~~ — 全文を読むサイト
