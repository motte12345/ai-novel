/**
 * 1章実行の純粋ロジック。
 * scripts (PoC) と workers (本番) の両方から参照される。
 */
import { SYSTEM_PROMPTS, WRITER_LABEL, type Writer } from '../../prompts/writers.js';
import {
  completeWithFallback,
  getProviderAssignment,
  type Message,
  type ProviderEnv,
} from './providers.js';

// 1作品 = 作家3人 × 2周 + 編集者1ターン = 7ターン
export const WRITER_ROTATION: Writer[] = [
  'writer_a', // 1
  'writer_b', // 2
  'writer_c', // 3
  'writer_a', // 4
  'writer_b', // 5
  'writer_c', // 6: 結末をつける
  'editor',   // 7: 完結処理
];

export const TOTAL_CHAPTERS = WRITER_ROTATION.length;
export const STORY_CHAPTERS = 6; // 作家ターン分のみ
export const FINAL_STORY_CHAPTER = STORY_CHAPTERS;

export interface PrevChapter {
  chapter_no: number;
  writer: Writer;
  content: string;
}

export interface StoryLite {
  id: number;
  raw_title: string; // 「ランプと夕暮れ」のような単語ペア合成タイトル
  // タグ（タイトルと独立に抽選される。null の場合はプロンプトに含めない）
  genre?: string | null;
  tone?: string | null;
  aftertaste?: string | null;
  plot_arc?: string | null;
  theme?: string | null;
  atmosphere?: string | null;
}

/** カンマ区切り文字列を ` / ` 区切りに整える（プロンプト/UI 表示用） */
function formatTagValue(raw: string): string {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .join(' / ');
}

/** タグセクションを user メッセージに埋め込むための文字列を組み立て */
function buildTagSection(story: StoryLite): string {
  const lines: string[] = [];
  if (story.genre) lines.push(`- ジャンル: **${formatTagValue(story.genre)}**`);
  if (story.tone) lines.push(`- トーン: **${formatTagValue(story.tone)}**`);
  if (story.aftertaste) lines.push(`- 読後感: **${formatTagValue(story.aftertaste)}**`);
  if (story.plot_arc) lines.push(`- 展開: **${formatTagValue(story.plot_arc)}**`);
  if (story.theme) lines.push(`- 主題: **${formatTagValue(story.theme)}**`);
  if (story.atmosphere) lines.push(`- 雰囲気: **${formatTagValue(story.atmosphere)}**`);
  if (lines.length === 0) return '';
  return (
    `\n## この作品の指定（タイトルとは独立に抽選されている。整合に苦労してでもこれら全てを尊重すること）\n` +
    lines.join('\n') +
    `\n\n複数の値が \` / \` で区切られている軸は、**それらの共存** を物語で実現する` +
    `（「明るい / 静か」なら明るさと静けさが同居する、「愛 / 復讐」なら愛と復讐が絡む）。\n` +
    `組み合わせが意外なものでも、作家は **そのズレを物語の力に変える**。安易に丸めず、不協和こそ個性として表現する。\n`
  );
}

/**
 * 履歴を user メッセージ1本に統合。
 * - 全章を読ませる前提（300〜400字 × 6章 ≒ 2400字、Cerebras 8192 token に収まる）
 * - 作家には「これは前章までの本文。続きを書け」と明示する
 */
