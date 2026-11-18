/* Checks a Dashboard JSON (version 1) before rendering. Returns a list of readable problems ([] = valid). */

const COLOR = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\))$/i;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const UNITS = ["ones", "thousands", "millions", "billions"];
const FORMATS = ["money", "number", "percent", "perShare"];
const WIDGET_TYPES = ["ranking", "shares", "tabs", "balance", "notes"];
const CHART_TYPES = ["gapLines", "geo", "slope", "lines"];
const RESERVED = ["help", "upload"];

export function validate(d) {
  const errors = [];
  const fail = (path, msg) => errors.push(`${path}: ${msg}`);
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const isText = (v) => typeof v === "string" && v.trim() !== "";
  const text = (obj, key, path) => isText(obj?.[key]) || fail(`${path}.${key}`, "must be non-empty text");
  const list = (obj, key, path) => (Array.isArray(obj?.[key]) && obj[key].length ? obj[key] : (fail(`${path}.${key}`, "must be a non-empty list"), []));
  const pair = (obj, path) => (isNum(obj?.cur) && isNum(obj?.prev)) || fail(path, "needs numeric cur and prev");
  // cur is required; prev is optional (a single snapshot has no previous value)
  const value = (obj, path) => (isNum(obj?.cur) && (obj.prev === undefined || obj.prev === null || isNum(obj.prev))) || fail(path, "needs a numeric cur (prev optional)");
  const format = (obj, path) => obj?.format === undefined || FORMATS.includes(obj.format) || fail(`${path}.format`, `must be one of ${FORMATS.join(", ")}`);

  if (!d || typeof d !== "object") return ["File is not a JSON object"];
  if (d.version !== 1) fail("version", "must be 1");

  text(d.meta, "name", "meta");
  text(d.meta, "period", "meta");
  if (!UNITS.includes(d.meta?.unit)) fail("meta.unit", `must be one of ${UNITS.join(", ")}`);

  const ids = new Set();
  list(d, "views", "").forEach((v, i) => {
    const p = `views[${i}]`;
    if (!ID.test(v.id || "") || RESERVED.includes(v.id)) fail(`${p}.id`, "must be a lowercase id (not 'help' or 'upload')");
    if (ids.has(v.id)) fail(`${p}.id`, "is used twice");
    ids.add(v.id);
    text(v, "title", p);

    if (v.type === "overview") return checkOverview(v, p);
    if (v.type !== "widgets") return fail(`${p}.type`, 'must be "overview" or "widgets"');
    list(v, "widgets", p).forEach((w, j) => checkWidget(w, `${p}.widgets[${j}]`));
  });

  function checkOverview(v, p) {
    list(v, "periods", p).forEach((per, i) => {
      const pp = `${p}.periods[${i}]`;
      text(per, "id", pp);
      text(per, "label", pp);
      const metrics = per.metrics || {};
      Object.entries(metrics).forEach(([k, m]) => value(m, `${pp}.metrics.${k}`));
      const needed = [v.hero?.metric, ...(v.tiles?.items || []).flatMap((t) => t.ratio || [t.metric])];
      needed.filter(Boolean).forEach((k) => metrics[k] || fail(`${pp}.metrics`, `missing "${k}"`));
    });
    text(v.hero, "metric", `${p}.hero`);
    format(v.hero, `${p}.hero`);
    (v.tiles?.items || []).forEach((t, i) => format(t, `${p}.tiles.items[${i}]`));
    (v.mix?.items || []).forEach((s, i) => isNum(s.value) || fail(`${p}.mix.items[${i}].value`, "must be a number"));
  }

  function checkWidget(w, p) {
    if (!WIDGET_TYPES.includes(w.type)) return fail(`${p}.type`, `must be one of ${WIDGET_TYPES.join(", ")}`);
    if (w.type === "tabs") return list(w, "tabs", p).forEach((t, i) => checkChart(t, `${p}.tabs[${i}]`));
    text(w, "title", p);
    format(w, p);
    const key = w.type === "balance" ? "rows" : "items";
    list(w, key, p).forEach((it, i) => {
      const ip = `${p}.${key}[${i}]`;
      if (w.type === "notes") return text(it, "title", ip);
      text(it, "name", ip);
      w.type === "balance" ? pair(it, ip) : value(it, ip);
    });
  }

  function checkChart(t, p) {
    if (!ID.test(t.id || "")) fail(`${p}.id`, "must be a lowercase id");
    text(t, "label", p);
    format(t, p);
    if (!CHART_TYPES.includes(t.chart)) return fail(`${p}.chart`, `must be one of ${CHART_TYPES.join(", ")}`);

    if (t.chart === "gapLines" || t.chart === "lines") {
      const x = list(t, "x", p);
      const lines = list(t, "lines", p);
      if (t.chart === "gapLines" && lines.length !== 2) fail(`${p}.lines`, "needs exactly 2 lines");
      if (t.chart === "lines" && lines.length > 3) fail(`${p}.lines`, "can have at most 3 lines");
      lines.forEach((l, i) => {
        text(l, "name", `${p}.lines[${i}]`);
        if (!Array.isArray(l.values) || l.values.length !== x.length || !l.values.every(isNum)) fail(`${p}.lines[${i}].values`, `needs ${x.length} numbers`);
      });
      if (t.chart === "gapLines") text(t.gap, "name", `${p}.gap`);
    }
    if (t.chart === "geo") {
      list(t, "regions", p).forEach((r, i) => {
        if (!WORLD_MAP.paths[r.key]) fail(`${p}.regions[${i}].key`, `must be one of ${Object.keys(WORLD_MAP.paths).join(", ")}`);
        pair(r, `${p}.regions[${i}]`);
      });
    }
    if (t.chart === "slope") {
      list(t, "items", p).forEach((s, i) => {
        pair(s, `${p}.items[${i}]`);
        if (!COLOR.test(s.color || "")) fail(`${p}.items[${i}].color`, "must be #hex or var(--name)");
        if (s.revenue) pair(s.revenue, `${p}.items[${i}].revenue`);
      });
    }
  }

  return errors;
}
