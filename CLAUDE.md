# CLAUDE.md — ai-novel

This file provides guidance to Claude Code when working in this project.

## What this is

複数の AI（異なるプロバイダ・モデル）に**作家**として人格を与え、ランダム単語タイトルから短編をリレー執筆させる様子を観客が眺めるサイト。
**ai-roundtable の姉妹プロジェクト**。コンテンツ系で、simtool.dev のツール集合とは別系統。

詳細は PLAN.md / SPEC.md を参照。

## ai-roundtable との関係

- **基盤は完全に流用**: Workers / D1 / Cron / providers 抽象 / line-notify / フロント雛形
- **同一 Cloudflare アカウント・同一 API キーを共有**して同居運用。アカウントの水増しはしない
- 進行間隔を 60分/章まで落として、無料枠の合算消費を ai-roundtable の 1.5 倍程度に抑える
- 機能としては、議論サイト特有のものを大胆に削る（Host提案ループ・主題語チェック・投票・TTS・ハイライト・ジャンル推定）

## Stack（暫定）

- React 19 + Vite + TypeScript
- Cloudflare Pages（フロント）
- Cloudflare Workers + D1（バックエンド）
- Cloudflare Workers Cron Triggers（章駆動、`0 * * * *`）
- LLM プロバイダ: Gemini Flash-Lite / Groq Llama 4 Scout / Llama 3.1 8B Instant（ai-roundtable と共有）

## Conventions

### 絶対原則
- **従量課金 API は使わない**（無料枠のみ）
- **アカウント分離による無料枠水増しはしない**（各プロバイダの ToS 違反リスク。ai-roundtable のアカウントを巻き添えに失う可能性）
- **規約遵守**: AdSense・各 LLM プロバイダ・Cloudflare のコンテンツポリシーを守る。性的・暴力的・差別的描写を扱わない
- **ブラウザ自動化禁止**

### 物語のジャンル / 単語辞書
SPEC.md「10. 規約セーフな単語辞書設計」セクションに沿う。NG カテゴリは絶対不採用。

### コード構成
- `src/` フロント
- `workers/` Cloudflare Workers バックエンド
- `prompts/` 作家・編集者の system prompt（バージョン管理対象）
- `prompts/words.json` 単語辞書 A/B + NG リスト
- `scripts/` ローカル PoC 用スクリプト

### State 永続化
- 物語ログは D1 に保存（`stories` / `chapters` / `meta`）
- フロントは API 経由で取得、ブラウザ側に永続化する状態は最小限

### 一貫性管理
- 章間で「これまでのあらすじ」を圧縮して渡す（Cerebras 8192 token 制限対策）
- 登場人物・場面・小道具の同一性を厳守させるプロンプト設計

## Commands（後で確定）

```bash
npm run dev          # Vite dev
npm run build        # Vite build
npm run lint         # ESLint
npm run worker:dev   # wrangler dev
npm run worker:deploy
npm run relay        # ローカル PoC 実行
```

## ドキュメント運用

ルート `~/.claude/CLAUDE.md` のルールに従う。
- **TODO.md**: タスク着手・完了のたびに即更新
- **SPEC.md**: 仕様議論ごとに追記、決定事項を「決定事項ログ」に明記
- **PLAN.md**: フェーズ進行・方針変更で更新
- **KNOWLEDGE.md**: ハマったら即追記。特に ai-roundtable と共有しているリソースの競合（API レート・D1 容量・Workers req）に関するものは優先記録
