/* One view at a time, hash routes (#/revenue) so back/forward, refresh and shared links work. */

// Screens that are always there, whatever the data
const STATIC_VIEWS = [
  { id: "upload", title: "Upload file", subtitle: "Build a dashboard from your own spreadsheet, PDF, Word file or image" },
  { id: "review", title: "Review the numbers", subtitle: "Check and fix the figures before the dashboard is built" },
  { id: "help", title: "How to use", subtitle: "A quick guide to this dashboard" },
];

let config = { views: [], appTitle: "", onShow: {} };
let current = null;
let listening = false;

const allViews = () => [...config.views, ...STATIC_VIEWS];

function fromHash() {
  const id = location.hash.replace(/^#\/?/, "");
  return allViews().find((v) => v.id === id) || allViews()[0];
}

function show(view, { focus = false } = {}) {
  if (view.id === current) return;
  current = view.id;

  document.querySelectorAll("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== view.id));

  document.querySelectorAll("[data-route]").forEach((a) => {
    const active = a.dataset.route === view.id;
    a.classList.toggle("active", active);
    if (!active) return a.removeAttribute("aria-current");
    a.setAttribute("aria-current", "page");
    // Phone/tablet: keep the active tab visible in the horizontal nav
    const nav = a.parentElement;
    if (nav.scrollWidth > nav.clientWidth) {
      const left = a.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - 16;
      nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  });

  const subtitle = document.querySelector('[data-ref="subtitle"]');
  if (subtitle) subtitle.textContent = view.subtitle || "";
  document.title = config.appTitle ? `${view.title} · ${config.appTitle}` : view.title;
  window.scrollTo({ top: 0, behavior: "instant" });

  config.onShow[view.id]?.();
  if (focus) document.querySelector(`[data-view="${view.id}"]`)?.focus({ preventScroll: true });
}

/**
 * views: [{ id, title, subtitle }] in menu order (the first one is the default)
 * onShow: { [viewId]: () => void } — e.g. draw charts once their view is visible
 * Can be called again after a new dashboard loads; it then re-shows the current route.
 */
export function startRouter(next) {
  config = next;
  current = null;
  show(fromHash());
  if (!listening) {
    addEventListener("hashchange", () => show(fromHash(), { focus: true }));
    listening = true;
  }
}

/** Go to a view; re-shows it if the address is already there. */
export function goTo(id) {
  if (location.hash === `#/${id}`) {
    current = null;
    show(fromHash());
  } else {
    location.hash = `#/${id}`;
  }
}
