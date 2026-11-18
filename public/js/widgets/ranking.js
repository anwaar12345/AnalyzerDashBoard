/* Ranking widget: list of items with value and change, sortable by size or growth.
   Items without a previous value show no change, and the sort buttons hide when none have one. */
import { esc, fmt, change, deltaChip, hasPrev } from "../format.js";
import { pillGroup, ITEM_ICONS } from "../ui.js";

export function render(w) {
  const canSort = w.items.some(hasPrev);
  return `
    <article class="card">
      <div class="card__head">
        <h2>${esc(w.title)}</h2>
        ${w.aside ? `<span class="muted small">${esc(w.aside)}</span>` : ""}
      </div>
      ${canSort
        ? `<div class="pills pills--sm" role="tablist" aria-label="Sort ${esc(w.title.toLowerCase())}">
        <button class="pill is-active" data-sort="size" role="tab" aria-selected="true">Largest</button>
        <button class="pill" data-sort="growth" role="tab" aria-selected="false">Fastest growing</button>
      </div>`
        : ""}
      <ul class="list" data-ref="list"></ul>
    </article>`;
}

export function mount(card, w) {
  const list = card.querySelector('[data-ref="list"]');
  const growth = (it) => (hasPrev(it) && it.prev !== 0 ? change(it.cur, it.prev) : -Infinity);

  const show = (sortBy) => {
    const rows = [...w.items].sort((a, b) => (sortBy === "growth" ? growth(b) - growth(a) : b.cur - a.cur));
    list.innerHTML = rows
      .map((r) => {
        const d = deltaChip(r.cur, r.prev, r.invert);
        return `
      <li>
        <span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ITEM_ICONS[r.icon] || ITEM_ICONS.spark}</svg></span>
        <span><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(r.sub)}</span></span>
        <span class="val">${fmt(r.cur, w.format)}${d.text ? `<small class="${d.tone}">${d.text}</small>` : ""}</span>
      </li>`;
      })
      .join("");
  };

  show("size");
  pillGroup(card, "[data-sort]", "sort", show);
  return {};
}
