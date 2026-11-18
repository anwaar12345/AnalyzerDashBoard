/* Small UI pieces shared by widgets: icons, pill groups, tooltip. */

// Sidebar view icons (same artwork as before)
export const VIEW_ICONS = {
  overview: '<circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 8 8h-8z" />',
  bars: '<path d="M5 20V10M12 20V4M19 20v-7" />',
  trend: '<path d="M4 17l5-5 4 4 7-8" /><rect x="3" y="3" width="18" height="18" rx="3" />',
  scale: '<path d="M12 3v18M5 7h14M5 7l-2 6h4zM19 7l-2 6h4z" />',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />',
};

// Icons for list rows (ranking widget)
export const ITEM_ICONS = {
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  device: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>',
  network: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v5M12 12l-6 5M12 12l6 5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
};

/** Pill buttons inside `root` matching `selector`: one active at a time, calls onSelect(value). */
export function pillGroup(root, selector, attr, onSelect) {
  const pills = root.querySelectorAll(selector);
  pills.forEach((pill) =>
    pill.addEventListener("click", () => {
      pills.forEach((p) => {
        const active = p === pill;
        p.classList.toggle("is-active", active);
        p.setAttribute("aria-selected", active);
      });
      onSelect(pill.dataset[attr]);
    })
  );
}

/** Show the card's tooltip next to `anchor`. `html` must already be escaped. */
export function showTooltip(tip, html, anchor) {
  tip.innerHTML = html;
  tip.hidden = false;
  const card = tip.parentElement.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, a.left - card.left + a.width / 2 + 14), card.width - tip.offsetWidth - 8);
  tip.style.left = `${left}px`;
  tip.style.top = `${a.top - card.top + 4}px`;
}

export const hideTooltip = (tip) => {
  if (tip) tip.hidden = true;
};
