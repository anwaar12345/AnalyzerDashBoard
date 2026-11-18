/* Entry point: load a Dashboard JSON, check it, build the views and start the router. */
import { esc, setNumberFormat } from "./format.js";
import { validate } from "./validate.js";
import { renderShell } from "./shell.js";
import { startRouter, goTo } from "./router.js";
import { mountUpload } from "./upload.js";
import { mountReview, openReview } from "./review.js";
import * as overview from "./widgets/overview.js";
import * as ranking from "./widgets/ranking.js";
import * as shares from "./widgets/shares.js";
import * as tabs from "./widgets/tabs.js";
import * as balance from "./widgets/balance.js";
import * as notes from "./widgets/notes.js";

const WIDGETS = { ranking, shares, tabs, balance, notes };
const SAMPLE = "samples/alphabet-q3-2026.json";
const SAVED = "insights.lastDashboard"; // last uploaded dashboard, kept in this browser only
const SAVED_REVIEW = "insights.lastReview"; // tables behind it, so they can be reviewed again

/** Builds one <section> per view (before the static views). Returns { viewId: onShow }. */
function renderViews(d) {
  const main = document.querySelector(".main");
  const firstStatic = main.querySelector('[data-view="upload"]');
  main.querySelectorAll("[data-view]:not([data-static])").forEach((v) => v.remove());
  const onShow = {};

  for (const view of d.views) {
    const section = document.createElement("section");
    section.className = "view";
    section.dataset.view = view.id;
    section.setAttribute("aria-label", view.title);
    section.tabIndex = -1;
    section.hidden = true;
    firstStatic.before(section);

    if (view.type === "overview") {
      section.innerHTML = overview.render(view);
      overview.mount(section, view);
      continue;
    }

    // One widget fills the view; two or more sit side by side
    const html = view.widgets.map((w) => WIDGETS[w.type].render(w)).join("");
    section.innerHTML = view.widgets.length > 1 ? `<div class="grid grid--revenue">${html}</div>` : html;

    const cards = section.querySelectorAll(":scope > article, :scope > .grid > article");
    const hooks = view.widgets.map((w, i) => WIDGETS[w.type].mount?.(cards[i], w)?.show).filter(Boolean);
    if (hooks.length) onShow[view.id] = () => hooks.forEach((fn) => fn());
  }
  return onShow;
}

function renderError(title, problems) {
  document.querySelector(".main").insertAdjacentHTML(
    "afterbegin",
    `<article class="card">
      <h2>${esc(title)}</h2>
      ${problems.map((p) => `<p class="muted small">${esc(p)}</p>`).join("")}
    </article>`
  );
}

/** Renders a dashboard. Returns the list of problems ([] = loaded). */
export function loadDashboard(d) {
  const problems = validate(d);
  if (problems.length) return problems;

  setNumberFormat(d.meta);
  renderShell(d);
  const onShow = renderViews(d);
  const appTitle = d.meta.name.includes(d.meta.period) ? d.meta.name : `${d.meta.name} ${d.meta.period}`;
  startRouter({ views: d.views, appTitle, onShow });
  return [];
}

/** Small wrapper around localStorage (kept in this browser only; may be blocked or full). */
const store = (key) => ({
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set: (value) => {
    try {
      value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key);
    } catch {
      /* storage full or blocked: everything still works for this visit */
    }
  },
});
const storage = store(SAVED);
const savedReview = store(SAVED_REVIEW);

async function loadSample() {
  const res = await fetch(SAMPLE);
  if (!res.ok) throw new Error(`${SAMPLE} returned ${res.status}`);
  return loadDashboard(await res.json());
}

// Links that open a tabs widget on a specific tab (e.g. "Explore segment profit")
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-tab]");
  if (link) document.querySelector(`[data-chart="${CSS.escape(link.dataset.tab)}"]`)?.click();
});

/** Shows a new dashboard, remembers it (and the tables it came from) and opens its first view. */
function useDashboard(d, review) {
  const problems = loadDashboard(d);
  if (!problems.length) {
    storage.set(d);
    if (review) savedReview.set(review);
    goTo(d.views[0].id);
  }
  return problems;
}

mountReview(document.querySelector('[data-view="review"]'), {
  onBuilt: (d, warnings, review) => useDashboard(d, review),
  onCancel: () => goTo("upload"),
});

mountUpload(document.querySelector('[data-view="upload"]'), {
  onDashboard: useDashboard,
  onReview: (review) => {
    savedReview.set(review);
    openReview(review);
    goTo("review");
  },
  onReopen: () => {
    openReview(savedReview.get());
    goTo("review");
  },
  hasSavedReview: () => Boolean(savedReview.get()),
  onSample: async () => {
    storage.set(null);
    await loadSample();
    goTo("overview");
  },
});

// A review in progress survives a page refresh
if (savedReview.get()) openReview(savedReview.get());

try {
  // Show the last uploaded dashboard if there is one, otherwise the Alphabet example
  const saved = storage.get();
  const problems = saved ? loadDashboard(saved) : await loadSample();
  if (saved && problems.length) {
    storage.set(null);
    await loadSample();
  } else if (problems.length) {
    renderError("This dashboard file has problems", problems.slice(0, 10));
  }
} catch (err) {
  renderError("Could not load the dashboard", [err.message]);
}
