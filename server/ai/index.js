/* AI plug-in: picks the provider from AI_PROVIDER (default "gemini").
   To add another (e.g. Claude), create ./claude.js with the same generate() and add it below. */
import * as gemini from "./gemini.js";
import { SYSTEM, USER, cleanExtraction } from "./prompt.js";
import { AiError } from "./errors.js";

const PROVIDERS = { gemini };

export function provider() {
  const name = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const p = PROVIDERS[name];
  if (!p) throw new AiError(`Unknown AI_PROVIDER "${name}".`, 503);
  return p;
}

/** Sends a document (file and/or text) to the AI and returns cleaned tables + highlights. */
export async function extractTables({ file, text }) {
  const reply = await provider().generate({ system: SYSTEM, prompt: USER, file, text });
  try {
    return cleanExtraction(reply);
  } catch (err) {
    throw new AiError(err.message, 422);
  }
}

export { AiError };
