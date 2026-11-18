/* Notes widget: short highlight cards (title, value, explanation). */
import { esc, change, signed } from "../format.js";

const TONES = ["pos", "neg"];

export function render(w) {
  const count = w.count
    ? `<span class="muted small">${w.count.cur.toLocaleString("en-US")} ${esc(w.count.label)} (${signed(change(w.count.cur, w.count.prev))}%)</span>`
    : "";

  const items = w.items
    .map(
      (h) => `
      <li>
        <strong>${esc(h.title)}</strong>
        <span class="val ${TONES.includes(h.tone) ? h.tone : ""}">${esc(h.value)}</span>
        <p>${esc(h.text)}</p>
      </li>`
    )
    .join("");

  return `
    <article class="card">
      <div class="card__head">
        <h2>${esc(w.title)}</h2>
        ${count}
      </div>
      <ul class="notes">${items}</ul>
    </article>`;
}
