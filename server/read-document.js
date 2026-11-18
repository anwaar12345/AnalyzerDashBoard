/* Reads PDF, Word, image and text documents with the AI provider.
   The AI returns tables; they are typed and checked exactly like Excel/CSV tables. */
import mammoth from "mammoth";
import { tableFromRows, FileError } from "./read-file.js";
import { extractTables } from "./ai/index.js";

export const DOCUMENT_TYPES = ["pdf", "docx", "png", "jpg", "jpeg", "webp", "txt", "md"];
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const MAX_TEXT = 200_000; // characters sent to the AI

export async function readDocument(buffer, ext) {
  let input;
  if (ext === "docx") {
    const { value } = await mammoth.convertToHtml({ buffer }).catch(() => {
      throw new FileError("This Word file could not be read. Please save it again as .docx and retry.");
    });
    input = { text: htmlToText(value) };
  } else if (ext === "txt" || ext === "md") {
    input = { text: buffer.toString("utf8") };
  } else {
    input = { file: { mimeType: MIME[ext], base64: buffer.toString("base64") } };
  }

  if (input.text !== undefined) {
    if (!input.text.trim()) throw new FileError("This document has no text to read.");
    input.text = input.text.slice(0, MAX_TEXT);
  }

  const found = await extractTables(input);
  const tables = found.tables
    .map((t) => {
      const table = tableFromRows([t.columns, ...t.rows], t.name);
      if (table) Object.assign(table, { source: t.source, kind: t.kind, total: t.total || table.total });
      return table;
    })
    .filter((t) => t && t.columns.some((c) => c.kind === "number"));
  if (!tables.length) throw new FileError("No tables with numbers were found in this document.");

  return { tables, unit: found.unit, currency: found.currency, title: found.title, period: found.period, highlights: found.highlights, viaAi: true };
}

/** Word HTML → plain text where table cells are tab-separated and rows are lines. */
function htmlToText(html) {
  return html
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<\/tr>|<br\s*\/?>|<\/(p|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}
