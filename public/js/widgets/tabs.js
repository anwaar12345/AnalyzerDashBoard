/* Tabs widget: one card, several charts (each = visual on the left + key figures on the right). */
import { esc } from "../format.js";
import { pillGroup, hideTooltip } from "../ui.js";
import * as gapLines from "../charts/gap-lines.js";
import * as geo from "../charts/geo.js";
import * as slope from "../charts/slope.js";
import * as lines from "../charts/lines.js";

const CHARTS = { gapLines, geo, slope, lines };
// CSS modifier per chart type (geography lets the map set its own height)
const VISUAL_CLASS = { gapLines: "cashflow", geo: "geography", slope: "segments", lines: "lines" };

export function render(w) {
  return `
    <article class="card card--chart">
      <div class="card__head card__head--wrap">
        <div>
          <h2 data-ref="title">${esc(w.tabs[0].title)}</h2>
          <p class="muted small" data-ref="note"></p>
        </div>
        <div class="pills" role="tablist" aria-label="Chart">
          ${w.tabs.map((t, i) => `<button class="pill${i ? "" : " is-active"}" data-chart="${esc(t.id)}" role="tab" aria-selected="${!i}">${esc(t.label)}</button>`).join("")}
        </div>
      </div>
      <ul class="legend" data-ref="legend"></ul>
      <div class="breakdown">
        <div class="breakdown__visual" data-ref="visual"></div>
        <aside class="breakdown__side" data-ref="side" aria-label="Key figures"></aside>
      </div>
      <div class="tooltip" role="status" hidden></div>
    </article>`;
}

export function mount(card, w) {
  const ref = (name) => card.querySelector(`[data-ref="${name}"]`);
  const ctx = { card, visual: ref("visual"), side: ref("side"), legend: ref("legend"), tip: card.querySelector(".tooltip") };
  let current = w.tabs[0];

  // Charts measure their container, so they are drawn only while visible
  const draw = (animate = false) => {
    if (card.closest("[hidden]")) return;
    ref("title").textContent = current.title;
    ref("note").textContent = current.note || "";
    ctx.visual.className = `breakdown__visual breakdown__visual--${VISUAL_CLASS[current.chart]}${animate ? " animate" : ""}`;
    hideTooltip(ctx.tip);
    CHARTS[current.chart].draw(ctx, current);
  };

  pillGroup(card, "[data-chart]", "chart", (id) => {
    current = w.tabs.find((t) => t.id === id);
    draw(true);
  });

  // Redraw on resize (no animation); the map scales by itself
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width && lastWidth && width !== lastWidth && current.chart !== "geo") draw();
    lastWidth = width;
  }).observe(ctx.visual);

  return { show: () => draw(true) };
}
