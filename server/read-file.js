/* Reads an uploaded Excel / CSV / JSON file into typed tables.
   Numbers are read by code (never guessed by AI), so they match the file exactly. */
import * as XLSX from "xlsx";

const MAX_SHEETS = 5;
const MAX_ROWS = 5000;
const MAX_COLS = 50;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Q1 2025", "FY24", "2024", "2024-01", "Jan", "January 2024", "Jan-24", "1/2024" …
const PERIOD = new RegExp(
  `^(?:(?:q[1-4]|h[12])[\\s-]*(?:fy)?'?\\d{2,4}|fy\\s*'?\\d{2,4}(?:\\s*q[1-4])?|(?:19|20)\\d{2}(?:\\s*[-/ ]\\s*(?:q[1-4]|h[12]|\\d{1,2}))?` +
    `|(?:${MONTHS})[a-z]*\\.?(?:[\\s-]*'?\\d{2,4})?|(?:19|20)\\d{2}\\s*(?:${MONTHS})[a-z]*|(?:\\d{1,2}[-/])?\\d{1,2}[-/]\\d{2,4}|(?:19|20)\\d{2}-?w\\d{1,2})$`,
  "i"
);
const TIME_HEADER = /^(date|month|year|quarter|period|week|day|time|fy|fiscal)\b/i;
const TOTAL_ROW = /^(grand\s+)?total\b|^sum$|^all$/i;
const CURRENCIES = [
  [/\$|\busd\b/i, "USD"],
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/₹|\binr\b/i, "INR"],
  [/\bpkr\b|\brs\.?\s/i, "PKR"],
];

export class FileError extends Error {}

/** Returns { dashboard } for a ready Dashboard JSON, otherwise { tables, unit, currency }. */
export function readFile(buffer, fileName) {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "json") {
    const json = parseJson(buffer);
    if (json && json.version === 1 && Array.isArray(json.views)) return { dashboard: json };
    return finish([tableFromRows(rowsFromJson(json), "Data")]);
  }

  let book;
  try {
    // CSV: keep cells as text so "$1,200" or "12%" keep their symbols; this file parses them itself
    book = ext === "csv"
      ? XLSX.read(buffer.toString("utf8"), { type: "string", raw: true, dense: true })
      : XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
  } catch {
    throw new FileError("This file could not be read. Is it a valid Excel or CSV file?");
  }
  const sheets = book.SheetNames.slice(0, MAX_SHEETS);
  const tables = sheets
    .map((name) => tableFromRows(XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }).map((r) => r.map(fromText)), name))
    .filter(Boolean);
  return finish(tables, sheets.map((name) => formatCurrency(book.Sheets[name])).find(Boolean));
}

function finish(tables, formatSymbol) {
  const usable = tables.filter((t) => t && t.columns.some((c) => c.kind === "number"));
  if (!usable.length) throw new FileError("No numeric columns were found. The file needs at least one column of numbers.");
  const text = usable.map((t) => [t.name, t.title, ...t.columns.map((c) => c.name)].join(" ")).join(" ");
  const symbols = usable.flatMap((t) => t.columns.map((c) => c.currency)).filter(Boolean);
  return { tables: usable, unit: detectUnit(text), currency: symbols[0] || formatSymbol || detectCurrency(text) };
}

/** ISO date text ("2025-01-31") becomes a Date so it is treated as a period. */
function fromText(v) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v.trim())) {
    const d = new Date(v.trim().slice(0, 10) + "T00:00:00Z");
    return Number.isNaN(d.getTime()) ? v : d;
  }
  return v;
}

/** Currency from Excel number formats (e.g. "$#,##0"), checking the first 300 cells. */
function formatCurrency(sheet) {
  const cells = (sheet?.["!data"] || []).flat().filter((c) => c?.z).slice(0, 300);
  const fmt = cells.map((c) => String(c.z)).join(" ");
  return detectCurrency(fmt);
}

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new FileError("This JSON file is not valid JSON.");
  }
}

/** Accepts [{...}, ...], [[...], ...] or { anyKey: [{...}, ...] }. */
function rowsFromJson(json) {
  let list = json;
  if (!Array.isArray(list) && json && typeof json === "object") list = Object.values(json).find((v) => Array.isArray(v));
  if (!Array.isArray(list) || !list.length) throw new FileError("The JSON needs a list of records, e.g. [{ \"month\": \"Jan\", \"sales\": 120 }].");
  if (Array.isArray(list[0])) return list;
  const keys = [...new Set(list.flatMap((o) => (o && typeof o === "object" ? Object.keys(o) : [])))];
  return [keys, ...list.map((o) => keys.map((k) => (o?.[k] ?? null)))];
}

