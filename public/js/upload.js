/* Upload view: pick or drop a file → server reads it →
   AI-read documents go to the review screen; spreadsheets become a dashboard straight away. */
import { esc } from "./format.js";

const TABLES = [".xlsx", ".xls", ".csv", ".json"]; // read by code
const DOCUMENTS = [".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md"]; // read by AI
const MAX_MB = 10;

/**
 * section: the static upload <section>
 * onDashboard(dashboard, review?) → returns a list of problems ([] when it loaded)
 * onReview(review) → opens the review screen
 * onReopen() → opens the last saved review; hasSavedReview() → boolean
 * onSample() → loads the built-in example again
 */
export function mountUpload(section, { onDashboard, onReview, onReopen, hasSavedReview, onSample }) {
  const input = section.querySelector('[data-ref="file"]');
  const zone = section.querySelector('[data-ref="drop"]');
  const status = section.querySelector('[data-ref="status"]');
  const reopen = section.querySelector('[data-ref="reopen"]');
  const showReopen = () => (reopen.hidden = !hasSavedReview());
  reopen.addEventListener("click", onReopen);
  showReopen();
  let busy = false;
  let aiReady = true;

  // Is AI (PDF / Word / images) set up on the server?
  fetch("/api/status")
    .then((r) => r.json())
    .then((s) => {
      aiReady = Boolean(s.ai);
      if (!aiReady) setStatus("PDF, Word and image reading is not set up on this server yet. Excel, CSV and JSON work.");
    })
    .catch(() => {});

  const setStatus = (html, tone = "") => {
    status.className = `upload__status ${tone}`;
    status.innerHTML = html;
  };

  async function send(file) {
    if (busy || !file) return;
    const ext = `.${file.name.split(".").pop().toLowerCase()}`;
    const byAi = DOCUMENTS.includes(ext);
    if (!byAi && !TABLES.includes(ext)) return setStatus(`${esc(ext)} files are not supported. Use Excel, CSV, JSON, PDF, Word (.docx), an image or a text file.`, "neg");
    if (byAi && !aiReady) return setStatus("Reading PDF, Word and images needs AI, which is not set up on this server yet.", "neg");
    if (file.size > MAX_MB * 1024 * 1024) return setStatus(`This file is larger than ${MAX_MB} MB.`, "neg");

    busy = true;
    zone.classList.add("is-busy");
    setStatus(
      byAi
        ? `AI is reading <b>${esc(file.name)}</b> and finding its tables. This usually takes one to two minutes…`
        : `Reading <b>${esc(file.name)}</b> and building your dashboard…`
    );
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/analyze", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status}).`);

      if (data.needsReview) {
        // AI-read: the user checks the numbers before anything is built
        setStatus(`AI found ${data.review.tables.length} tables in <b>${esc(file.name)}</b>. Please review them.`, "pos");
        onReview(data.review);
        return;
      }

      const problems = onDashboard(data.dashboard, data.review);
      if (problems.length) {
        setStatus(`The file was read, but the dashboard data has problems:<br>${problems.slice(0, 5).map(esc).join("<br>")}`, "neg");
      } else {
        const notes = (data.warnings || []).map(esc).join("<br>");
        setStatus(`Done. Your dashboard for <b>${esc(file.name)}</b> is ready.${notes ? `<br>${notes}` : ""}`, "pos");
      }
    } catch (err) {
      setStatus(esc(err.message || "Upload failed. Please try again."), "neg");
    } finally {
      busy = false;
      zone.classList.remove("is-busy");
      input.value = "";
      showReopen();
    }
  }

  input.addEventListener("change", () => send(input.files[0]));

  // Drag & drop
  ["dragenter", "dragover"].forEach((type) =>
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add("is-over");
    })
  );
  ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, () => zone.classList.remove("is-over")));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    send(e.dataTransfer.files[0]);
  });

  section.querySelector('[data-ref="sample"]').addEventListener("click", () => {
    onSample();
    setStatus("The Alphabet Q3 2026 example is loaded again.", "pos");
  });
}
