/* Overview view: period toggle, quote, hero metric + mix bar, insight card, key metric tiles. */
import { esc, richText, fmt, signed, sum, deltaChip, hasPrev } from "../format.js";
import { pillGroup } from "../ui.js";

const MIX_COLORS = ["var(--accent-2)", "var(--accent)", "#f6e3f0", "var(--series-3)", "#b9a4b4"];

export function render(view) {
  const { periods, quote, hero, mix, insight, tiles } = view;

  const periodPills =
    periods.length > 1
      ? `<div class="pills" role="tablist" aria-label="Period">
          ${periods.map((p, i) => `<button class="pill pill--solid${i ? "" : " is-active"}" data-period="${esc(p.id)}" role="tab" aria-selected="${!i}">${esc(p.label)}</button>`).join("")}
        </div>`
      : "";

  const quoteHtml = quote
    ? `<p class="quote">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6" /></svg>
          “${esc(quote.text)}”${quote.author ? `, ${esc(quote.author)}` : ""}
        </p>`
    : "";

  const toolbar = periodPills || quoteHtml ? `<div class="toolbar">${periodPills}${quoteHtml}</div>` : "";

  const insightHtml = insight
    ? `<article class="card card--insight">
          <h2>${esc(insight.title)}</h2>
          <p class="muted">${richText(insight.text)}</p>
          ${insight.action ? `<a class="btn-glow" href="#/${esc(insight.action.view)}"${insight.action.tab ? ` data-tab="${esc(insight.action.tab)}"` : ""}>${esc(insight.action.label)}</a>` : ""}
        </article>`
    : "";

  return `
    ${toolbar}
    <div class="grid grid--overview">
      <div class="stack">
        <article class="card card--glass">
          <div class="card__head">
            <h2>${esc(hero.title)}</h2>
            <span class="tag" data-ref="tag"></span>
          </div>
          <p class="hero-value" data-ref="heroValue"></p>
          <p class="delta-line"><span class="chip" data-ref="heroDelta"></span> <span class="muted" data-ref="heroCompare"></span></p>
          ${mix ? mixHtml(mix) : ""}
        </article>
        ${insightHtml}
      </div>
      <article class="card card--tiles">
        <div class="card__head">
          <h2>${esc(tiles.title)}</h2>
          ${tiles.link ? `<a class="pill" href="#/${esc(tiles.link.view)}">${esc(tiles.link.label)}</a>` : ""}
        </div>
        <div class="tiles" data-ref="tiles"></div>
      </article>
    </div>`;
}

function mixHtml(mix) {
  const total = sum(mix.items.map((s) => s.value));
  const bar = mix.items
    .map((s, i) => `<span style="flex:${Number(s.value)};background:${MIX_COLORS[i % MIX_COLORS.length]}" title="${esc(s.name)}"></span>`)
    .join("");
  const legend = mix.items
    .map((s, i) => {
      const share = (s.value / total) * 100;
      return `<li><i style="background:${MIX_COLORS[i % MIX_COLORS.length]}"></i>${esc(s.name)} ${share < 1 ? share.toFixed(1) : share.toFixed(0)}%</li>`;
    })
    .join("");
  return `<div class="mix" aria-label="${esc(mix.label)}">${bar}</div>
          <ul class="mix-legend">${legend}</ul>`;
}

/** One tile's text for the chosen period (prev is optional). */
function tileValues(item, metrics) {
  if (item.ratio) {
    const [top, bottom] = item.ratio.map((k) => metrics[k]);
    const cur = (top.cur / bottom.cur) * 100;
    const prev = hasPrev(top) && hasPrev(bottom) ? (top.prev / bottom.prev) * 100 : undefined;
    return percentTile(cur, prev);
  }
  const m = metrics[item.metric];
  if (item.format === "percent") return percentTile(m.cur, m.prev);
  return { value: fmt(m.cur, item.format), prev: hasPrev(m) ? fmt(m.prev, item.format) : "", ...deltaChip(m.cur, m.prev, m.invert) };
}

function percentTile(cur, prev) {
  if (typeof prev !== "number") return { value: `${cur.toFixed(1)}%`, prev: "", text: "", tone: "" };
  const diff = cur - prev;
  return { value: `${cur.toFixed(1)}%`, prev: `${prev.toFixed(1)}%`, text: `${signed(diff)} pts`, tone: diff >= 0 ? "pos" : "neg" };
}

export function mount(section, view) {
  const ref = (name) => section.querySelector(`[data-ref="${name}"]`);

  const showPeriod = (id) => {
    const p = view.periods.find((x) => x.id === id) || view.periods[0];
    const h = p.metrics[view.hero.metric];
    const d = deltaChip(h.cur, h.prev, h.invert);
    const deltaLabel = p.deltaLabel ?? "YoY";
    const prevLabel = p.prevLabel ?? "Last year";

    ref("tag").textContent = p.tag;
    ref("heroValue").textContent = fmt(h.cur, view.hero.format);
    ref("heroDelta").textContent = d.text;
    ref("heroDelta").className = `chip ${d.tone}`;
    if (d.text) ref("heroDelta").removeAttribute("style");
    else ref("heroDelta").style.display = "none";
    ref("heroCompare").textContent = hasPrev(h) ? `${p.compare} (${fmt(h.prev, view.hero.format)})` : "";

    ref("tiles").innerHTML = view.tiles.items
      .map((item) => {
        const t = tileValues(item, p.metrics);
        return `
      <div class="tile">
        <span class="tile__value">${esc(t.value)}</span>
        ${t.text ? `<span class="tile__delta ${t.tone}">${esc(t.text)} ${esc(deltaLabel)}</span>` : ""}
        <div class="tile__foot"><b>${esc(item.label)}</b>${t.prev ? `<span>${esc(prevLabel)} ${esc(t.prev)}</span>` : ""}</div>
      </div>`;
      })
      .join("");
  };

  showPeriod(view.periods[0].id);
  pillGroup(section, "[data-period]", "period", showPeriod);
  return {};
}
