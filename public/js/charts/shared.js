/* Pieces shared by the charts: legend and the key-figure blocks on the right. */
import { esc, fmt, change, signed } from "../format.js";

/** items: [{ label, cls?, style? }] — style/cls come from chart code, never from data. */
export function setLegend(ctx, items) {
  ctx.legend.innerHTML = items.map((i) => `<li><i class="${i.cls || ""}" style="${i.style || ""}"></i>${esc(i.label)}</li>`).join("");
}

/** stats: [{ label, value, sub? } | { label, value, prev, compare, showPrev? }]; format = the chart's value format. */
export function sideStats(ctx, stats, format = "money") {
  ctx.side.innerHTML = stats
    .map((s) => {
      const f = s.format || format;
      const diff = f === "percent" ? `${signed(s.value - s.prev)} pts` : `${signed(change(s.value, s.prev))}%`;
      const sub = s.sub
        ? esc(s.sub)
        : typeof s.prev === "number" && s.prev !== 0
          ? `${diff} ${esc(s.compare || "vs last year")}${s.showPrev ? ` (${fmt(s.prev, f)})` : ""}`
          : "";
      return `
      <div class="stat">
        <span class="stat__label">${esc(s.label)}</span>
        <span class="stat__value ">${fmt(s.value, f)}</span>
        ${sub ? `<span class="stat__sub">${sub}</span>` : ""}
      </div>`;
    })
    .join("");
}