// ---------- Rows → typed table (also used for tables the AI extracts from documents) ----------
export function tableFromRows(rows, name) {
  rows = rows.filter((r) => Array.isArray(r) && r.some((v) => v !== null && v !== ""));
  if (rows.length < 2) return null;

  // Header = first row (in the top 10) with 2+ text cells that is followed by numbers
  let h = rows.slice(0, 10).findIndex((r, i) => r.filter((v) => typeof v === "string" && v.trim()).length >= 2 && rows.slice(i + 1, i + 4).some((n) => n.some((v) => parseNumber(v) !== null)));
  if (h < 0) h = 0;

  const title = rows.slice(0, h).flat().filter((v) => typeof v === "string").join(" ");
  const width = Math.min(MAX_COLS, Math.max(...rows.slice(h).map((r) => r.length)));
  const seen = new Set();
  const headers = Array.from({ length: width }, (_, j) => {
    let label = cellLabel(rows[h][j]) || `Column ${j + 1}`;
    while (seen.has(label)) label += " ";
    seen.add(label);
    return label.trim();
  });

  // Drop "Total" rows (first text cell says Total): the dashboard calculates totals itself.
  // The first one is kept aside so the review screen can check that the rows add up to it.
  const isTotal = (r) => TOTAL_ROW.test(String(r.find((v) => typeof v === "string" && v.trim()) ?? "").trim());
  const body = rows.slice(h + 1, h + 1 + MAX_ROWS);
  const data = body.filter((r) => !isTotal(r));
  const totalRow = body.find(isTotal);
  const typed = headers.map((header, j) => ({ j, col: typeColumn(header, data.map((r) => r[j] ?? null)) })).filter((x) => x.col);
  const columns = typed.map((x) => x.col);
  const total = totalRow ? typed.map((x) => (totalRow[x.j] instanceof Date ? cellLabel(totalRow[x.j]) : totalRow[x.j] ?? null)) : null;

  // Oldest period first
  const period = columns.find((c) => c.kind === "period");
  if (period && period.sortKeys[0] !== null && period.sortKeys.at(-1) !== null && period.sortKeys[0] > period.sortKeys.at(-1)) {
    columns.forEach((c) => c.values.reverse());
  }
  columns.forEach((c) => delete c.sortKeys);

  return { name, title, columns, total, rowCount: data.length };
}

function typeColumn(name, raw) {
  const filled = raw.filter((v) => v !== null && v !== "");
  if (!filled.length) return null;

  const years = filled.every((v) => Number.isInteger(v) && v >= 1900 && v <= 2100);
  const periodLike = filled.filter((v) => v instanceof Date || (typeof v === "string" && PERIOD.test(v.trim()))).length / filled.length;
  if (periodLike >= 0.8 || (TIME_HEADER.test(name) && (years || periodLike >= 0.6))) {
    return {
      name,
      kind: "period",
      values: raw.map((v) => (v === null || v === "" ? null : cellLabel(v))),
      sortKeys: raw.map((v) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : null)),
    };
  }

  const parsed = raw.map(parseNumber);
  const numbers = parsed.filter((p) => p !== null);
  if (numbers.length / filled.length >= 0.7) {
    const percent = numbers.filter((p) => p.percent).length > numbers.length / 2 || /%|percent|margin|rate\b/i.test(name);
    const symbol = numbers.find((p) => p.currency)?.currency;
    return { name, kind: "number", percent, currency: symbol || null, values: parsed.map((p) => (p ? p.value : null)) };
  }
  return { name, kind: "text", values: raw.map((v) => (v === null ? null : cellLabel(v))) };
}

/** Number from a cell: 1234, "1,234", "$1.2", "(45)", "−3.5%", "12 %". */
function parseNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return { value: v };
  if (typeof v !== "string") return null;
  let s = v.trim();
  if (!s) return null;
  const currency = CURRENCIES.find(([re]) => re.test(s + " "))?.[1];
  const percent = s.includes("%");
  const negative = /^\(.*\)$/.test(s) || /^[-−–]/.test(s);
  s = s.replace(/^\(|\)$/g, "").replace(/^[-−–]/, "").replace(/usd|eur|gbp|inr|pkr|rs\.?/gi, "").replace(/[$€£₹%,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return { value: (negative ? -1 : 1) * Number(s), percent, currency };
}

/** Text label for a header or period cell. Dates → "Jan 2024" (1st of month) or "15 Jan 2024". */
function cellLabel(v) {
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600e3); // avoid time-zone edge shifts
    const month = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return d.getUTCDate() === 1 ? month : `${d.getUTCDate()} ${month}`;
  }
  return v === null || v === undefined ? "" : String(v).trim();
}

function detectUnit(text) {
  if (/\b(billions?|bn)\b/i.test(text)) return "billions";
  if (/\b(millions?|mn|mm)\b|\$\s?m\b|\(m\)/i.test(text)) return "millions";
  if (/\b(thousands?|000s?)\b|\$\s?k\b|\(k\)/i.test(text)) return "thousands";
  return "ones";
}

const detectCurrency = (text) => CURRENCIES.find(([re]) => re.test(text + " "))?.[1] || null;
