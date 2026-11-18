/* Turns typed tables (from read-file.js) into a Dashboard JSON (version 1).
   Rules, not AI: the shape of the table decides the widgets.
     • period + numbers            → trend lines, latest vs previous period
     • category × period columns   → ranking, shares, slope, total trend   ("wide")
     • period + category + number  → pivoted into the wide shape          ("long")
     • category + numbers          → ranking and shares                    */

const PERIOD_HEADER = /^(?:(?:q[1-4]|h[12])[\s-]*(?:fy)?'?\d{2,4}|fy\s*'?\d{2,4}(?:\s*q[1-4])?|(?:19|20)\d{2}(?:\s*[-/ ]\s*(?:q[1-4]|h[12]|\d{1,2}))?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:[\s-]*'?\d{2,4})?)$/i;
const MONEY_NAME = /revenue|sales|cost|price|profit|income|expense|amount|spend|budget|value|ebitda|cash|earning|salary|fee|\$|usd|eur|gbp|pkr|inr/i;
const MAIN_NAME = /revenue|sales|income|total|amount|value|profit/i;
import { LOWER_IS_BETTER } from "../public/js/checks.js";

const SLOPE_COLORS = ["var(--series-2)", "var(--series-3)", "#b9a4b4", "var(--accent-2)", "#f6e3f0", "var(--neg)"];

export function buildDashboard({ tables, unit, currency, title, period, highlights = [], viaAi = false }, fileName) {
  const warnings = [];
  const analyses = tables.map((t) => analyse(t, currency, warnings)).filter(Boolean);
  if (!analyses.length) throw new Error("No usable data found");

  // The richest table drives the overview
  const rank = { long: 3, wide: 3, series: 2, categories: 1 };
  // Ties: prefer tables whose rows are parts of a whole (they can be totalled), then the bigger one
  analyses.sort((a, b) => rank[b.kind] - rank[a.kind] || Number(Boolean(b.partsOfWhole)) - Number(Boolean(a.partsOfWhole)) || b.size - a.size);
  const [primary, ...others] = analyses;
  // A statement table (revenue, operating income, net income…) makes the best overview; the parts table the breakdown
  // (a table with a revenue/sales row wins, e.g. the income summary over a cash-flow table)
  const hasRevenue = (a) => Number(a.items.some((it) => /revenue|sales/i.test(it.name)));
  const statement = others
    .filter((a) => (a.kind === "wide" || a.kind === "long") && !a.partsOfWhole)
    .sort((a, b) => hasRevenue(b) - hasRevenue(a))[0];
  const overviewSource = statement || primary;

  const name = title || fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Uploaded data";
  const ids = new Set(["overview", "highlights", "upload", "help"]);
  const uniqueId = (base) => {
    let id = slug(base) || "view";
    while (ids.has(id)) id += "-2";
    ids.add(id);
    return id;
  };

  const parts = buildParts(primary, uniqueId);
  // Other tables: one extra view each (up to 3)
  const extra = others.slice(0, 3).map((a) => ({ a, view: secondaryView(a, uniqueId) })).filter((x) => x.view);

  // The overview's "see more" button opens the view of the table the overview is built from
  const statementView = extra.find((x) => x.a === overviewSource)?.view;
  const statementTab = statementView?.widgets.find((w) => w.type === "tabs")?.tabs.find((t) => t.id === "compare");
  const target = statementView ? { mainView: statementView.id, mainTab: statementTab?.id } : parts;

  const views = [overviewView(overviewSource, target), ...parts.views, ...extra.map((x) => x.view)];
  views.push({
    id: "highlights",
    type: "widgets",
    title: "Highlights",
    icon: "star",
    subtitle: "What stands out in this file",
    // Facts stated in the document (from the AI) first, then what the numbers show
    widgets: [{ type: "notes", title: "What Stands Out", items: [...highlights, ...primary.insights].slice(0, 6) }],
  });

  const rows = tables.reduce((n, t) => n + t.rowCount, 0);
  return {
    dashboard: {
      version: 1,
      meta: {
        name: titleCase(name).slice(0, 40),
        company: titleCase(name).slice(0, 40),
        ticker: `${rows.toLocaleString("en-US")} rows · ${tables.length} ${tables.length > 1 ? "sheets" : "sheet"}`,
        // The document's own period ("Q3 2026") beats a column header ("2026")
        period: (viaAi && period) || primary.periodLabel || period || "Upload",
        currency: currency || null,
        unit,
        source: {
          label: fileName,
          notes: [
            viaAi
              ? `Tables were read from ${fileName} by AI (${tables.map((t) => t.source).filter(Boolean).slice(0, 4).join(", ") || "whole document"}). Check important figures against the document.`
              : `Built automatically from the columns of ${fileName}.`,
            `Uploaded ${new Date().toISOString().slice(0, 10)} · the file is not stored on the server.`,
            unit !== "ones" ? `Amounts in the file are in ${unit}.` : "Please double-check important figures against your file.",
          ],
        },
      },
      views,
    },
    warnings,
  };
}

// ---------- Step 1: understand one table ----------
function analyse(table, currency, warnings) {
  const period = table.columns.find((c) => c.kind === "period");
  const text = table.columns.find((c) => c.kind === "text");
  const numbers = table.columns.filter((c) => c.kind === "number").map((c) => normalise(c, currency));
  if (!numbers.length) return null;
  const main = pickMain(numbers.filter((c) => !c.percent)) || numbers[0];

  // Wide: categories in rows, periods as column headers (e.g. Product | 2023 | 2024 | 2025)
  const periodCols = numbers.filter((c) => PERIOD_HEADER.test(c.name) && !c.percent);
  if (text && periodCols.length >= 2) {
    // "Revenue by region" names the values better than a generic "Sheet1"
    // Prefer a title row ("Product sales (USD, in thousands)" → "Product sales"), then the sheet/table name
    const titled = (table.title || "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    const named = /^(sheet\s*\d*|data|table\s*\d*)$/i.test(table.name.trim()) ? "" : table.name;
    const valueName = (titled || named || "Value").replace(/\s+by\s+.*$/i, "");
    // Year/quarter columns carry no money word: use the table's own words and the file's currency instead
    const moneyTable = Boolean(currency) && (MONEY_NAME.test(`${table.name} ${table.title} ${text.values.join(" ")}`) || table.kind);
    const format = periodCols[0].format === "number" && moneyTable ? "money" : periodCols[0].format;
    return wide(table, labelName(text.name), text.values, periodCols.map((c) => c.name), periodCols.map((c) => c.values), format, valueName);
  }

  // Long: date | category | value → pivot to wide
  if (period && text && !main.percent) {
    const periods = unique(period.values.filter(Boolean));
    const cats = unique(text.values.filter(Boolean));
    if (periods.length >= 2 && cats.length >= 2 && cats.length <= 40) {
      const cols = periods.map((p) => cats.map((cat) => sumWhere(main.values, (i) => period.values[i] === p && text.values[i] === cat)));
      const a = wide(table, labelName(text.name), cats, periods, cols, main.format, main.name);
      a.kind = "long";
      return a;
    }
  }

  // Series: period + numbers (rows with the same period are added up)
  if (period) {
    const x = unique(period.values.filter(Boolean));
    if (x.length >= 2) {
      const cols = numbers
        .map((c) => ({ ...c, values: x.map((p) => (c.percent ? avgWhere : sumWhere)(c.values, (i) => period.values[i] === p)) }))
        .filter((c) => {
          const ok = c.values.filter((v) => v !== null).length >= x.length * 0.8;
          if (!ok) warnings.push(`Column "${c.name}" has too many empty cells and was skipped.`);
          return ok;
        })
        .map((c) => ({ ...c, values: fillGaps(c.values) }));
      if (cols.length) return series(table, period.name, x, cols);
    }
  }

  // Categories: label + numbers, one snapshot
  if (text) {
    const keep = text.values.map((v, i) => v && main.values[i] !== null);
    return categories(table, labelName(text.name), text.values.filter((_, i) => keep[i]), numbers.map((c) => ({ ...c, values: c.values.filter((_, i) => keep[i]) })), main.name);
  }
  return null;
}

function normalise(col, currency) {
  const money = Boolean(col.currency) || (Boolean(currency) && MONEY_NAME.test(col.name));
  let values = col.values;
  // Excel stores 12% as 0.12
  if (col.percent && values.every((v) => v === null || Math.abs(v) <= 1.5)) values = values.map((v) => (v === null ? null : v * 100));
  return { ...col, values, format: col.percent ? "percent" : money ? "money" : "number" };
}

function series(table, periodName, x, cols) {
  cols.forEach((c) => (c.invert = LOWER_IS_BETTER.test(c.name)));
  const main = pickMain(cols.filter((c) => !c.percent)) || cols[0];
  const n = x.length;
  const insights = [];
  // Percent columns (e.g. margin) change in points, not %, so they are not ranked as movers
  const movers = cols
    .filter((c) => !c.percent)
    .map((c) => ({ c, pct: change(c.values[n - 1], c.values[n - 2]) }))
    .filter((m) => m.pct !== null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  movers.slice(0, 3).forEach(({ c, pct }) =>
    insights.push({ title: `${c.name} ${pct >= 0 ? "rose" : "fell"}`, value: `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`, tone: (pct >= 0) !== Boolean(c.invert) ? "pos" : "neg", text: `${x[n - 1]} compared with ${x[n - 2]}.` })
  );
  const peak = main.values.indexOf(Math.max(...main.values));
  insights.push({ title: `Highest ${main.name.toLowerCase()}`, value: x[peak], tone: "neutral", text: `The peak across ${n} periods (${x[0]} – ${x[n - 1]}).` });
  return { kind: "series", table, size: n * cols.length, periodName, x, cols, main, periodLabel: x[n - 1], insights, movers };
}

function wide(table, categoryName, cats, periods, matrix, format, valueName = "Value") {
  const n = periods.length;
  const items = cats
    .map((name, i) => ({ name: String(name), cur: matrix[n - 1][i], prev: matrix[n - 2][i] }))
    .filter((it) => it.name && it.cur !== null);
  const lower = (name) => (table.lowerBetter ? table.lowerBetter.has(name) : LOWER_IS_BETTER.test(name));
  items.forEach((it) => {
    it.prev = it.prev ?? undefined;
    if (lower(it.name)) it.invert = true;
  });
  const totals = matrix.map((col) => col.reduce((s, v) => s + (v || 0), 0));
  const growth = items.filter((it) => typeof it.prev === "number" && it.prev !== 0).map((it) => ({ ...it, pct: change(it.cur, it.prev) })).sort((a, b) => b.pct - a.pct);
  const largest = [...items].sort((a, b) => b.cur - a.cur)[0];
  // Rows that can be added up (no negatives), e.g. revenue by region — unlike a statement mixing revenue, costs and profit
  const measures = /\b(income|profit|loss|expenses?|costs?|margin|ebitda|eps|earnings|net|cash flow|tax)\b/i;
  const mixed = items.some((it) => /revenue|sales/i.test(it.name)) && items.some((it) => measures.test(it.name));
  const partsOfWhole = table.kind ? table.kind === "parts" : !mixed && items.every((it) => it.cur >= 0 && (it.prev ?? 0) >= 0);
  const insights = [];
  const totalPct = change(totals[n - 1], totals[n - 2]);
  if (partsOfWhole && totalPct !== null) insights.push({ title: `Total ${totalPct >= 0 ? "grew" : "fell"}`, value: `${totalPct >= 0 ? "+" : "−"}${Math.abs(totalPct).toFixed(1)}%`, tone: totalPct >= 0 ? "pos" : "neg", text: `${periods[n - 1]} compared with ${periods[n - 2]}.` });
  if (growth[0] && growth[0].pct > 0) insights.push({ title: `Fastest growing: ${growth[0].name}`, value: pctText(growth[0].pct), tone: growth[0].invert ? "neg" : "pos", text: `Largest increase among ${items.length} ${categoryName.toLowerCase()} values.` });
  const worst = growth.at(-1);
  if (worst && worst.pct < 0) insights.push({ title: `Biggest decline: ${worst.name}`, value: pctText(worst.pct), tone: worst.invert ? "pos" : "neg", text: `${periods[n - 1]} compared with ${periods[n - 2]}.` });
  if (partsOfWhole && largest) insights.push({ title: `Largest: ${largest.name}`, value: `${((largest.cur / totals[n - 1]) * 100).toFixed(1)}%`, tone: "neutral", text: `Share of the ${periods[n - 1]} total.` });
  return { kind: "wide", table, size: items.length * n, partsOfWhole, categoryName, valueName, periods, items, totals, format, growth, largest, periodLabel: periods[n - 1], insights };
}

function categories(table, categoryName, names, cols, mainName) {
  const main = cols.find((c) => c.name === mainName) || cols[0];
  const items = names.map((name, i) => ({ name: String(name), cur: main.values[i] })).filter((it) => it.cur !== null);
  const total = items.reduce((s, it) => s + it.cur, 0);
  const largest = [...items].sort((a, b) => b.cur - a.cur)[0];
  const insights = [
    { title: `Largest: ${largest.name}`, value: total ? `${((largest.cur / total) * 100).toFixed(1)}%` : "—", tone: "neutral", text: `Share of all ${main.name.toLowerCase()}.` },
    { title: `${items.length} ${categoryName.toLowerCase()} values`, value: String(items.length), tone: "neutral", text: `Across the ${table.name} sheet.` },
  ];
  return { kind: "categories", table, size: items.length * cols.length, categoryName, cols, main, items, total, largest, insights };
}

// ---------- Step 2: widgets and views ----------
function buildParts(a, uniqueId, label) {
  const views = [];
  const prefix = label ? `${label} · ` : "";

  if (a.kind === "series") {
    const tabs = lineTabs(a);
    views.push({ id: uniqueId(label || "trends"), type: "widgets", title: label || "Trends", icon: "trend", subtitle: `${prefix}${a.x[0]} – ${a.x.at(-1)} · ${a.x.length} periods`, widgets: [{ type: "tabs", tabs }] });
    return { views, mainTab: tabs[0]?.id, mainView: views[0].id };
  }

  if (a.kind === "wide" || a.kind === "long") {
    const [prevP, curP] = a.periods.slice(-2);
    const widgets = [rankingWidget(a, `${a.categoryName}`, `${curP} · vs ${prevP}`, `vs ${prevP}`)];
    if (a.partsOfWhole && a.items.length <= 12) widgets.push(sharesWidget(a.items, a.format, `Share by ${a.categoryName}`, `${curP} vs ${prevP}`, prevP));
    views.push({ id: uniqueId(label || "breakdown"), type: "widgets", title: label || "Breakdown", icon: "bars", subtitle: `${prefix}${a.categoryName} · ${curP} vs ${prevP}`, widgets });

    const tabs = wideTabs(a);
    if (tabs.length) {
      views.push({ id: uniqueId(label ? `${label}-trends` : "trends"), type: "widgets", title: label ? `${label} trends` : "Trends", icon: "trend", subtitle: `${prefix}${a.periods[0]} – ${curP}`, widgets: [{ type: "tabs", tabs }] });
      return { views, mainTab: tabs.at(-1).id, mainView: views[1].id };
    }
    return { views, mainView: views[0].id };
  }

  // categories
  const widgets = [rankingWidget(a, a.categoryName, a.main.name, "")];
  if (a.items.every((it) => it.cur >= 0) && a.items.length <= 12) widgets.push(sharesWidget(a.items, a.main.format, `Share of ${a.main.name}`, a.main.name));
  views.push({ id: uniqueId(label || "breakdown"), type: "widgets", title: label || "Breakdown", icon: "bars", subtitle: `${prefix}${a.main.name} by ${a.categoryName.toLowerCase()}`, widgets });
  return { views, mainView: views[0].id };
}

/** Charts for a wide table: total trend (only for parts of a whole, 3+ periods) and a change slope. */
function wideTabs(a) {
  const [prevP, curP] = a.periods.slice(-2);
  const tabs = [];
  if (a.partsOfWhole && a.periods.length >= 3) {
    tabs.push(lineTab("total", "Total", `Total ${a.valueName.toLowerCase()} by period`, a.periods, [{ name: "Total", values: a.totals }], a.format));
  }
  const withPrev = [...a.items].sort((x, y) => y.cur - x.cur).filter((it) => typeof it.prev === "number").slice(0, 6);
  if (withPrev.length >= 2) {
    tabs.push({
      id: "compare",
      label: "Change",
      chart: "slope",
      title: `${a.categoryName}: ${prevP} → ${curP}`,
      note: "Each line shows one item; up means it grew.",
      description: `${a.categoryName} from ${prevP} to ${curP}`,
      format: a.format,
      from: prevP,
      to: curP,
      items: withPrev.map((it, i) => ({ name: it.name, color: SLOPE_COLORS[i % SLOPE_COLORS.length], cur: it.cur, prev: it.prev, ...(it.invert ? { invert: true } : {}) })),
    });
  }
  return tabs;
}

/** One view for an extra table: a list plus its main chart (or shares). */
function secondaryView(a, uniqueId) {
  const label = a.table.name;
  const base = { id: uniqueId(label), type: "widgets", title: shortTitle(label), icon: a.kind === "series" ? "trend" : "bars" };
  if (a.kind === "series") return { ...base, subtitle: `${label} · ${a.x[0]} – ${a.x.at(-1)}`, widgets: [{ type: "tabs", tabs: lineTabs(a) }] };

  if (a.kind === "wide" || a.kind === "long") {
    const [prevP, curP] = a.periods.slice(-2);
    const widgets = [rankingWidget(a, a.categoryName, `${curP} · vs ${prevP}`, `vs ${prevP}`)];
    const tabs = wideTabs(a);
    if (tabs.length) widgets.push({ type: "tabs", tabs });
    else if (a.partsOfWhole && a.items.length <= 12) widgets.push(sharesWidget(a.items, a.format, `Share by ${a.categoryName}`, `${curP} vs ${prevP}`, prevP));
    return { ...base, subtitle: `${label} · ${curP} vs ${prevP}`, widgets };
  }

  const widgets = [rankingWidget(a, a.categoryName, a.main.name, "")];
  if (a.items.every((it) => it.cur >= 0) && a.items.length <= 12) widgets.push(sharesWidget(a.items, a.main.format, `Share of ${a.main.name}`, a.main.name));
  return { ...base, subtitle: `${label} · ${a.main.name} by ${a.categoryName.toLowerCase()}`, widgets };
}

function rankingWidget(a, title, aside, deltaLabel) {
  return {
    type: "ranking",
    title,
    aside,
    format: a.format || a.main.format,
    deltaLabel,
    items: a.items.slice(0, 30).map((it) => ({ name: it.name, sub: a.kind === "categories" ? a.main.name : a.periods.at(-1), cur: it.cur, ...(typeof it.prev === "number" ? { prev: it.prev } : {}), ...(it.invert ? { invert: true } : {}) })),
  };
}

function sharesWidget(items, format, title, aside, prevLabel) {
  return {
    type: "shares",
    title,
    aside,
    format,
    shareLabel: "of total",
    prevLabel: prevLabel ? String(prevLabel) : undefined,
    deltaLabel: prevLabel ? `vs ${prevLabel}` : undefined,
    items: items.map((it) => ({ name: it.name, cur: it.cur, ...(typeof it.prev === "number" ? { prev: it.prev } : {}), ...(it.invert ? { invert: true } : {}) })),
  };
}

/** Groups series columns into chart tabs: up to 3 lines per tab, similar size, percent apart. */
function lineTabs(a) {
  const groups = [];
  const cols = [...a.cols].sort((p, q) => maxAbs(q.values) - maxAbs(p.values));
  for (const c of cols) {
    const g = groups.find((g) => g.format === c.format && g.cols.length < 3 && maxAbs(g.cols[0].values) / Math.max(1e-9, maxAbs(c.values)) <= 20);
    g ? g.cols.push(c) : groups.push({ format: c.format, cols: [c] });
  }
  return groups.slice(0, 5).map((g, i) =>
    lineTab(`t${i + 1}`, g.cols.map((c) => c.name).join(" & ").slice(0, 28), `${g.cols.map((c) => c.name).join(", ")} over time`, a.x, g.cols.map((c) => ({ name: c.name, values: c.values })), g.format)
  );
}

function lineTab(id, label, title, x, lines, format) {
  const n = x.length;
  const v = lines[0].values;
  const peak = v.indexOf(Math.max(...v));
  return {
    id,
    label,
    chart: "lines",
    title,
    note: `${x[0]} – ${x[n - 1]} · ${n} periods`,
    description: title,
    format,
    x,
    lines,
    stats: [
      { label: `${lines[0].name} · ${x[n - 1]}`, value: v[n - 1], prev: v[n - 2], compare: `vs ${x[n - 2]}` },
      { label: `Highest ${lines[0].name.toLowerCase()}`, value: v[peak], sub: `in ${x[peak]}` },
      { label: "Average per period", value: v.reduce((s, y) => s + y, 0) / n, sub: `across ${n} periods` },
    ],
  };
}

function overviewView(a, parts) {
  const view = { id: "overview", type: "overview", title: "Overview", icon: "overview", hero: {}, tiles: { title: "Key Metrics", items: [] } };
  const metrics = {};

  if (a.kind === "series") {
    const n = a.x.length;
    a.cols.forEach((c, i) => (metrics[`m${i}`] = { cur: c.values[n - 1], prev: c.values[n - 2], ...(c.invert ? { invert: true } : {}) }));
    const mainIdx = a.cols.indexOf(a.main);
    view.subtitle = `Latest period ${a.x[n - 1]} compared with ${a.x[n - 2]}`;
    view.periods = [{ id: "latest", label: "Latest", tag: a.x[n - 1], compare: `vs ${a.x[n - 2]}`, deltaLabel: `vs ${a.x[n - 2]}`, prevLabel: a.x[n - 2], metrics }];
    view.hero = { title: a.main.name, metric: `m${mainIdx}`, format: a.main.format };
    view.tiles.items = a.cols
      .map((c, i) => ({ label: c.name, metric: `m${i}`, format: c.format }))
      .filter((t, i) => i !== mainIdx || a.cols.length === 1)
      .slice(0, 4);
    const mover = a.movers[0];
    if (mover) {
      view.insight = {
        title: `${mover.c.name} ${mover.pct >= 0 ? "up" : "down"} ${Math.abs(mover.pct).toFixed(1)}%`,
        text: `**${mover.c.name}** moved the most in ${a.x[n - 1]} compared with ${a.x[n - 2]}.`,
        action: { label: "See the trend", view: parts.mainView, tab: parts.mainTab },
      };
    }
    return view;
  }

  if (a.kind === "wide" || a.kind === "long") {
    const [prevP, curP] = a.periods.slice(-2);
    const withPrev = a.items.filter((it) => typeof it.prev === "number");
    const avg = (list, k) => list.reduce((s, it) => s + it[k], 0) / Math.max(1, list.length);
    view.subtitle = `${a.categoryName} · ${curP} compared with ${prevP}`;

    // A statement (revenue, costs, profit…) can't be totalled: show its first line big and the next lines as tiles
    if (!a.partsOfWhole) {
      a.items.slice(0, 5).forEach((it, i) => (metrics[`r${i}`] = pairOf(it)));
      view.periods = [{ id: "latest", label: "Latest", tag: curP, compare: `vs ${prevP}`, deltaLabel: `vs ${prevP}`, prevLabel: prevP, metrics }];
      view.hero = { title: a.items[0].name, metric: "r0", format: a.format };
      view.tiles.items = a.items.slice(1, 5).map((it, i) => ({ label: it.name, metric: `r${i + 1}`, format: a.format }));
      const mover = a.growth.find((g) => g.pct > 0);
      if (mover && parts.mainView) {
        view.insight = { title: `${mover.name} up ${Math.abs(mover.pct).toFixed(1)}%`, text: `**${mover.name}** grew the most from ${prevP} to ${curP}.`, action: { label: "Compare all", view: parts.mainView, tab: parts.mainTab } };
      }
      return view;
    }

    metrics.total = { cur: a.totals.at(-1), prev: a.totals.at(-2) };
    metrics.average = { cur: avg(withPrev, "cur"), prev: avg(withPrev, "prev") };
    if (a.largest) metrics.largest = pairOf(a.largest);
    if (a.growth[0]) metrics.fastest = pairOf(a.growth[0]);
    view.periods = [{ id: "latest", label: "Latest", tag: curP, compare: `vs ${prevP}`, deltaLabel: `vs ${prevP}`, prevLabel: prevP, metrics }];
    view.hero = { title: `Total ${a.valueName.toLowerCase()}`, metric: "total", format: a.format };
    view.tiles.items = [
      { label: `Average per ${singular(a.categoryName)}`, metric: "average", format: a.format },
      a.largest && { label: `Largest: ${a.largest.name}`, metric: "largest", format: a.format },
      a.growth[0] && { label: `Fastest: ${a.growth[0].name}`, metric: "fastest", format: a.format },
    ].filter(Boolean);
    view.mix = mixOf(a.items, `${curP} mix by ${a.categoryName.toLowerCase()}`);
    if (a.growth[0]) {
      view.insight = {
        title: `${a.growth[0].name} grew fastest`,
        text: `**${a.growth[0].name}** changed ${pctText(a.growth[0].pct)} from ${prevP} to ${curP}.`,
        action: { label: "Compare all", view: parts.mainView, tab: parts.mainTab },
      };
    }
    return view;
  }

  // categories (one snapshot, no previous values)
  a.cols.forEach((c, i) => (metrics[`m${i}`] = { cur: c.percent ? avg(c.values) : c.values.reduce((s, v) => s + (v || 0), 0) }));
  const mainIdx = a.cols.indexOf(a.main);
  view.subtitle = `${a.items.length} ${a.categoryName.toLowerCase()} values`;
  view.periods = [{ id: "all", label: "All", tag: "Total", compare: "", metrics }];
  view.hero = { title: `Total ${a.main.name.toLowerCase()}`, metric: `m${mainIdx}`, format: a.main.format };
  view.tiles.items = a.cols
    .map((c, i) => ({ label: c.percent ? `Average ${c.name.toLowerCase()}` : `Total ${c.name.toLowerCase()}`, metric: `m${i}`, format: c.format }))
    .filter((_, i) => i !== mainIdx)
    .slice(0, 3);
  metrics.largest = { cur: a.largest.cur };
  view.tiles.items.push({ label: `Largest: ${a.largest.name}`, metric: "largest", format: a.main.format });
  if (a.items.every((it) => it.cur >= 0)) view.mix = mixOf(a.items, `${a.main.name} mix`);
  view.insight = {
    title: `${a.largest.name} leads`,
    text: `**${a.largest.name}** is the largest ${singular(a.categoryName)} by ${a.main.name.toLowerCase()}.`,
    action: { label: "See the breakdown", view: parts.mainView },
  };
  return view;
}

// ---------- Small helpers ----------
function mixOf(items, label) {
  const sorted = [...items].filter((it) => it.cur > 0).sort((a, b) => b.cur - a.cur);
  const top = sorted.slice(0, 4).map((it) => ({ name: it.name, value: it.cur }));
  const rest = sorted.slice(4).reduce((s, it) => s + it.cur, 0);
  if (rest > 0) top.push({ name: "Other", value: rest });
  return top.length >= 2 ? { label, items: top } : undefined;
}

const pairOf = (it) => ({ cur: it.cur, ...(typeof it.prev === "number" ? { prev: it.prev } : {}), ...(it.invert ? { invert: true } : {}) });
const unique = (list) => [...new Set(list)];
const avg = (list) => {
  const v = list.filter((x) => x !== null);
  return v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
};
const maxAbs = (values) => Math.max(...values.map((v) => Math.abs(v || 0)));
const change = (cur, prev) => (typeof cur === "number" && typeof prev === "number" && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const pctText = (pct) => `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/^-+|-+$/g, "");
/** "Condensed consolidated statements of income" → "Income"; long names cut at a word with "…". */
function shortTitle(s) {
  const t = String(s).replace(/^((consolidated|condensed|unaudited|summary of|statements? of)\s+)+/i, "").trim() || String(s);
  const short = t.charAt(0).toUpperCase() + t.slice(1);
  if (short.length <= 22) return short;
  return short.slice(0, 22).replace(/\s+\S*$/, "") + "…";
}
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** A first-column header like "Label" or "Column 1" says nothing: call the rows "Item". */
const labelName = (s) => (/^(label( header)?|column\s*\d*|name|row|rows|item|description|particulars)$/i.test(String(s).trim()) ? "Item" : s);
const singular = (s) => s.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

function pickMain(cols) {
  return cols.find((c) => MAIN_NAME.test(c.name)) || [...cols].sort((a, b) => maxAbs(b.values) - maxAbs(a.values))[0];
}

function sumWhere(values, test) {
  let total = null;
  values.forEach((v, i) => {
    if (v !== null && test(i)) total = (total || 0) + v;
  });
  return total;
}

function avgWhere(values, test) {
  const picked = values.filter((v, i) => v !== null && test(i));
  return picked.length ? picked.reduce((s, v) => s + v, 0) / picked.length : null;
}

/** Fill a few empty cells from their neighbours so lines stay continuous. */
function fillGaps(values) {
  return values.map((v, i) => {
    if (v !== null) return v;
    const before = values.slice(0, i).reverse().find((x) => x !== null);
    const after = values.slice(i + 1).find((x) => x !== null);
    return before !== undefined && after !== undefined ? (before + after) / 2 : (before ?? after ?? 0);
  });
}
