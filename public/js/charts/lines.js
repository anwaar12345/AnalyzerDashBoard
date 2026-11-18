/* Trend lines over time (1–3 series), drawn in the same style as the cash flow chart:
   first line pink with glow and soft area, second dashed, third mint. */
import { esc, fmt, niceStep, smoothPath } from "../format.js";
import { showTooltip, hideTooltip } from "../ui.js";
import { setLegend, sideStats } from "./shared.js";

const LINE = [
  { cls: "line line--ocf draw", dot: "dot dot--ocf", legend: { style: "background:var(--series-2)" } },
  { cls: "line line--capex", dot: "dot dot--capex", legend: { cls: "dash" } },
  { cls: "line", attrs: 'style="stroke:var(--series-3);stroke-width:2.5"', dot: "dot", dotAttrs: 'style="fill:var(--series-3)"', legend: { style: "background:var(--series-3)" } },
];

export function draw(ctx, cfg) {
  const el = ctx.visual;
  const lines = cfg.lines.slice(0, 3);
  const labels = cfg.x;
  const n = labels.length;
  const f = (v, d) => fmt(v, cfg.format, d);

  setLegend(ctx, lines.map((l, i) => ({ label: l.name, ...LINE[i].legend })));

  const W = el.clientWidth;
  const H = el.clientHeight;
  const pad = { top: 16, right: 16, bottom: 36, left: 52 };
  const plotB = H - pad.bottom;
  const all = lines.flatMap((l) => l.values);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const step = niceStep((hi - lo || 1) / 3);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step || step;
  const x = (i) => pad.left + ((i + 0.5) * (W - pad.left - pad.right)) / n;
  const y = (v) => pad.top + ((yMax - v) / (yMax - yMin)) * (plotB - pad.top);
  const pts = lines.map((l) => l.values.map((v, i) => [x(i), y(v)]));
  const paths = pts.map((p) => (p.length > 1 ? smoothPath(p) : `M${p[0][0]},${p[0][1]}`));

  let grid = "";
  for (let v = yMin; v <= yMax + step / 1e6; v += step) {
    grid += `<line class="${v === 0 && yMin < 0 ? "zero-line" : "grid-line"}" x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}"/>`;
    grid += `<text x="${pad.left - 10}" y="${y(v) + 4}" text-anchor="end">${esc(f(v, 0))}</text>`;
  }

  // Show every k-th period label so they never overlap
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - pad.left - pad.right) / 64))));
  const compact = (W - pad.left - pad.right) / Math.ceil(n / every) < 90;
  const xLabels = labels
    .map((q, i) => (i % every && i !== n - 1 ? "" : `<text x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(compact ? String(q).replace(" 20", " '") : q)}</text>`))
    .join("");

  const zoneW = (W - pad.left - pad.right) / n;
  const x0 = x(0), x1 = x(n - 1);
  const area = n > 1 ? `<path class="fade-in" d="${paths[0]} L${x1},${plotB} L${x0},${plotB} Z" fill="url(#ln-glow)"/>` : "";
  const showDots = n <= 24;

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.description)}">
      <defs>
        <linearGradient id="ln-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e2a9d2" stop-opacity=".28"/>
          <stop offset="1" stop-color="#e2a9d2" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      ${area}
      ${paths.map((d, i) => `<path class="${LINE[i].cls}" d="${d}"${i === 0 ? ' pathLength="1"' : ""} ${LINE[i].attrs || ""}/>`).reverse().join("")}
      ${showDots ? pts.map((p, i) => p.map(([px, py]) => `<circle class="${LINE[i].dot}" cx="${px}" cy="${py}" r="4" ${LINE[i].dotAttrs || ""}/>`).join("")).reverse().join("") : ""}
      <line class="focus-line" y1="${pad.top}" y2="${plotB}" visibility="hidden"/>
      <circle class="focus-dot" r="7" visibility="hidden"/>
      ${xLabels}
      ${labels.map((q, i) => `<rect class="hover-zone" data-i="${i}" tabindex="0" aria-label="${esc(q)}" x="${x(i) - zoneW / 2}" y="${pad.top}" width="${zoneW}" height="${plotB - pad.top}"/>`).join("")}
    </svg>`;

  // Hover: dashed guide + glowing dot on the first line + tooltip with every line's value
  const focus = el.querySelector(".focus-line");
  const dot = el.querySelector(".focus-dot");
  el.querySelectorAll(".hover-zone").forEach((zone) => {
    const i = Number(zone.dataset.i);
    const show = () => {
      focus.setAttribute("x1", x(i));
      focus.setAttribute("x2", x(i));
      focus.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(lines[0].values[i]));
      dot.setAttribute("visibility", "visible");
      showTooltip(ctx.tip, `<h3>${esc(labels[i])}</h3>${lines.map((l) => `<div><span>${esc(l.name)}</span><b>${esc(f(l.values[i]))}</b></div>`).join("")}`, zone);
    };
    const hide = () => {
      focus.setAttribute("visibility", "hidden");
      dot.setAttribute("visibility", "hidden");
      hideTooltip(ctx.tip);
    };
    zone.addEventListener("mouseenter", show);
    zone.addEventListener("focus", show);
    zone.addEventListener("mouseleave", hide);
    zone.addEventListener("blur", hide);
  });

  sideStats(ctx, cfg.stats || [], cfg.format);
}
