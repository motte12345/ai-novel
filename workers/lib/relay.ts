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
  let body = `# 短編タイトル: 「${story.raw_title}」\n`;

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

  if (chapterNo === FINAL_STORY_CHAPTER) {
    body +=
      `\n\n**第${chapterNo}章は最終章**です。以下を厳守して結末をつけてください:\n` +
      `- **新しい登場人物・新しい場所・新しい設定を一切持ち込まない**\n` +
      `- **既出の象徴・伏線・小道具を1つ拾って閉じる**\n` +
      `- 同じ描写・同じ表現を**繰り返さない**（前章までの語彙を反復しない）\n` +
      `- **収束**を意識する。冗長な再説明や教訓化（「〜だと感じた」「〜が大切だと知った」）は不要\n` +
      `- 余韻を残す静かな終わり方が望ましい`;
  } else {
    body += `\n\n**第${chapterNo}章はまだ途中**です。物語を完結させず、次の作家にバトンを渡すつもりで書いてください。`;
  }

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

  // 編集者は出力フォーマットが厳格なので低温、作家は表現に余裕を持たせる
  const temperature = writer === 'editor' ? 0.6 : 0.9;
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
}

export interface GeneratedTitle {
  raw_title: string;
  word_a: string;
  word_b: string;
  pattern: string;
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
