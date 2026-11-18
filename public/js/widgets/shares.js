/* Shares widget: each part's value, share of the total and change (e.g. revenue by segment). */
import { esc, fmt, sum, deltaChip, hasPrev } from "../format.js";

export function render(w) {
  const total = sum(w.items.map((s) => s.cur));
  const deltaLabel = w.deltaLabel ?? "YoY";
  const prevLabel = w.prevLabel ?? "last year";

  const rows = w.items
    .map((s) => {
      const d = deltaChip(s.cur, s.prev, s.invert);
      const share = (s.cur / total) * 100;
      const changeText = hasPrev(s)
        ? `<span>${d.text ? `<span class="${d.tone}">${d.text} ${esc(deltaLabel)}</span> · ` : ""}${esc(prevLabel)} ${fmt(s.prev, w.format)}</span>`
        : "";
      return `
      <li class="segment">
        <div class="segment__head"><span>${esc(s.name)}</span><b>${fmt(s.cur, w.format)}</b></div>
        ${s.text ? `<p class="segment__text">${esc(s.text)}</p>` : ""}
        <div class="track" aria-hidden="true"><span class="cur" style="width:${Math.max(share, 0.6)}%"></span></div>
        <div class="segment__foot">
          <span>${share.toFixed(1)}% ${esc(w.shareLabel || "of total")}</span>
          ${changeText}
        </div>
      </li>`;
    })
    .join("");

  return `
    <article class="card">
      <div class="card__head">
        <h2>${esc(w.title)}</h2>
        ${w.aside ? `<span class="muted small">${esc(w.aside)}</span>` : ""}
      </div>
      <ul class="segments">${rows}</ul>
      ${w.note ? `<p class="muted small segments__note">${esc(w.note)}</p>` : ""}
    </article>`;
}
