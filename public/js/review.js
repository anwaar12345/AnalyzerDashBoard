/* Review view: shows the tables read from a file, lets the user fix them, then builds the dashboard.
   Checks (totals, empty cells, outliers) run again on every edit. */
import { esc } from "./format.js";
import { checkTable, parseNumberText } from "./checks.js";

const UNITS = ["ones", "thousands", "millions", "billions"];
const CURRENCIES = ["", "USD", "EUR", "GBP", "PKR", "INR"];
const KINDS = [["auto", "Auto"], ["parts", "Parts of a whole"], ["measures", "Different measures"]];
const MAX_SHOWN = 100; // rows shown for editing; the rest are kept as they are

let state = null; // the review being edited
let root = null;
let callbacks = {};

/** section: the static review <section>; onBuilt(dashboard, warnings); onCancel() */
export function mountReview(section, cbs) {
  root = section;
  callbacks = cbs;
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  render();
}

/** Opens a review payload from the server (or a saved one). */
export function openReview(review) {
  state = structuredClone(review);
  render();
}

export const hasReview = () => Boolean(state);
export const currentReview = () => state;

// ---------- Rendering ----------
function render() {
  if (!root) return;
  if (!state) {
    root.innerHTML = `
      <article class="card">
        <div class="card__head"><h2>Review the Numbers</h2></div>
        <p class="muted">Nothing to review yet. Upload a file first.</p>
        <p><a class="btn-glow" href="#/upload">Upload a file</a></p>
      </article>`;
    return;
  }

  const kept = state.tables.filter((t) => t.include).length;
  root.innerHTML = `
    <article class="card review__intro">
      <div class="card__head">
        <h2>Review the Numbers</h2>
        <span class="tag">${kept} of ${state.tables.length} tables</span>
      </div>
      <p class="muted">${
        state.viaAi
          ? `AI read these tables from <b>${esc(state.fileName)}</b>. Fix anything that looks wrong, untick tables you don't need, then build the dashboard.`
          : `These tables were read from <b>${esc(state.fileName)}</b>. Edit them if needed and rebuild the dashboard.`
      }</p>
      <div class="review__controls">
        <label>Amounts in
          <select data-act="unit">${UNITS.map((u) => `<option value="${u}"${u === state.unit ? " selected" : ""}>${u}</option>`).join("")}</select>
        </label>
        <label>Currency
          <select data-act="currency">${CURRENCIES.map((c) => `<option value="${c}"${c === (state.currency || "") ? " selected" : ""}>${c || "None"}</option>`).join("")}</select>
        </label>
        <span class="review__spacer"></span>
        <button class="pill" type="button" data-act="cancel">Cancel</button>
        <button class="btn-glow" type="button" data-act="build">Build dashboard</button>
      </div>
      <p class="upload__status" data-ref="status" role="status" aria-live="polite"></p>
    </article>
    ${state.tables.map(tableCard).join("")}`;
}

function tableCard(t, ti) {
  const checks = checkTable(t);
  // The "Cost" switch only makes sense for named rows (Revenue, Costs…), not for periods (Jan 2025, Q3…)
  const periodLike = /^((q[1-4]|h[12]|fy)\b|(19|20)\d{2}\b|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\s+[a-z]{3}\s+\d{4})/i;
  const labelled = t.rows.some((r) => typeof r[0] === "string" && parseNumberText(r[0]) === null && !periodLike.test(r[0].trim()));
  const shown = t.rows.slice(0, MAX_SHOWN);

  const head = `<tr>
      ${labelled ? `<th class="review__mark" title="Mark rows whose rise is bad news, e.g. costs">Cost</th>` : ""}
      ${t.columns.map((c, ci) => `<th><input data-act="col" data-t="${ti}" data-c="${ci}" value="${esc(c)}" aria-label="Column ${ci + 1} name" /></th>`).join("")}
      <th></th>
    </tr>`;

  const body = shown
    .map((r, ri) => `<tr>
      ${labelled ? `<td><button type="button" class="review__cost${t.lowerBetter[ri] ? " is-on" : ""}" data-act="lower" data-t="${ti}" data-r="${ri}" aria-pressed="${Boolean(t.lowerBetter[ri])}" title="Rise is bad news (cost, debt)">↓</button></td>` : ""}
      ${t.columns.map((_, ci) => cellHtml(r[ci], ti, ri, ci, checks.cells[`${ri},${ci}`])).join("")}
      <td><button type="button" class="review__del" data-act="delrow" data-t="${ti}" data-r="${ri}" aria-label="Remove row" title="Remove row">×</button></td>
    </tr>`)
    .join("");

  const total = t.total
    ? `<tr class="review__total">
        ${labelled ? "<td></td>" : ""}
        ${t.columns.map((_, ci) => `<td>${ci === 0 ? "Document total" : esc(display(t.total[ci]))}</td>`).join("")}
        <td></td>
      </tr>`
    : "";

  return `
    <article class="card review__card${t.include ? "" : " is-off"}" data-card="${ti}">
      <div class="review__head">
        <label class="review__include" title="Use this table in the dashboard">
          <input type="checkbox" data-act="include" data-t="${ti}"${t.include ? " checked" : ""} /> Use
        </label>
        <input class="review__name" data-act="name" data-t="${ti}" value="${esc(t.name)}" aria-label="Table name" />
        ${t.source ? `<span class="tag">${esc(t.source)}</span>` : ""}
        <select data-act="kind" data-t="${ti}" aria-label="What the rows are">
          ${KINDS.map(([v, label]) => `<option value="${v}"${v === t.kind ? " selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <ul class="review__notes" data-notes="${ti}">${notesHtml(checks.notes)}</ul>
      <div class="review__scroll">
        <table class="review__table">
          <thead>${head}</thead>
          <tbody>${body}${total}</tbody>
        </table>
      </div>
      ${t.rows.length > MAX_SHOWN ? `<p class="muted small">Showing the first ${MAX_SHOWN} of ${t.rows.length.toLocaleString("en-US")} rows. The other rows are kept as they are.</p>` : ""}
    </article>`;
}

function cellHtml(value, ti, ri, ci, problem) {
  return `<td class="${problem ? "is-flagged" : ""}"${problem ? ` title="${esc(problem)}"` : ""}>
        <input data-act="cell" data-t="${ti}" data-r="${ri}" data-c="${ci}" value="${esc(display(value))}"${ci ? ' inputmode="decimal"' : ""} aria-label="Row ${ri + 1}, ${esc(state.tables[ti].columns[ci])}" />
      </td>`;
}

const notesHtml = (notes) => (notes.length ? notes : [{ tone: "pos", text: "No problems found." }]).map((n) => `<li class="${n.tone}">${esc(n.text)}</li>`).join("");
const display = (v) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : v ?? "");

