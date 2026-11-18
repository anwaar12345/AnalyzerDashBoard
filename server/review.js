/* Review step: tables → editable grids with checks, and edited grids → dashboard.
   Everything sent back by the browser is cleaned again here: never trust the client. */
import { checkTable, LOWER_IS_BETTER } from "../public/js/checks.js";
import { tableFromRows } from "./read-file.js";
import { buildDashboard } from "./build-dashboard.js";

const LIMITS = { tables: 10, columns: 50, rows: 5000, text: 120 };
const UNITS = ["ones", "thousands", "millions", "billions"];
const KINDS = ["auto", "parts", "measures"];
const TONES = ["pos", "neg", "neutral"];

/** Typed tables (from a file or the AI) → review payload for the browser. */
export function toReview(read, fileName) {
  return {
    fileName,
    viaAi: Boolean(read.viaAi),
    unit: read.unit,
    currency: read.currency || null,
    title: read.title || "",
    period: read.period || "",
    highlights: read.highlights || [],
    tables: read.tables.map((t) => {
      const columns = t.columns.map((c) => c.name);
      const rows = Array.from({ length: t.columns[0]?.values.length || 0 }, (_, i) => t.columns.map((c) => c.values[i] ?? null));
      const table = { name: t.name, title: t.title || "", source: t.source || "", kind: t.kind || "auto", include: true, columns, rows, total: t.total || null };
      // Rows whose rise is bad news (costs, debt) start marked; the user can switch them
      table.lowerBetter = rows.map((r) => typeof r[0] === "string" && LOWER_IS_BETTER.test(r[0]));
      table.checks = checkTable(table);
      return table;
    }),
  };
}

/** Edited review payload → { dashboard, warnings }. Throws ReviewError for unusable input. */
export function fromReview(payload) {
  const clean = sanitize(payload);
  const tables = clean.tables
    .filter((t) => t.include)
    .map((t) => {
      const table = tableFromRows([t.columns, ...t.rows], t.name);
      if (!table) return null;
      return Object.assign(table, {
        title: t.title, // e.g. "Product sales (USD, in thousands)" names the values
        source: t.source,
        kind: t.kind === "auto" ? undefined : t.kind,
        lowerBetter: new Set(t.rows.filter((_, i) => t.lowerBetter[i]).map((r) => String(r[0] ?? ""))),
      });
    })
    .filter((t) => t && t.columns.some((c) => c.kind === "number"));
  if (!tables.length) throw new ReviewError("Keep at least one table with numbers to build a dashboard.");
  return buildDashboard({ ...clean, tables }, clean.fileName);
}

export class ReviewError extends Error {}

function sanitize(p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.tables)) throw new ReviewError("The review data is incomplete.");
  const text = (v, max = LIMITS.text) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const cell = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? text(v) || null : null);

  return {
    fileName: text(p.fileName, 120) || "upload",
    viaAi: Boolean(p.viaAi),
    unit: UNITS.includes(p.unit) ? p.unit : "ones",
    currency: /^[A-Z]{3}$/.test(p.currency || "") ? p.currency : null,
    title: text(p.title, 60),
    period: text(p.period, 30),
    highlights: (Array.isArray(p.highlights) ? p.highlights : []).slice(0, 6).map((h) => ({
      title: text(h?.title, 80),
      value: text(h?.value, 24),
      text: text(h?.text, 220),
      tone: TONES.includes(h?.tone) ? h.tone : "neutral",
    })).filter((h) => h.title),
    tables: p.tables.slice(0, LIMITS.tables).map((t, i) => {
      const columns = (Array.isArray(t?.columns) ? t.columns : []).slice(0, LIMITS.columns).map((c, j) => text(String(c ?? "")) || `Column ${j + 1}`);
      const rows = (Array.isArray(t?.rows) ? t.rows : []).slice(0, LIMITS.rows).filter(Array.isArray).map((r) => columns.map((_, j) => cell(r[j])));
      const lower = Array.isArray(t?.lowerBetter) ? t.lowerBetter : [];
      return {
        name: text(t?.name, 60) || `Table ${i + 1}`,
        title: text(t?.title, 80),
        source: text(t?.source, 40),
        kind: KINDS.includes(t?.kind) ? t.kind : "auto",
        include: t?.include !== false,
        columns,
        rows,
        lowerBetter: rows.map((_, k) => lower[k] === true),
      };
    }),
  };
}
