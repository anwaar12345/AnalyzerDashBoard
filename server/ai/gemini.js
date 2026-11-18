/* Google Gemini provider (REST, no SDK). The API key is read from the server's environment only. */
import { AiError } from "./errors.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 90_000; // per model; with fallbacks the whole request stays under the server's 5-minute limit

const key = () => process.env.GEMINI_API_KEY?.trim();
export const model = () => process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
export const isConfigured = () => Boolean(key()) && key() !== "your-key-here";

// Tried in order when a model is busy, rate-limited or retired (free-tier models change often)
const models = () => [
  model(),
  ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-3.5-flash-lite").split(",").map((m) => m.trim()),
].filter((m, i, all) => m && all.indexOf(m) === i);
const TRY_NEXT = [404, 429, 500, 502, 503, 504];

/**
 * input: { system, prompt, file?: { mimeType, base64 }, text? }
 * returns the model's text reply (expected to be JSON)
 */
export async function generate(input) {
  if (!isConfigured()) throw new AiError("AI is not set up on this server yet (GEMINI_API_KEY is missing).", 503);
  let lastError;
  for (const name of models()) {
    try {
      return await generateWith(name, input);
    } catch (err) {
      lastError = err;
      if (!TRY_NEXT.includes(err.upstreamStatus)) throw err;
      console.warn(`Gemini model ${name} unavailable (${err.upstreamStatus}), trying the next one`);
    }
  }
  throw lastError;
}

async function generateWith(name, { system, prompt, file, text }) {
  const parts = [];
  if (file) parts.push({ inline_data: { mime_type: file.mimeType, data: file.base64 } });
  if (text) parts.push({ text });
  parts.push({ text: prompt });

  let res;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(name)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const error = new AiError(err.name === "TimeoutError" ? "The AI took too long to answer. Please try again or use a smaller file." : "Could not reach the AI service. Please try again.", 504);
    error.upstreamStatus = 504; // a slow or unreachable model → try the next one
    throw error;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = mapError(res.status, body);
    err.upstreamStatus = res.status;
    throw err;
  }

  const candidate = body.candidates?.[0];
  const reply = candidate?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!reply) {
    const reason = body.promptFeedback?.blockReason || candidate?.finishReason || "empty reply";
    throw new AiError(`The AI could not read this document (${reason}).`, 422);
  }
  return reply;
}

/** Lists the models this key can use for generateContent (for "npm run check-ai"). */
export async function listModels() {
  if (!isConfigured()) throw new AiError("GEMINI_API_KEY is missing in .env", 503);
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key() }, signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res.status, body);
  return (body.models || []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
}

function mapError(status, body) {
  const detail = body?.error?.message || "";
  if (status === 400 && /api key/i.test(detail)) return new AiError("The Gemini API key was rejected. Please check GEMINI_API_KEY in .env.", 503);
  if (status === 401 || status === 403) return new AiError("The Gemini API key is not allowed to use this model.", 503);
  if (status === 404) return new AiError(`The Gemini models in .env are not available. Set GEMINI_MODEL (run "npm run check-ai" to list models).`, 503);
  if (status === 429) return new AiError("The free AI limit has been reached for now. Please try again in a few minutes.", 429);
  if (status === 503) return new AiError("The AI models are very busy right now. Please try again in a minute.", 503);
  if (status === 400) return new AiError("The AI could not process this file. It may be too large or damaged.", 422);
  return new AiError("The AI service is busy right now. Please try again shortly.", 502);
}
