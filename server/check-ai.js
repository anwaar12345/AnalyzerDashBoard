/* "npm run check-ai": checks the AI key and lists the models it can use. Never prints the key. */
import "./env.js";
import { provider } from "./ai/index.js";

const p = provider();
if (!p.isConfigured()) {
  console.log("✗ GEMINI_API_KEY is missing. Copy .env.example to .env and paste your key from Google AI Studio.");
  process.exit(1);
}

try {
  const models = await p.listModels();
  const current = p.model();
  console.log(`✓ Key works. ${models.length} models can read documents:`);
  models.forEach((m) => console.log(`   ${m === current ? "→" : " "} ${m}`));
  console.log(models.includes(current) ? `\n✓ Using "${current}".` : `\n✗ "${current}" is not in this list. Set GEMINI_MODEL in .env to one of the models above (a "flash" model is a good free choice).`);
} catch (err) {
  console.log(`✗ ${err.message}`);
  process.exit(1);
}
