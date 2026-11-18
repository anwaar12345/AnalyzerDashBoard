/* Sidebar, top bar and footer, filled from the dashboard's meta and view list. */
import { esc } from "./format.js";
import { VIEW_ICONS } from "./ui.js";

const HELP_ICON = '<circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6M12 17h.01" />';
const FILE_ICON = '<path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />';
const LINK_ICON = '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />';
const DOWNLOAD_ICON = '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />';
const INFO_ICON = '<circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />';
const UPLOAD_ICON = '<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />';

export function renderShell(d) {
  const { meta, views } = d;
  const source = meta.source;
  const sourceKind = source?.file?.toLowerCase().endsWith(".pdf") ? "PDF" : "file";
  const site = meta.website;
  const siteName = site ? `${meta.name} ${site.label.toLowerCase()}` : "";

  document.querySelector(".sidebar").innerHTML = `
      <a class="brand" href="#/${esc(views[0].id)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M19 4v16M5 12h14" /></svg>
        ${esc(meta.name)} Insights
      </a>
      <nav class="nav" aria-label="Views">
        ${views
          .map(
            (v) => `<a href="#/${esc(v.id)}" data-route="${esc(v.id)}">
          <svg viewBox="0 0 24 24">${VIEW_ICONS[v.icon] || VIEW_ICONS.overview}</svg>
          ${esc(v.title)}
        </a>`
          )
          .join("")}
        <a href="#/upload" data-route="upload">
          <svg viewBox="0 0 24 24">${UPLOAD_ICON}</svg>
          Upload file
        </a>
      </nav>
      <div class="nav nav--bottom">
        <a href="#/help" data-route="help">
          <svg viewBox="0 0 24 24">${HELP_ICON}</svg>
          How to use
        </a>
        ${source?.file ? `<a href="${esc(source.file)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24">${FILE_ICON}</svg> Source ${sourceKind}</a>` : ""}
        ${site ? `<a href="${esc(site.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24">${LINK_ICON}</svg> ${esc(site.label)}</a>` : ""}
      </div>`;

  document.querySelector(".topbar").innerHTML = `
        <div>
          <h1>${esc(meta.name)}, <span class="accent">${esc(meta.period)}</span></h1>
          <p class="muted" data-ref="subtitle"></p>
        </div>
        <div class="company">
          <a class="icon-btn" href="#/help" aria-label="How to use this dashboard" title="How to use">
            <svg viewBox="0 0 24 24" aria-hidden="true">${HELP_ICON}</svg>
          </a>
          ${source?.file ? `<a class="icon-btn" href="${esc(source.file)}" download aria-label="Download source ${sourceKind}" title="Download source ${sourceKind}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${DOWNLOAD_ICON}</svg>
          </a>` : ""}
          ${site ? `<a class="icon-btn" href="${esc(site.url)}" target="_blank" rel="noopener" aria-label="Open ${esc(siteName)}" title="${esc(siteName)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${LINK_ICON}</svg>
          </a>` : ""}
          <div class="company__logo" aria-hidden="true">${esc((meta.company || meta.name).charAt(0))}</div>
          <div>
            <strong>${esc(meta.company || meta.name)}</strong>
            ${meta.ticker ? `<span class="muted">${esc(meta.ticker)}</span>` : ""}
          </div>
        </div>`;

  document.querySelector(".footer").innerHTML = source
    ? `<span class="source" tabindex="0" aria-describedby="sourceNotes">
          Source: ${esc(source.label)}
          <svg viewBox="0 0 24 24" aria-hidden="true">${INFO_ICON}</svg>
          <span class="source__notes" id="sourceNotes" role="tooltip">${(source.notes || []).map(esc).join("<br />")}</span>
        </span>`
    : "";
}
