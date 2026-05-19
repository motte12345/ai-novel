/**
 * ローカル PoC: タイトル生成 → 6章リレー → 編集者完結処理 を完走して JSON 出力。
 * Workers 本番ロジックを共有 (workers/lib/) しているので、ここで動けば Workers でも基本動く。
 *
 * 使い方:
 *   npm run relay                                  # 単語辞書からランダムにタイトル生成
 *   npm run relay -- --title "ランプと夕暮れ"      # タイトル指定
 *   npm run relay -- --word-a 灯台 --word-b 沈黙   # 単語ペア指定（パターンはランダム）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import {
  generateTitle,
  parseEditorOutput,
  runOneChapter,
  TOTAL_CHAPTERS,
  trimToLastSentence,
  WRITER_ROTATION,
  type EditorOutput,
  type GeneratedTitle,
  type PrevChapter,
  type WordsDict,
} from '../workers/lib/relay.js';
import type { ProviderEnv } from '../workers/lib/providers.js';
import type { Writer } from '../prompts/writers.js';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const env: ProviderEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
};

interface ChapterResult {
  chapter_no: number;
  writer: Writer;
  provider: string;
  model: string;
  content: string;
  created_at: number;
}

interface RunResult {
  story: GeneratedTitle & { id: number };
  started_at: number;
  completed_at: number;
  chapters: ChapterResult[];
  editor: EditorOutput | null;
  editor_raw: string | null;
}

function loadWords(): WordsDict {
  const raw = readFileSync(join(ROOT, 'prompts', 'words.json'), 'utf-8');
  return JSON.parse(raw) as WordsDict;
}

function resolveTitle(words: WordsDict, args: string[]): GeneratedTitle {
  const titleArg = args.indexOf('--title');
  if (titleArg >= 0) {
    const t = args[titleArg + 1];
    if (!t) throw new Error('--title 値が必要');
    return { raw_title: t, word_a: '', word_b: '', pattern: 'manual' };
  }
  const aIdx = args.indexOf('--word-a');
  const bIdx = args.indexOf('--word-b');
  if (aIdx >= 0 && bIdx >= 0) {
    const a = args[aIdx + 1];
    const b = args[bIdx + 1];
    if (!a || !b) throw new Error('--word-a と --word-b の値が必要');
    const pattern = words.title_patterns[Math.floor(Math.random() * words.title_patterns.length)];
    return {
      raw_title: pattern.replace('{a}', a).replace('{b}', b),
      word_a: a,
      word_b: b,
      pattern,
    };
  }
  return generateTitle(words);
}

async function main() {
  const args = process.argv.slice(2);
  const words = loadWords();
  const title = resolveTitle(words, args);

  console.log(`\n=========================================`);
  console.log(`Story: 「${title.raw_title}」`);
  console.log(`  word_a=${title.word_a} / word_b=${title.word_b} / pattern=${title.pattern}`);
  console.log(`=========================================`);

  const startedAt = Date.now();
  const chapters: ChapterResult[] = [];
  let editor: EditorOutput | null = null;
  let editorRaw: string | null = null;

  const story = { id: 0, raw_title: title.raw_title };

  for (let i = 1; i <= TOTAL_CHAPTERS; i++) {
    const writer = WRITER_ROTATION[i - 1];
    const label = writer === 'editor' ? `Editor` : `Chapter ${i}/${TOTAL_CHAPTERS - 1} [${writer}]`;
    console.log(`\n--- ${label} ---`);

    // PoC では章間に間を空けて Groq の TPM (6000 token/min) 制限を回避する。
    // 本番は cron 60分/章なのでこのディレイは不要
    if (i > 1) {
      await new Promise((r) => setTimeout(r, 15_000));
    }

    const prevForChapter: PrevChapter[] = chapters.map((c) => ({
      chapter_no: c.chapter_no,
      writer: c.writer,
      content: c.content,
    }));

    try {
      const r = await runOneChapter({
        story,
        chapterNo: i,
        prevChapters: prevForChapter,
        env,
      });
      console.log(`[${r.writer} via ${r.provider}/${r.model}]`);

      if (writer === 'editor') {
        console.log(r.content);
        console.log(`  (${r.content.length} chars)`);
        editorRaw = r.content;
        editor = parseEditorOutput(r.content);
        console.log(`\n  → parsed:`, editor);
      } else {
        const trimmed = trimToLastSentence(r.content);
        if (trimmed.length !== r.content.length) {
          console.log(`[trim] ${r.content.length} → ${trimmed.length} chars`);
        }
        console.log(trimmed);
        console.log(`  (${trimmed.length} chars, raw=${r.content.length})`);
        chapters.push({
          chapter_no: i,
          writer: r.writer,
          provider: r.provider,
          model: r.model,
          content: trimmed,
          created_at: Date.now(),
        });
      }
    } catch (err) {
      console.error(`Chapter ${i} failed:`, err);
      throw err;
    }
  }

  const result: RunResult = {
    story: { id: 0, ...title },
    started_at: startedAt,
    completed_at: Date.now(),
    chapters,
    editor,
    editor_raw: editorRaw,
  };

  const runsDir = join(ROOT, 'data', 'runs');
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = title.raw_title.replace(/[^一-龥ぁ-んァ-ンa-zA-Z0-9]/g, '_').slice(0, 20);
  const outPath = join(runsDir, `${ts}-${safeTitle}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\n=========================================`);
  console.log(`✓ Relay complete (${chapters.length} chapters + editor)`);
  console.log(`  Saved: ${outPath}`);
  console.log(`=========================================\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