function buildHistory(
  prevChapters: PrevChapter[],
  story: StoryLite,
  writer: Writer,
  chapterNo: number,
): Message[] {
  const tagSection = buildTagSection(story);
  let body = `# 短編タイトル: 「${story.raw_title}」\n${tagSection}`;

  if (writer === 'editor') {
    body += `\n全${STORY_CHAPTERS}章のリレー執筆が完了しました。以下が本文です。\n\n`;
    body += `---\n\n`;
    for (const ch of prevChapters) {
      body += `## 第${ch.chapter_no}章\n${ch.content}\n\n`;
    }
    body += `---\n\n`;
    body += `上記を読んで、システムプロンプトに指定された形式で **ペンネーム / 作品タイトル / 章タイトル6個** を出力してください。`;
    return [{ role: 'user', content: body }];
  }

  body += `これは複数の作家がリレー形式で書く短編です。全${STORY_CHAPTERS}章で完結します。\n`;
  body += `**あなたの担当: 第${chapterNo}章 / 全${STORY_CHAPTERS}章**\n\n`;

  if (prevChapters.length > 0) {
    body += `## これまでの章\n\n`;
    for (const ch of prevChapters) {
      body += `### 第${ch.chapter_no}章\n${ch.content}\n\n`;
    }
    body += `---\n\n`;
    body += `上記の流れを受けて、**第${chapterNo}章** を書いてください。`;
  } else {
    body += `これが第1章です。タイトル「${story.raw_title}」から想像を膨らませ、物語を始めてください。`;
  }

  // 全6章を起承転結に割り当てたステージ指示
  body += `\n\n${stageHintForChapter(chapterNo)}`;

  body +=
    `\n\n### 出力ルール（厳守、破ったら不採用）\n` +
    `- 本文のみ出力（章タイトル・章番号・前置き・後書き・記号装飾は禁止）\n` +
    `- **200〜300字を絶対厳守**。1字でも350字を超えたら不採用とみなす\n` +
    `- 短くてよい。冗長な説明・情景の重ね描き・同じ意味の言い換えで字数を稼がない\n` +
    `- 「${WRITER_LABEL[writer]}より」のような署名は禁止\n` +
    `- 段落は2個、空行で区切る\n` +
    `- 直前章までの単語・フレーズの**丸ごとコピーは禁止**（同じ意味なら言い換える）`;

  return [{ role: 'user', content: body }];
}

/**
 * 全6章を起承転結に割り当てたステージ指示。
 * - 1章: 起 — 場面 + 緊張の種を蒔く
 * - 2-3章: 承 — 人物追加・関係の深化・秘密の片鱗
 * - 4-5章: 転 — 決定的な出来事
 * - 6章: 結 — 答えを出しすぎず、余韻のある一行で
 */
function stageHintForChapter(chapterNo: number): string {
  if (chapterNo === 1) {
    return (
      `**第1章: 物語の始まり（起）— 緊張の種を蒔く**\n` +
      `- 主要な人物を1人（必要なら2人）導入し、場面・時代・季節を分からせる\n` +
      `- **「何かが普通でない」「何か抱えている」**気配を1つ置く（違和感・期待・後悔・隠し事の影など）\n` +
      `- タイトルの単語2つを、**意味の核**として序盤から提示する\n` +
      `- 結末は提示しない。読者が「この先何が起きるか」と前のめりになる入りに`
    );
  }
  if (chapterNo === 2 || chapterNo === 3) {
    return (
      `**第${chapterNo}章: 展開（承）— 関係と秘密の深化**\n` +
      `- 第1章で蒔いた**緊張の種**を育てる（人物の抱えるものをもう一段、見せる）\n` +
      `- 新しい人物が登場してもよい。登場するなら、**ただの脇役にしない**（その人物にも事情を持たせる）\n` +
      `- 台詞・対話で**人物の関係性に陰影**を作る。表面的な「優しいやりとり」だけで終わらせない\n` +
      `- 何も起きない章は失敗。**小さな決断・小さな波紋**を必ず入れる`
    );
  }
  if (chapterNo === 4 || chapterNo === 5) {
    return (
      `**第${chapterNo}章: 転換（転）— 決定的な出来事**\n` +
      `- ここまでの均衡を**確かに崩す**。読者の予想を1回は裏切る\n` +
      `- 以下のいずれかを必ず1つ入れる:\n` +
      `  - **告白・打ち明け**（隠していたことが言葉になる）\n` +
      `  - **決断・行動**（人物が何かを決め、動く）\n` +
      `  - **発見**（手紙、忘れ物、失くしていたもの、知らなかった事実）\n` +
      `  - **喪失・別離**（誰かが去る、何かが終わる）\n` +
      `  - **再会・出会い直し**（前と違う関係で再び向き合う）\n` +
      `- 派手な事件である必要はないが、**「何も起きない章」は禁止**`
    );
  }
  // chapterNo === 6 (FINAL_STORY_CHAPTER)
  return (
    `**第6章: 結末（結）— 最終章**\n` +
    `- 以下を厳守:\n` +
    `  - **新しい登場人物・新しい場所・新しい設定を一切持ち込まない**\n` +
    `  - **既出の象徴・伏線・小道具を1つ拾って閉じる**\n` +
    `  - 同じ描写・同じ表現を繰り返さない（前章までの語彙を反復しない）\n` +
    `  - 教訓化（「〜が大切だと感じた」「〜と知った」）禁止\n` +
    `  - 「穏やかな時間を共有する」「優しく微笑む」のような**当たり障りない決着は禁止**\n` +
    `  - 全てを説明しきらず、読者の心に**残る一行**で締める\n` +
    `  - 救いでも喪失でも、**何らかの感情を読者に持ち帰らせる**`
  );
}

