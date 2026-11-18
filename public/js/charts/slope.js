/* Slope graph: each item's line goes from last period to this period.
   Right side: margin rings for items that have revenue, plus a note for loss-making items. */
import { esc, fmt, signed, niceStep, spreadLabels, deltaChip } from "../format.js";
import { setLegend } from "./shared.js";

export function draw(ctx, cfg) {
  const el = ctx.visual;
  const items = cfg.items;
  setLegend(ctx, []);

  const W = el.clientWidth;
  const H = el.clientHeight;
  const labelRoom = Math.min(190, W * 0.42);
  const pad = { top: 18, right: labelRoom, bottom: 34, left: 58 };
  const values = items.flatMap((s) => [s.cur, s.prev]);
  const step = niceStep((Math.max(...values) - Math.min(0, ...values)) / 4);
  const yMin = Math.floor(Math.min(0, ...values) / step) * step;
  const yMax = Math.ceil(Math.max(...values) / step) * step;
  const y = (v) => pad.top + ((yMax - v) / (yMax - yMin)) * (H - pad.top - pad.bottom);
  const xL = pad.left;
  const xR = W - pad.right;

  let grid = "";
  for (let v = yMin; v <= yMax; v += step) {
    grid += `<line class="${v === 0 ? "zero-line" : "grid-line"}" x1="${xL}" x2="${xR}" y1="${y(v)}" y2="${y(v)}"/>`;
  }

  const lines = items
    .map((s) => `
      <line class="slope draw" pathLength="1" x1="${xL}" y1="${y(s.prev)}" x2="${xR}" y2="${y(s.cur)}" style="stroke:${s.color}"/>
      <circle class="slope-dot" cx="${xL}" cy="${y(s.prev)}" r="4.5" style="fill:${s.color}"/>
      <circle class="slope-dot slope-dot--end" cx="${xR}" cy="${y(s.cur)}" r="6" style="fill:${s.color};color:${s.color}"/>`)
    .join("");

  const left = spreadLabels(items.map((s) => ({ y: y(s.prev), text: fmt(s.prev, cfg.format) })), 16)
    .map((l) => `<text x="${xL - 12}" y="${l.y + 4}" text-anchor="end">${l.text}</text>`)
    .join("");

  const right = spreadLabels(items.map((s) => ({ y: y(s.cur), s })), 34)
    .map(({ y: ly, s }) => {
      const d = deltaChip(s.cur, s.prev, s.invert);
      return `
        <text class="slope-name" x="${xR + 14}" y="${ly - 3}">${esc(s.name)}</text>
        <text class="slope-value" x="${xR + 14}" y="${ly + 13}"><tspan>${fmt(s.cur, cfg.format)}</tspan><tspan class="${d.tone}" dx="6">${d.text}</tspan></text>`;
    })
    .join("");

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.description)}">
      ${grid}
      <text x="${xL}" y="${H - 8}" text-anchor="middle">${esc(cfg.from)}</text>
      <text x="${xR}" y="${H - 8}" text-anchor="middle">${esc(cfg.to)}</text>
      <line class="axis-tick" x1="${xL}" x2="${xL}" y1="${pad.top}" y2="${H - pad.bottom}"/>
      <line class="axis-tick" x1="${xR}" x2="${xR}" y1="${pad.top}" y2="${H - pad.bottom}"/>
      ${lines}
      ${left}
      ${right}
    </svg>`;

  // Side: operating margin rings for items that report revenue
  const ring = (pct) => {
    const c = 2 * Math.PI * 26;
    return `
      <svg class="ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" class="ring__track"/>
        <circle cx="32" cy="32" r="26" class="ring__value" stroke-dasharray="${(pct / 100) * c} ${c}"/>
      </svg>`;
  };

  const rings = items
    .filter((s) => s.revenue)
    .map((s) => {
      const cur = (s.cur / s.revenue.cur) * 100;
      const prev = (s.prev / s.revenue.prev) * 100;
      return `
        <div class="margin">
          <div class="margin__ring" style="color:${s.color}">${ring(cur)}<b>${cur.toFixed(0)}%</b></div>
          <div>
            <span class="stat__label">${esc(s.name)} margin</span>
            <span class="stat__value">${cur.toFixed(1)}%</span>
            <span class="stat__sub">was ${prev.toFixed(1)}% · <span class="${cur >= prev ? "pos" : "neg"}">${signed(cur - prev)} pts</span></span>
          </div>
        </div>`;
    })
    .join("");

  const losses = items.filter((s) => !s.revenue);
  const lossNote =
    cfg.lossNote && losses.length
      ? `<div class="stat">
       <span class="stat__label">${esc(cfg.lossNote.label)}</span>
       <span class="stat__sub">${losses.map((s) => `${esc(s.name)} <b class="neg">${fmt(s.cur, cfg.format)}</b>`).join(" · ")}. ${esc(cfg.lossNote.text)}</span>
     </div>`
      : "";

  ctx.side.innerHTML = rings + lossNote;
}