/** Re-runs the checks for one table and updates its highlights without rebuilding inputs (keeps focus). */
function refreshChecks(ti) {
  const t = state.tables[ti];
  const checks = checkTable(t);
  root.querySelector(`[data-notes="${ti}"]`).innerHTML = notesHtml(checks.notes);
  root.querySelectorAll(`input[data-act="cell"][data-t="${ti}"]`).forEach((input) => {
    const problem = checks.cells[`${input.dataset.r},${input.dataset.c}`];
    const td = input.parentElement;
    td.classList.toggle("is-flagged", Boolean(problem));
    problem ? td.setAttribute("title", problem) : td.removeAttribute("title");
  });
}

// ---------- Editing ----------
function onInput(e) {
  const el = e.target;
  const t = state?.tables[el.dataset.t];
  if (!t) return;
  if (el.dataset.act === "cell") {
    const raw = el.value.trim();
    const n = parseNumberText(raw);
    t.rows[el.dataset.r][el.dataset.c] = raw === "" ? null : Number(el.dataset.c) > 0 && n !== null ? n : raw;
    refreshChecks(Number(el.dataset.t));
  }
  if (el.dataset.act === "col") t.columns[el.dataset.c] = el.value.trim() || `Column ${Number(el.dataset.c) + 1}`;
  if (el.dataset.act === "name") t.name = el.value.trim() || t.name;
}

function onChange(e) {
  const el = e.target;
  if (!state) return;
  if (el.dataset.act === "unit") state.unit = el.value;
  if (el.dataset.act === "currency") state.currency = el.value || null;
  const t = state.tables[el.dataset.t];
  if (!t) return;
  if (el.dataset.act === "kind") {
    t.kind = el.value;
    refreshChecks(Number(el.dataset.t)); // the total check depends on the kind
  }
  if (el.dataset.act === "include") {
    t.include = el.checked;
    root.querySelector(`[data-card="${el.dataset.t}"]`).classList.toggle("is-off", !el.checked);
    root.querySelector(".review__intro .tag").textContent = `${state.tables.filter((x) => x.include).length} of ${state.tables.length} tables`;
  }
}

function onClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn || !state) return;
  const ti = Number(btn.dataset.t);
  const t = state.tables[ti];

  if (btn.dataset.act === "lower") {
    t.lowerBetter[btn.dataset.r] = !t.lowerBetter[btn.dataset.r];
    btn.classList.toggle("is-on");
    btn.setAttribute("aria-pressed", t.lowerBetter[btn.dataset.r]);
  }
  if (btn.dataset.act === "delrow") {
    t.rows.splice(btn.dataset.r, 1);
    t.lowerBetter.splice(btn.dataset.r, 1);
    root.querySelector(`[data-card="${ti}"]`).outerHTML = tableCard(t, ti);
  }
  if (btn.dataset.act === "cancel") callbacks.onCancel?.();
  if (btn.dataset.act === "build") build(btn);
}

async function build(btn) {
  const status = root.querySelector('[data-ref="status"]');
  const say = (html, tone = "") => {
    status.className = `upload__status ${tone}`;
    status.innerHTML = html;
  };
  if (!state.tables.some((t) => t.include)) return say("Tick at least one table to build a dashboard.", "neg");

  btn.disabled = true;
  say("Building your dashboard…");
  try {
    const res = await fetch("/api/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Build failed (${res.status}).`);
    const problems = callbacks.onBuilt(data.dashboard, data.warnings || [], state);
    if (problems?.length) say(`The dashboard data has problems:<br>${problems.slice(0, 5).map(esc).join("<br>")}`, "neg");
  } catch (err) {
    say(esc(err.message || "Build failed. Please try again."), "neg");
  } finally {
    btn.disabled = false;
  }
}
