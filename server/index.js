/* Web server: serves the dashboard (public/) and turns uploaded files into Dashboard JSON. */
import "./env.js"; // must load first: reads .env into process.env
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, FileError } from "./read-file.js";
import { readDocument, DOCUMENT_TYPES } from "./read-document.js";
import { buildDashboard } from "./build-dashboard.js";
import { toReview, fromReview, ReviewError } from "./review.js";
import { provider, AiError } from "./ai/index.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 5500;
const HOST = process.env.HOST || "127.0.0.1"; // set HOST=0.0.0.0 when deploying
const MAX_MB = 10;

const TABLE_TYPES = ["xlsx", "xls", "csv", "json"]; // read by code
// DOCUMENT_TYPES (pdf, docx, images, txt) are read by the AI provider

const app = express();
app.disable("x-powered-by");

// Basic browser protections: only our own scripts run; fonts from Google Fonts
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});

app.use(express.static(path.join(ROOT, "public"), { extensions: ["html"] }));

// Tells the upload screen whether AI (PDF/Word/images) is available
app.get("/api/status", (req, res) => {
  res.json({ ai: provider().isConfigured(), tableTypes: TABLE_TYPES, documentTypes: DOCUMENT_TYPES, maxMb: MAX_MB });
});

// Files stay in memory only and are never written to disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1, fields: 0 } });

app.post("/api/analyze", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Please choose a file to upload." });

  const name = path.basename(file.originalname || "file").slice(0, 120);
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "doc") return res.status(415).json({ error: "Old .doc files are not supported. Please save the file as .docx and upload it again." });
  if (![...TABLE_TYPES, ...DOCUMENT_TYPES].includes(ext) || !looksLike(ext, file.buffer)) {
    return res.status(415).json({ error: "Unsupported file. Please upload Excel, CSV, JSON, PDF, Word (.docx), an image (PNG, JPG, WebP) or a text file." });
  }

  try {
    const read = TABLE_TYPES.includes(ext) ? readFile(file.buffer, name) : await readDocument(file.buffer, ext);
    if (read.dashboard) return res.json({ dashboard: read.dashboard, warnings: [] });

    // AI-read documents must be reviewed first; spreadsheets get a dashboard now plus an optional review
    const review = toReview(read, name);
    if (read.viaAi) return res.json({ review, needsReview: true });
    return res.json({ ...buildDashboard(read, name), review, needsReview: false });
  } catch (err) {
    if (err instanceof FileError) return res.status(422).json({ error: err.message });
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
    console.error("analyze failed:", err);
    return res.status(500).json({ error: "Something went wrong while reading this file. Please check its layout and try again." });
  }
});

// Builds the dashboard from the tables the user checked and edited on the review screen
app.post("/api/build", express.json({ limit: "6mb" }), (req, res) => {
  try {
    const result = fromReview(req.body);
    if (req.body?.viaAi) result.warnings.unshift("These figures were read by AI and checked by you. Compare key numbers with the document.");
    return res.json(result);
  } catch (err) {
    if (err instanceof ReviewError || err instanceof FileError) return res.status(422).json({ error: err.message });
    console.error("build failed:", err);
    return res.status(500).json({ error: "The dashboard could not be built from these tables. Please check them and try again." });
  }
});

/** Check the file's first bytes match its extension (a renamed .exe is rejected). */
function looksLike(ext, buf) {
  if (!buf?.length) return false;
  const head = buf.subarray(0, 12);
  switch (ext) {
    case "xlsx":
    case "docx":
      return head[0] === 0x50 && head[1] === 0x4b; // ZIP "PK"
    case "xls":
      return buf.readUInt32BE(0) === 0xd0cf11e0 || /^\s*</.test(buf.subarray(0, 64).toString());
    case "pdf":
      return buf.subarray(0, 1024).includes("%PDF-");
    case "png":
      return head.readUInt32BE(0) === 0x89504e47;
    case "jpg":
    case "jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "webp":
      return head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP";
    default:
      return !buf.subarray(0, 4096).includes(0); // csv / json / txt / md: plain text
  }
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? `The file is larger than ${MAX_MB} MB.` : "Please upload exactly one file.";
    return res.status(413).json({ error: msg });
  }
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "These tables are too large to build in one go." });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "The review data was not valid." });
  next(err);
});

app.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(provider().isConfigured() ? `AI ready (${process.env.AI_PROVIDER || "gemini"}, model ${provider().model()})` : "AI not set up: add GEMINI_API_KEY to .env to read PDF, Word and images");
});