export interface RunChapterInput {
  story: StoryLite;
  chapterNo: number; // 1..7
  prevChapters: PrevChapter[];
  env: ProviderEnv;
}

export interface RunChapterOutput {
  writer: Writer;
  provider: string;
  model: string;
  content: string;
}

/**
 * 1章分を生成する純粋関数。
 * 永続化・I/O は呼び出し側の責任。
 */
export async function runOneChapter(input: RunChapterInput): Promise<RunChapterOutput> {
  const { story, chapterNo, prevChapters, env } = input;
  const writer = WRITER_ROTATION[chapterNo - 1];
  if (!writer) throw new Error(`Invalid chapterNo: ${chapterNo}`);

  const systemPrompt = SYSTEM_PROMPTS[writer];
  const { primary, fallback } = getProviderAssignment(writer, env);
  const history = buildHistory(prevChapters, story, writer, chapterNo);

  // 編集者は出力フォーマットが厳格なので低温、作家は表現の振れ幅を広げて穏当化を避ける
  // ai-roundtable で 0.95 にして無難化が抜けた実績あり、ai-novel も 1.0 まで上げる
  const temperature = writer === 'editor' ? 0.6 : 1.0;
  // Llama 系の tokenizer は日本語の頻出語を 1 token 化するので、token 制限が字数に直結しない。
  // PoC 観察: max_tokens=400 で実出力 411〜609字。
  // 目標 200〜300字に対し、max_tokens=300 で実出力 ~350字以内に収まる想定。
  // 超過分は呼び出し側 (trimToLastSentence) で末尾句点トリムする。
  const maxTokens = writer === 'editor' ? 500 : 300;

  const res = await completeWithFallback(
    { systemPrompt, history, maxTokens, temperature },
    { primary, fallback },
  );

  return {
    writer,
    provider: res.provider,
    model: res.model,
    content: res.text,
  };
}

// =====================================================
// 本文の末尾トリム
// =====================================================

/**
 * 章本文の末尾を最後の完結した文（句点 or 終止符）で切る。
 * max_tokens で途中切れになった場合、不完全な文末を捨てて自然な余韻を残す。
 * 目標字数を超えた長文も、超過分を句点単位で短くするのに使える。
 *
 * - 指定の上限字数を超えていない場合は、不完全な末尾文だけ捨てる
 * - 上限を超えている場合は、上限以下になる最後の句点で切る
 * - 句点が1つも無い場合（極端な短文 or 異常出力）は原文をそのまま返す
 */
export function trimToLastSentence(text: string, maxChars = 350): string {
  const sentenceEnders = ['。', '！', '？', '」', '）'];
  const trimmed = text.trimEnd();

  // 末尾がすでに完結している（句点で終わっている）かつ字数制限内ならそのまま
  const endsCompletely = sentenceEnders.some((e) => trimmed.endsWith(e));
  if (endsCompletely && trimmed.length <= maxChars) {
    return trimmed;
  }

  // 字数オーバーの場合: maxChars 以下になる最後の句点を探す
  // そうでない場合: 全文中の最後の句点を探す（末尾の不完全文を捨てる用）
  const searchEnd = trimmed.length > maxChars ? maxChars : trimmed.length;
  let cut = -1;
  for (let i = searchEnd - 1; i >= 0; i--) {
    if (sentenceEnders.includes(trimmed[i])) {
      cut = i + 1;
      break;
    }
  }
  if (cut > 0) {
    return trimmed.slice(0, cut).trimEnd();
  }
  // 句点が見つからない（異常系）はそのまま返す
  return trimmed;
}

