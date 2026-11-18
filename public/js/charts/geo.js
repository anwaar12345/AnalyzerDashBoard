/* World map with a glowing bubble per region (size = value) + region list on the right.
   Region keys must exist in WORLD_MAP (world-map.js): us, emea, apac, americas. */
import { esc, money, signed, sum, deltaChip } from "../format.js";
import { setLegend } from "./shared.js";

// Where each region's label sits relative to its bubble (chosen so labels never overlap)
const LABEL_SIDE = { us: "bottom", emea: "top", apac: "bottom", americas: "right" };

export function draw(ctx, cfg) {
  const { width: W, height: H, paths, points } = WORLD_MAP;
  const regions = cfg.regions;
  const total = sum(regions.map((r) => r.cur));
  const maxShare = Math.max(...regions.map((r) => r.cur / total));
  const radius = (r) => 12 + 30 * Math.sqrt(r.cur / total / maxShare);

  setLegend(ctx, [
    { label: `Bubble size = ${cfg.sizeLabel}`, style: "background:var(--accent);border-radius:50%" },
    { label: "Brighter region = bigger share", style: "background:#6f5268" },
  ]);

  const shapes = regions
    .map((r) => {
      const share = r.cur / total;
      return `
        <g class="region" data-region="${r.key}">
          <path d="${paths[r.key]}" fill="url(#map-dots)"/>
          <path class="region__tint" d="${paths[r.key]}" style="fill-opacity:${(0.12 + 0.5 * (share / maxShare)).toFixed(2)}"/>
        </g>`;
    })
    .join("");

  const bubbles = regions
    .map((r) => {
      const [cx, cy] = points[r.key];
      const rad = radius(r);
      return `
        <g class="bubble" data-region="${r.key}" tabindex="0" aria-label="${esc(r.name)} ${money(r.cur)}">
          <circle class="bubble__pulse" cx="${cx}" cy="${cy}" r="${rad}"/>
          <circle class="bubble__core" cx="${cx}" cy="${cy}" r="${rad}"/>
          <circle cx="${cx}" cy="${cy}" r="3" fill="#fff"/>
        </g>`;
    })
    .join("");

  const labels = regions
    .map((r) => {
      const [cx, cy] = points[r.key];
      const side = LABEL_SIDE[r.key];
      const gap = radius(r) + 10;
      const lx = side === "right" ? cx + gap : side === "left" ? cx - gap : cx;
      const ly = side === "top" ? cy - gap : side === "bottom" ? cy + gap : cy;
      const d = deltaChip(r.cur, r.prev);
      return `
        <div class="map-label map-label--${side}" data-region="${r.key}" style="left:${(lx / W) * 100}%;top:${(ly / H) * 100}%">
          <span class="map-label__name">${esc(r.name)}</span>
          <b>${money(r.cur)}</b> <span class="chip ${d.tone}">${d.text}</span>
        </div>`;
    })
    .join("");

  ctx.visual.innerHTML = `
    <div class="map">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.description)}">
        <defs>
          <pattern id="map-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.4" fill="#5d4d58"/>
          </pattern>
          <radialGradient id="bubble-fill">
            <stop offset="0" stop-color="#f3c9e5" stop-opacity=".95"/>
            <stop offset=".6" stop-color="#c48db5" stop-opacity=".55"/>
            <stop offset="1" stop-color="#9c6f90" stop-opacity=".15"/>
          </radialGradient>
        </defs>
        ${shapes}
        ${bubbles}
      </svg>
      ${labels}
    </div>`;

  ctx.side.innerHTML = regions
    .map((r) => {
      const d = deltaChip(r.cur, r.prev);
      const share = (r.cur / total) * 100;
      const cc = typeof r.cc === "number" ? ` · ${signed(r.cc, 0)}% cc` : "";
      return `
        <div class="geo-row" data-region="${r.key}" tabindex="0">
          <div class="geo-row__head"><span>${esc(r.name)}</span><b>${money(r.cur)}</b></div>
          <div class="track"><span class="cur" style="width:${share}%"></span></div>
          <div class="geo-row__foot">
            <span>${share.toFixed(1)}% ${esc(cfg.shareLabel || "of total")}</span>
            <span><span class="${d.tone}">${d.text} YoY</span>${cc}</span>
          </div>
        </div>`;
    })
    .join("");

  // Hovering a region, bubble, label or list row highlights that region everywhere
  const nodes = ctx.card.querySelectorAll("[data-region]");
  nodes.forEach((node) => {
    const on = () => nodes.forEach((n) => n.classList.toggle("is-active", n.dataset.region === node.dataset.region));
    const off = () => nodes.forEach((n) => n.classList.remove("is-active"));
    node.addEventListener("mouseenter", on);
    node.addEventListener("focus", on);
    node.addEventListener("mouseleave", off);
    node.addEventListener("blur", off);
  });
}
