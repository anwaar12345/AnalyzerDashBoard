/* Balance widget: summary strip + bars comparing two dates.
   Chips are neutral: a bigger balance-sheet line is not good or bad by itself (e.g. debt). */
import { esc, money, deltaChip } from "../format.js";

export function render(w) {
  const max = Math.max(...w.rows.map((r) => r.cur));

  const summary = (w.summary || [])
    .map(
      (s) => `
    <div class="stat">
      <span class="stat__label">${esc(s.label)}</span>
      <span class="stat__value">${money(s.cur)}</span>
      <span class="stat__sub"><span class="chip neutral">${deltaChip(s.cur, s.prev).text}</span> ${esc(s.note)}</span>
    </div>`
    )
    .join("");

  const rows = w.rows
    .map(
      (r) => `
      <li>
        <div class="row-head">
          <span>${esc(r.name)}</span>
          <span class="row-values"><span class="muted">${money(r.prev)} →</span> <b>${money(r.cur)}</b> <span class="chip neutral">${deltaChip(r.cur, r.prev).text}</span></span>
        </div>
        <div class="track" aria-hidden="true">
          <span class="cur" style="width:${(r.cur / max) * 100}%"></span>
          <span class="prev" style="width:${(r.prev / max) * 100}%"></span>
        </div>
      </li>`
    )
    .join("");

  return `
    <article class="card">
      <div class="card__head">
        <h2>${esc(w.title)}</h2>
        <span class="muted small">${esc(w.from)} → ${esc(w.to)}</span>
      </div>
      ${summary ? `<div class="summary">${summary}</div>` : ""}
      <ul class="bars">${rows}</ul>
    </article>`;
}
