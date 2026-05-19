# PLAN.md — ai-novel

## 目的
複数の AI（異なるプロバイダ・モデル）に**作家**として連続で短編をリレー執筆させ、その様子を観客が眺めるサイト。
コンテンツ系（simtool.dev のツール集合とは別系統）。ai-roundtable の姉妹プロジェクト。

## コアコンセプト
- **AI作家 × ランダム単語タイトル × リレー短編** をひたすら垂れ流す
- ユーザーは「観客」。介入はしない
- 1章ごとに約60分かけて進む。「常に何か書かれている」ライブ感重視
- 1作品6章 + 編集者AIによる完結処理 = 7ターンで自動完結 → 次のタイトルへ

## ai-roundtable との関係
- システム基盤（Workers / D1 / Cron / providers 抽象）は流用
- ジャンルが「議論」→「物語」に変わるだけで、進行構造はほぼ同型
- 同一 Cloudflare アカウント・同一 API キーを共有して同居運用（無料枠を圧迫しないよう更新頻度を抑える）

## 制約
- **無料運用**: 従量課金 API は使わない。ai-roundtable と同じプロバイダを共有するため、合算負荷を試算してモデルを割り当てる
- **規約遵守**: AdSense / Cloudflare / 各 LLM プロバイダのコンテンツポリシー違反は扱わない（性的描写・過剰な暴力・実在人物の名誉毀損等）
- **単語辞書も規約セーフに**: タイトル生成の元になる単語は事前に NG ワード辞書で安全化する
- **ブラウザ自動化禁止**: WebUI を Selenium 等で叩く実装はしない（TOS違反）

## 技術選定（ai-roundtable と完全に同じ）
- **フロント**: React 19 + Vite + TypeScript
- **デプロイ**: Cloudflare Pages（GitHub 連携で main push 時に自動デプロイ）
- **バックエンド**: Cloudflare Workers + D1（無料枠）
- **リレー駆動**: Cloudflare Workers Cron Triggers（60分間隔）
- **LLM プロバイダ**: Gemini Flash / Flash-Lite / Groq Llama 3.3 70B・Llama 4 Scout・Llama 3.1 8B Instant（ai-roundtable と同じキーを共有）
- **収益化**: AdSense（Phase 3 以降、トラフィック様子見）

## フェーズ
- **Phase 0**: 仕様策定（本フェーズ）
- **Phase 1**: PoC — 単語ペア → 1作品分の章生成 → JSON 出力 → 静的フロントで表示
- **Phase 2**: Cloudflare Workers Cron で自動化、D1 に蓄積、フロントから API 経由で読む
- **Phase 3**: SEO・OGP・RSS・archive ページ・AdSense 申請

## 公開先
- `novel.simtool.dev`（既存ドメインのサブドメイン運用）

## 今後の議論ポイント（SPEC で詰める）
- 単語辞書の調達方針（手動定義 vs 既存リスト流用）と NG ワードフィルタ
- 作家3人の文体プロンプト（匿名・寄せる方向で、それぞれの「揺らぎ幅」）
- 編集者AIの仕事スコープ（章タイトル・総タイトル仕上げ・ペンネーム生成・あらすじ要約）
- 章間で渡す「これまでのあらすじ」設計（Cerebras 8192 token 制限対策）
- D1 スキーマ（`stories` / `chapters` / `meta`）
- プロバイダ割当（ai-roundtable と衝突しない構成）
- フロント UI（縦書き / 章送り / リアルタイム更新の見せ方）
