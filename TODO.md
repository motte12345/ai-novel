# TODO.md — ai-novel

最終更新: 2026-05-23

## Phase 0: 仕様策定（完了）
- [x] プロジェクト名・ドメイン決定（`ai-novel` / `novel.simtool.dev`）
- [x] PLAN.md / SPEC.md / TODO.md / CLAUDE.md 初版
- [x] 作家3人の文体プロンプト初版
- [x] 編集者AIのプロンプト初版
- [x] 単語辞書 + NG ワード辞書

## Phase 1: PoC（完了、2026-05-19）
- [x] `scripts/run-relay.ts` 実装
- [x] 6章 + 編集者ターンの完走 + JSON 出力
- [x] 字数オーバー対策（max_tokens 調整、目標字数短縮、末尾トリム）
- [x] プロバイダ調整（writer_c と editor を Scout に振り替え）

## Phase 2: Workers Cron 自動化（完了、2026-05-19）
- [x] ai-roundtable から workers 骨格を流用
- [x] Cron `0 * * * *` (60分間隔)
- [x] UNIQUE + CAS のレース対策
- [x] 失敗3回連続で LINE 通知
- [x] cron 失敗時の自動リトライ
- [x] D1 マイグレーション 0001
- [x] API: `/api/current` `/api/story/:id` `/api/archive` `/api/recent`
- [x] リモートデプロイ

## Phase 3: 公開・SEO（完了、2026-05-21）
- [x] フロント実装（Vite + React 19）
  - [x] トップ: 進行中作品 + プログレス + カウントダウン
  - [x] 作品ページ: 縦に章を並べて表示
  - [x] archive ページ + タグフィルタ UI
- [x] 静的 OGP メタタグ + JSON-LD + GA4 埋め込み
- [x] robots.txt
- [x] sitemap.xml（動的、`/sitemap.xml` ハンドラ）
- [x] RSS フィード `/rss.xml` (動的、完結作品の最新20件)
- [x] 動的 OGP HTML（bot UA 判定で `/story/:id` を OGP 入り HTML 化）
- [x] OGP 画像生成（`scripts/generate-ogp.mjs`、紙色+金アクセント）
- [x] simtool-portal にリンク追加
- [x] `novel.simtool.dev` のサブドメイン割当
- [x] GitHub 公開（`motte12345/ai-novel`） + Cloudflare Workers Builds 連携で自動デプロイ

## プロンプト改善イテレーション（完了）
- [x] 1段階目: 台詞 + 複数人物 + 起承転結ステージ指示（2026-05-20）
- [x] 2段階目: 穏当化指示削除 + 葛藤・秘密の要求 + 禁止フレーズ + 各作家に価値観 + temperature 1.0（2026-05-21）

## タグ機能（完了、2026-05-21〜2026-05-23）
- [x] words.json に 6軸の語彙（genre/tone/aftertaste/plot_arc/theme/atmosphere）
- [x] migration 0002: stories に 6 カラム追加（NULL 許容）
- [x] タイトルと独立にランダム抽選、各章プロンプトに注入
- [x] StoryTags チップを CurrentPage / StoryPage / ArchivePage に表示
- [x] 複数指定（各軸 1 個必須、25% で 2 個目追加、カンマ区切り保存）
- [x] フィルタ API `/api/archive?genre=...&tone=...` + `/api/tags`（軸別カウント）
- [x] ArchivePage に軸ごとのフィルタチップ + リセットボタン

## 残作業（ユーザー側 or 別途）
- [ ] Google Search Console プロパティ登録 + sitemap 送信
- [ ] LINE 通知用 secret（LINE_CHANNEL_TOKEN / LINE_USER_ID）の登録（致命的エラー検知用）
- [ ] line-notify の collect.py に ai-novel を追加（日次レポート連携）
- [ ] AdSense 申請（トラフィック様子見後）

## 要観察
- [ ] cron 失敗が出ていないか（D1 meta テーブルの `fail_count:` を確認）
- [ ] ai-roundtable との合算 API 消費（Gemini RPD、Groq Scout RPD/TPM）
- [ ] 矛盾度の高いタグ組み合わせの挙動（「幻想 / コメディ」等で LLM が片方に寄せる傾向の頻度）
- [ ] 編集者の章タイトルに穏当語が混入する頻度（必要なら編集者プロンプトにも禁止フレーズ追加）

## 見送り（明示）
- ~~音声化（TTS）~~ — ai-roundtable で MeloTTS 断念済み、新サイトで再挑戦するメリットなし
- ~~投票・コメント機能~~ — 観客モード徹底
- ~~ジャンル分類（自動推定）~~ — タグ機能で代替済み
- ~~ハイライト機能~~ — 全文を読むサイト

## 将来候補（保留）
- タグの複数指定をさらに拡張（軸 0 個もOK にする等）
- タグ別ランキング・タグクラウド
- 編集者の章タイトルにも禁止フレーズを適用
