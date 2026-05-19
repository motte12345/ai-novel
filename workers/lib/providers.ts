/**
 * LLM プロバイダクライアント。
 * scripts と workers の両方から参照される（Workers ランタイム互換、fetch API のみ使用）。
 *
 * ai-roundtable から流用。`getProviderAssignment` の役割割当だけ ai-novel 用に変更。
 * 同じ Cloudflare アカウント・同じ API キーを ai-roundtable と共有する前提。
 */
import type { Writer } from '../../prompts/writers.js';

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface CompletionRequest {
  systemPrompt: string;
  history: Message[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResponse {
  text: string;
  provider: string;
  model: string;
}

export interface Provider {
  name: string;
  model: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
    public retryable: boolean = false,
  ) {
    super(`[${provider}] ${message}`);
  }
}

// =====================================================
// OpenAI 互換クライアント (Groq, Cerebras 等)
// =====================================================

interface OpenAIConfig {
  name: string;
  model: string;
  endpoint: string;
  apiKey: string;
}

function createOpenAICompatibleProvider(config: OpenAIConfig): Provider {
  return {
    name: config.name,
    model: config.model,
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const messages = [
        { role: 'system', content: req.systemPrompt },
        ...req.history,
      ];

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: req.maxTokens ?? 600,
          temperature: req.temperature ?? 0.85,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(
          config.name,
          `HTTP ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          retryable,
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) {
        throw new ProviderError(config.name, 'Empty response', undefined, true);
      }

      return { text, provider: config.name, model: config.model };
    },
  };
}

// =====================================================
// Gemini クライアント (独自API)
// =====================================================

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function createGeminiProvider(model: string, apiKey: string): Provider {
  return {
    name: 'gemini',
    model,
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const contents = req.history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: req.systemPrompt }] },
          contents,
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 800,
            temperature: req.temperature ?? 0.85,
            // Gemini 2.5 系は thinking がデフォルト ON で maxOutputTokens を消費する。
            // 短編創作には不要なので 0 で無効化（ai-roundtable で実証済）。
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(
          'gemini',
          `HTTP ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          retryable,
        );
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
      if (!text) {
        throw new ProviderError('gemini', 'Empty response', undefined, true);
      }

      return { text, provider: 'gemini', model };
    },
  };
}

// =====================================================
// プロバイダ割当（ai-roundtable と衝突しない構成）
// =====================================================

export interface ProviderEnv {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
}

interface ProviderAssignment {
  primary: Provider;
  fallback: Provider;
}

function geminiFlashLite(env: ProviderEnv): Provider {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  return createGeminiProvider('gemini-2.5-flash-lite', env.GEMINI_API_KEY);
}

function groqLlama4Scout(env: ProviderEnv): Provider {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  return createOpenAICompatibleProvider({
    name: 'groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: env.GROQ_API_KEY,
  });
}

function groqLlama8B(env: ProviderEnv): Provider {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  return createOpenAICompatibleProvider({
    name: 'groq',
    model: 'llama-3.1-8b-instant',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: env.GROQ_API_KEY,
  });
}

// Cerebras gpt-oss-120b は ai-roundtable で「reasoning過剰で content 空 / 短文指示を画像サイズと誤解」
// と判明している（ai-roundtable/KNOWLEDGE.md 参照）。ai-novel では一旦見送り、必要になったら追加する。

/**
 * ai-novel の役割割当。ai-roundtable と TPD バケットが分散するよう注意:
 * - writer_a: Gemini Flash-Lite（RPD 1000 余裕）
 * - writer_b: Groq Llama 4 Scout（Llama 3.3 70B とは別 TPD バケット）
 * - writer_c: Groq Llama 3.1 8B Instant（TPD 巨大）
 * - editor:   Gemini Flash-Lite（完結時 1 回のみ、レアな呼び出し）
 *
 * fallback はすべて Groq 8B か Cerebras gpt-oss-120b。
 * ai-roundtable の主軸（Llama 3.3 70B）には触れないので衝突しない。
 */
export function getProviderAssignment(writer: Writer, env: ProviderEnv): ProviderAssignment {
  switch (writer) {
    case 'writer_a':
      // primary が Gemini なので fallback は別プロバイダの Groq Scout に逃がす。
      // Groq 8B を fallback にすると writer_c (primary 8B) と TPM が同時枯渇するので避ける
      return { primary: geminiFlashLite(env), fallback: groqLlama4Scout(env) };
    case 'writer_b':
      // Scout primary、fallback は Groq 8B（writer_c と同居だが、本番 60分/章なら干渉しない）
      return { primary: groqLlama4Scout(env), fallback: groqLlama8B(env) };
    case 'writer_c':
      // Llama 3.1 8B は **結末担当の品質が出ない**（PoC でループ・破綻を観察、KNOWLEDGE 参照）。
      // primary を Scout に格上げ、8B は fallback 専用に降格。
      // writer_b と writer_c が同じ Scout primary になるが、Scout 500 RPD ÷ 1作品4 req ≒ 100作品/日収まる
      return { primary: groqLlama4Scout(env), fallback: groqLlama8B(env) };
    case 'editor':
      // Gemini Flash-Lite は ai-roundtable と RPD を取り合うため、editor は Groq Scout に振り替える。
      // editor の出力は構造化フォーマット（【ペンネーム】等）なので Scout の指示追従能力で十分。
      return { primary: groqLlama4Scout(env), fallback: groqLlama8B(env) };
  }
}

// =====================================================
// Fallback 付き実行
// =====================================================

export async function completeWithFallback(
  req: CompletionRequest,
  opts: { primary: Provider; fallback: Provider },
): Promise<CompletionResponse> {
  const order = [opts.primary, opts.fallback];
  const errors: string[] = [];

  for (const provider of order) {
    try {
      return await provider.complete(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.warn(`[fallback] ${provider.name}/${provider.model} failed: ${msg}`);
    }
  }

  throw new Error(`All providers failed: ${errors.join(' | ')}`);
}
