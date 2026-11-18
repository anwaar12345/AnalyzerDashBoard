/* Two smooth lines over time; the gap between them is shaded green (first above second) or red.
   Used for operating cash flow vs capex, where the gap is free cash flow. */
import { esc, money, niceStep, smoothPath } from "../format.js";
import { showTooltip, hideTooltip } from "../ui.js";
import { setLegend, sideStats } from "./shared.js";

export function draw(ctx, cfg) {
  const el = ctx.visual;
  const [a, b] = cfg.lines; // a = main line (pink), b = dashed line
  const labels = cfg.x;
  const gap = a.values.map((v, i) => v - b.values[i]);
  const n = labels.length;

  setLegend(ctx, [
    { label: a.name, style: "background:var(--series-2)" },
    { label: b.name, cls: "dash" },
    { label: `Positive ${cfg.gap.name.toLowerCase()}`, style: "background:rgba(95,211,141,.45)" },
    { label: `Negative ${cfg.gap.name.toLowerCase()}`, style: "background:rgba(240,123,134,.45)" },
  ]);

  const W = el.clientWidth;
  const H = el.clientHeight;
  const pad = { top: 16, right: 16, bottom: 58, left: 48 };
  const plotB = H - pad.bottom;
  const step = niceStep(Math.max(...a.values, ...b.values) / 3);
  const yMax = Math.ceil(Math.max(...a.values, ...b.values) / step) * step;
  const x = (i) => pad.left + ((i + 0.5) * (W - pad.left - pad.right)) / n;
  const y = (v) => pad.top + (1 - v / yMax) * (plotB - pad.top);

  const aPts = a.values.map((v, i) => [x(i), y(v)]);
  const bPts = b.values.map((v, i) => [x(i), y(v)]);
  const aLine = smoothPath(aPts);
  const bLine = smoothPath(bPts);
  const x0 = x(0), x1 = x(n - 1);
  const under = (line) => `${line} L${x1},${plotB} L${x0},${plotB} Z`;
  const above = (line) => `${line} L${x1},${pad.top} L${x0},${pad.top} Z`;

  let grid = "";
  for (let v = 0; v <= yMax; v += step) {
    grid += `<line class="grid-line" x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}"/>`;
    grid += `<text x="${pad.left - 10}" y="${y(v) + 4}" text-anchor="end">${money(v, 0)}</text>`;
  }

  // Narrow screens: shorter period names and no gap prefix so labels don't collide
  const compact = (W - pad.left - pad.right) / n < 100;
  const xLabels = labels
    .map((q, i) => `
      <text x="${x(i)}" y="${H - 32}" text-anchor="middle">${esc(compact ? q.replace(" 20", " '") : q)}</text>
      <text class="fcf-label ${gap[i] >= 0 ? "pos" : "neg"}" x="${x(i)}" y="${H - 12}" text-anchor="middle">${compact ? "" : `${esc(cfg.gap.short)} `}${gap[i] >= 0 ? "+" : ""}${money(gap[i])}</text>`)
    .join("");

  const dots = (pts, cls) => pts.map(([px, py]) => `<circle class="${cls}" cx="${px}" cy="${py}" r="4"/>`).join("");
  const zoneW = n > 1 ? (x1 - x0) / (n - 1) : W - pad.left - pad.right;

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.description)}">
      <defs>
        <clipPath id="cf-under-a"><path d="${under(aLine)}"/></clipPath>
        <clipPath id="cf-under-b"><path d="${under(bLine)}"/></clipPath>
        <linearGradient id="cf-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e2a9d2" stop-opacity=".28"/>
          <stop offset="1" stop-color="#e2a9d2" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path class="fade-in" d="${under(aLine)}" fill="url(#cf-glow)"/>
      <path class="fade-in gap-pos" d="${above(bLine)}" clip-path="url(#cf-under-a)"/>
      <path class="fade-in gap-neg" d="${above(aLine)}" clip-path="url(#cf-under-b)"/>
      <path class="line line--capex" d="${bLine}"/>
      <path class="line line--ocf draw" d="${aLine}" pathLength="1"/>
      ${dots(bPts, "dot dot--capex")}
      ${dots(aPts, "dot dot--ocf")}
      <line class="focus-line" y1="${pad.top}" y2="${plotB}" visibility="hidden"/>
      <circle class="focus-dot" r="7" visibility="hidden"/>
      ${xLabels}
      ${labels.map((q, i) => `<rect class="hover-zone" data-i="${i}" tabindex="0" aria-label="${esc(q)}" x="${x(i) - zoneW / 2}" y="${pad.top}" width="${zoneW}" height="${plotB - pad.top}"/>`).join("")}
    </svg>`;

  // Hover: dashed guide + glowing dot + tooltip (as in the reference chart)
  const focus = el.querySelector(".focus-line");
  const dot = el.querySelector(".focus-dot");
  el.querySelectorAll(".hover-zone").forEach((zone) => {
    const i = Number(zone.dataset.i);
    const show = () => {
      focus.setAttribute("x1", x(i));
      focus.setAttribute("x2", x(i));
      focus.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(a.values[i]));
      dot.setAttribute("visibility", "visible");
      showTooltip(
        ctx.tip,
        `<h3>${esc(labels[i])}</h3>
         <div><span>${esc(a.short || a.name)}</span><b>${money(a.values[i])}</b></div>
         <div><span>${esc(b.short || b.name)}</span><b>${money(b.values[i])}</b></div>
         <div><span>${esc(cfg.gap.name)}</span><span class="chip ${gap[i] >= 0 ? "pos" : "neg"}">${money(gap[i])}</span></div>`,
        zone
      );
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

  sideStats(ctx, cfg.stats || []);
}
