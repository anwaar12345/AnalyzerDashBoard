/* Shared formatting and small helpers.
   Values are stored in the file's unit (meta.unit) and shown compact: $127.6B, 18.3K, 45. */

const UNIT_FACTOR = { ones: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };
const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹", PKR: "Rs " };
const settings = { factor: 1e6, symbol: "$" };

/** Call once per dashboard: sets the unit and currency used by money() and number(). */
export function setNumberFormat(meta) {
  settings.factor = UNIT_FACTOR[meta.unit] ?? 1;
  settings.symbol = SYMBOLS[meta.currency] ?? (meta.currency ? `${meta.currency} ` : "");
}

/** Escape text before putting it into HTML (protects against code hidden in uploaded data). */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped text where **word** becomes <strong>word</strong>. */
export const richText = (value) => esc(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/** Compact amount with the currency symbol: $1.23T / $127.6B / $372M / $2.5M / $18.3K / $45. */
export const money = (value, digits = 1) => compact(value, digits, settings.symbol);

/** Same as money() without a currency symbol (counts such as customers or units). */
export const number = (value, digits = 1) => compact(value, digits, "");

/** Format by type: "money" (default), "number", "percent" or "perShare". */
export function fmt(value, format = "money", digits = 1) {
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "number") return number(value, digits);
  if (format === "perShare") return `${settings.symbol}${value.toFixed(2)}`;
  return money(value, digits);
}

function compact(value, digits, symbol) {
  if (value === 0) return `${symbol}0`;
  const sign = value < 0 ? "−" : "";
  const m = Math.abs(value * settings.factor) / 1e6; // in millions
  if (m >= 1e6) return `${sign}${symbol}${(m / 1e6).toFixed(2)}T`;
  if (m >= 1e3) return `${sign}${symbol}${(m / 1e3).toFixed(digits)}B`;
  if (m >= 100) return `${sign}${symbol}${m.toFixed(0)}M`;
  if (m >= 1) return `${sign}${symbol}${m.toFixed(digits)}M`;
  const units = m * 1e6;
  if (units >= 1e3) return `${sign}${symbol}${(units / 1e3).toFixed(digits)}K`;
  return `${sign}${symbol}${Number.isInteger(units) ? units : units.toFixed(units < 10 ? 2 : 1)}`;
}

export const change = (cur, prev) => ((cur - prev) / Math.abs(prev)) * 100;
export const signed = (n, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;
export const sum = (list) => list.reduce((a, b) => a + b, 0);

export const hasPrev = (item) => typeof item?.prev === "number";

/** "+25.0%" text with tone class (empty when there is no previous value).
    invert: a rise is bad news (costs, debt), so it is shown red. */
export function deltaChip(cur, prev, invert = false) {
  if (typeof prev !== "number" || prev === 0) return { text: "", tone: "" };
  const pct = change(cur, prev);
  return { text: `${signed(pct)}%`, tone: (pct >= 0) !== Boolean(invert) ? "pos" : "neg" };
}

/** Round chart step: 1, 2, 5 or 10 × power of ten. */
export function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Smooth SVG path through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Push labels apart so none are closer than `gap` px. */
export function spreadLabels(labels, gap) {
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;
  }
  return labels;
}
