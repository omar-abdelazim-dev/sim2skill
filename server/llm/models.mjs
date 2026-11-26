// Gemini models through LangChain.js. Server-side only; never bundled into the browser.
// Tracing is disabled: student questions and private lab text may leave the server only to Gemini.
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { CachedEmbeddings } from './cache.mjs';

process.env.LANGCHAIN_TRACING_V2 = 'false';
process.env.LANGSMITH_TRACING = 'false';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMS = 768;
const chatModelName = () => String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').replace(/[^a-z0-9.\-]/gi, '');

// Tests replace these with LangChain's fake models so `npm test` never calls Gemini.
let overrides = null;
export function setModels(m) { overrides = m; }
export const aiConfigured = () => !!(overrides || process.env.GEMINI_API_KEY);

const transient = e => {
  const s = e?.status ?? e?.response?.status;
  return s === 429 || s === 500 || s === 503 || /fetch failed|ECONNRESET|ETIMEDOUT|overloaded/i.test(String(e?.message));
};

export function chatModel() {
  if (overrides?.chat) return overrides.chat;
  const model = new ChatGoogleGenerativeAI({ model: chatModelName(), apiKey: process.env.GEMINI_API_KEY, maxOutputTokens: 1024, temperature: 0.6, maxRetries: 0 });
  // Retry transient failures once more with backoff; anything else fails fast so the error mapping applies.
  return model.withRetry({ stopAfterAttempt: 2, onFailedAttempt: e => { if (!transient(e)) throw e; } });
}

const cachedEmbeddings = new Map();
export function embeddings(db, kind) {
  if (overrides) return overrides.embeddings ? new CachedEmbeddings(db, overrides.embeddings, 'fake:' + kind) : null;
  if (!process.env.GEMINI_API_KEY) return null;
  const key = kind + ':' + process.env.GEMINI_API_KEY.slice(-6);
  if (!cachedEmbeddings.has(key)) {
    const base = new GoogleGenerativeAIEmbeddings({
      model: EMBEDDING_MODEL, apiKey: process.env.GEMINI_API_KEY, outputDimensionality: EMBEDDING_DIMS,
      taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT', maxRetries: 3
    });
    cachedEmbeddings.set(key, new CachedEmbeddings(db, base, `${EMBEDDING_MODEL}:${EMBEDDING_DIMS}:${kind}`));
  }
  return cachedEmbeddings.get(key);
}

// Map provider errors to the API's contract: 429 busy, anything else 502.
export function mapAiError(e) {
  const s = e?.status ?? e?.response?.status;
  if (s === 429 || /\b429\b|quota|rate limit|RESOURCE_EXHAUSTED/i.test(String(e?.message))) return { status: 429, message: 'The AI is busy right now. Please wait a moment and ask again.' };
  return { status: 502, message: 'Nour could not reach the AI service.' };
}