// =====================================================
// 編集者出力のパース
// =====================================================

export interface EditorOutput {
  pen_name: string;
  final_title: string;
  chapter_titles: string[];
}

/**
 * 編集者の出力テキストを構造化データに変換する。
 * 編集者プロンプトの【ペンネーム】【作品タイトル】【章タイトル】3ブロックを抽出。
 */
export function parseEditorOutput(text: string): EditorOutput {
  const penNameMatch = text.match(/【ペンネーム】\s*\n?\s*(.+?)(?=\n\s*【|\n\n|$)/s);
  const titleMatch = text.match(/【作品タイトル】\s*\n?\s*(.+?)(?=\n\s*【|\n\n|$)/s);
  const chapterBlockMatch = text.match(/【章タイトル】\s*\n([\s\S]+)$/);

  const pen_name = penNameMatch ? penNameMatch[1].trim() : '';
  const final_title = titleMatch ? titleMatch[1].trim() : '';

  const chapter_titles: string[] = [];
  if (chapterBlockMatch) {
    const lines = chapterBlockMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*[1-9]\d*[.．、:：]\s*(.+?)\s*$/);
      if (m) chapter_titles.push(m[1].trim());
      if (chapter_titles.length >= STORY_CHAPTERS) break;
    }
  }

  return { pen_name, final_title, chapter_titles };
}

// =====================================================
// タイトル生成（単語2つランダム合成）
// =====================================================

export interface WordsDict {
  noun_a: string[];
  noun_b: string[];
  title_patterns: string[];
  ng_words: string[];
  genre: string[];
  tone: string[];
  aftertaste: string[];
  plot_arc: string[];
  theme: string[];
  atmosphere: string[];
}

export interface GeneratedTitle {
  raw_title: string;
  word_a: string;
  word_b: string;
  pattern: string;
}

export interface StoryTags {
  genre: string;
  tone: string;
  aftertaste: string;
  plot_arc: string;
  theme: string;
  atmosphere: string;
}

/**
 * タイトルと独立に、ジャンル + 方向性5軸をランダム抽選する。
 * 「SF × 牧歌的 × 復讐」のような意図的なズレが予想外の物語を生む狙い。
 *
 * 各軸 1 個必須、`secondProb` の確率で 2 個目を追加（重複しない別の値）。
 * 結果はカンマ区切り文字列で返す（DB に TEXT として保存しやすいため）。
 */
export function generateStoryTags(
  words: WordsDict,
  rng: () => number = Math.random,
  secondProb = 0.25,
): StoryTags {
  const pick = (arr: string[]): string => {
    const first = arr[Math.floor(rng() * arr.length)];
    if (rng() < secondProb && arr.length > 1) {
      // 2 個目: 1 個目と被らないものから選ぶ
      let second: string;
      do {
        second = arr[Math.floor(rng() * arr.length)];
      } while (second === first);
      return `${first},${second}`;
    }
    return first;
  };
  return {
    genre: pick(words.genre),
    tone: pick(words.tone),
    aftertaste: pick(words.aftertaste),
    plot_arc: pick(words.plot_arc),
    theme: pick(words.theme),
    atmosphere: pick(words.atmosphere),
  };
}

/**
 * 単語辞書からランダムに2語を引いて短編タイトルを合成する。
 * NG ワードを含む合成は何度か引き直す。
 */
export function generateTitle(
  words: WordsDict,
  rng: () => number = Math.random,
  maxAttempts = 10,
): GeneratedTitle {
  for (let i = 0; i < maxAttempts; i++) {
    const word_a = words.noun_a[Math.floor(rng() * words.noun_a.length)];
    const word_b = words.noun_b[Math.floor(rng() * words.noun_b.length)];
    const pattern = words.title_patterns[Math.floor(rng() * words.title_patterns.length)];
    const raw_title = pattern.replace('{a}', word_a).replace('{b}', word_b);

    const containsNg = words.ng_words.some((ng) => raw_title.includes(ng));
    if (!containsNg) {
      return { raw_title, word_a, word_b, pattern };
    }
  }
  throw new Error(`generateTitle: NG ワードに当たり続けた (${maxAttempts} attempts)`);
}
