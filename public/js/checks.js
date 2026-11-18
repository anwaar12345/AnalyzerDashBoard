/* Checks on a review table, shared by the browser (live, while editing) and the server.
   table: { columns: [text], rows: [[cell]], total?: [cell] }  — first column = row labels.
   No DOM and no Node APIs here, so both sides can import this file. */

// Rows whose rise is bad news (costs, debt…): shown red when they grow.
// Names that also mention gains, income or revenue ("Hedging gains (losses)", "Other income (expense)") are mixed, so not marked.
const LOWER = /\b(costs?|expenses?|loss(es)?|debt|liabilit(y|ies)|capex|capital expenditures?|purchases? of|spend(ing)?|churn|refunds?|taxes|provision for income taxes|sales and marketing|selling,? general|general and administrative|research and development)\b/i;
const MIXED = /\bgains?\b|income\s*\(expense|\((loss|losses|expense)\)/i;
export const LOWER_IS_BETTER = { test: (name) => LOWER.test(name) && !MIXED.test(name) };

/** Number from text: "1,234", "$1.2", "(45)" → -45, "−3.5%". Returns null when it is not a number. */
export function parseNumberText(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value ?? "").trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^[-−–]/.test(s);
  s = s.replace(/^\(|\)$/g, "").replace(/^[-−–]/, "").replace(/usd|eur|gbp|inr|pkr|rs\.?/gi, "").replace(/[$€£₹%,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return (negative ? -1 : 1) * Number(s);
}

/** Columns (after the label column) where most cells are numbers. */
export function numericColumns(table) {
  return table.columns
    .map((_, j) => j)
    .filter((j) => j > 0)
    .filter((j) => {
      const filled = table.rows.map((r) => r[j]).filter((v) => v !== null && v !== "");
      return filled.length && filled.filter((v) => parseNumberText(v) !== null).length / filled.length >= 0.6;
    });
}

/**
 * Returns { cells: { "row,col": message }, notes: [{ tone: "pos" | "neg" | "warn", text }] }
 * - empty or non-numeric cells in number columns
 * - a value far larger than the rest of its column (often a misread digit)
 * - rows that do not add up to the document's total row
 */
export function checkTable(table) {
  const cells = {};
  const notes = [];
  const cols = numericColumns(table);
  if (!cols.length) notes.push({ tone: "neg", text: "No column of numbers: this table can't be charted." });

  for (const j of cols) {
    const values = table.rows.map((r) => parseNumberText(r[j]));
    table.rows.forEach((r, i) => {
      const raw = r[j];
      if (raw === null || raw === "" || raw === undefined) cells[`${i},${j}`] = "Empty cell";
      else if (values[i] === null) cells[`${i},${j}`] = "Not a number";
    });

    // Outliers: 25× the column's median size (needs a few values to judge)
    const sizes = values.filter((v) => v !== null && v !== 0).map(Math.abs).sort((a, b) => a - b);
    if (sizes.length >= 4) {
      const median = sizes[Math.floor(sizes.length / 2)];
      values.forEach((v, i) => {
        if (v !== null && median > 0 && Math.abs(v) > median * 25 && !cells[`${i},${j}`]) cells[`${i},${j}`] = "Much larger than the rest of this column. Check it.";
      });
    }

    // Total row from the document. Skipped for "different measures" tables (net income or total assets
    // is not the sum of the rows above it) and for percent / average columns, which don't add up.
    const additive = table.kind !== "measures" && !/%|percent|margin|rate|ratio|average|avg|mean/i.test(table.columns[j]);
    const total = additive ? parseNumberText(table.total?.[j]) : null;
    if (total !== null) {
      const sum = values.reduce((s, v) => s + (v ?? 0), 0);
      // Allow only rounding differences: 0.05% of the total, at least 2 units
      const off = Math.abs(sum - total) > Math.max(2, Math.abs(total) * 0.0005);
      notes.push(
        off
          ? { tone: "neg", text: `${table.columns[j]}: rows add up to ${fmtPlain(sum)}, but the document total is ${fmtPlain(total)}.` }
          : { tone: "pos", text: `${table.columns[j]}: rows add up to the document total (${fmtPlain(total)}).` }
      );
    }
  }

  const flagged = Object.keys(cells).length;
  if (flagged) notes.unshift({ tone: "warn", text: `${flagged} ${flagged === 1 ? "cell needs" : "cells need"} a look (highlighted).` });
  return { cells, notes };
}

const fmtPlain = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
