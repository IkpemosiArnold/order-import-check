import { readMorning, SOURCES, fmtPack } from "./parse.js";
import { checkMorning, summarize, importCsv, fmtDate, NOT_FOUND } from "./check.js";
import * as S from "./samples.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
};
const wide = window.matchMedia("(min-width: 960px)");
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const sample = () => ({
  printedList: S.printedList,
  csvExport: S.csvExport,
  email: S.email,
  master: JSON.stringify(S.master, null, 2),
});
let drafts = sample();
let tab = "printedList";
let state = null;
let open = null;

const LABELS = {
  printed: { customer: "Kunde", po: "Bestell-Nr.", article: "Art.-Nr.", description: "Bezeichnung", qty: "Menge", pack: "Gebinde", batch: "Charge" },
  csv: { customer: "Kunde", po: "Bestellnr", article: "Art.-Nr.", cas: "CAS", description: "Bezeichnung", qty: "Menge", pack: "Gebinde, Einheit" },
};
const ORDER = ["customer", "po", "article", "cas", "description", "qty", "pack", "batch"];

/** Which fields of a line to underline, and in which colour. Held lines show only what is wrong. */
function marksFor(r) {
  const marks = {};
  if (r.status === "staged") {
    for (const k of ["customer", "po", "article", "cas", "qty", "pack", "batch"]) marks[k] = "pass";
    return marks;
  }
  for (const reason of r.reasons) {
    if (reason.code === "duplicate") { marks.article = marks.qty = marks.pack = "fail"; continue; }
    if (reason.mark) marks[reason.mark] = "fail";
  }
  return marks;
}

const underline = (text, kind) => (kind ? el("span", `u ${kind}`, text) : document.createTextNode(text));

function recordView(r) {
  const l = r.line;
  const labels = LABELS[l.source];
  const marks = marksFor(r);
  const dl = el("dl", "rec");
  for (const k of ORDER) {
    if (!(k in labels)) continue;
    const f = l[k];
    const row = el("div", "rec-row");
    const dt = el("dt");
    dt.append(labels[k]);
    const ref = f?.ref;
    if (ref?.cell) dt.append(el("span", "cell", ` · ${ref.cell.replace(":", " + ")}`));
    const dd = el("dd");
    if (f && f.text) dd.append(underline(f.text.replace(";", " "), marks[k]));
    else { dd.className = "empty"; dd.textContent = "empty"; }
    row.append(dt, dd);
    dl.append(row);
  }
  return dl;
}

function mailView(r) {
  const l = r.line;
  const lines = state.morning.text.email;
  const marks = marksFor(r);
  const box = el("div", "mail");
  const hdr = (ref, label) => {
    const p = el("p", "hdr");
    if (!ref) { p.append(`${label}: ${NOT_FOUND}`); return p; }
    const t = lines[ref.line - 1];
    p.append(t.slice(0, ref.start), underline(t.slice(ref.start, ref.end), r.status === "staged" ? "pass" : null), t.slice(ref.end));
    return p;
  };
  box.append(hdr(l.customer?.ref, "From"), hdr(l.po?.ref, "Subject"));
  const body = el("div", "body");
  const before = lines[l.line - 2];
  const after = lines[l.line];
  if (before && before.trim()) body.append(el("div", "dim", before));
  const raw = lines[l.line - 1] || "";
  const line = el("div");
  if (l.article) {
    const spans = ["qty", "pack", "description", "article"]
      .map((k) => ({ k, ref: l[k]?.ref }))
      .filter((x) => x.ref)
      .sort((a, b) => a.ref.start - b.ref.start);
    let at = 0;
    for (const s of spans) {
      if (s.ref.start < at) continue;
      line.append(raw.slice(at, s.ref.start), underline(raw.slice(s.ref.start, s.ref.end), marks[s.k]));
      at = s.ref.end;
    }
    line.append(raw.slice(at));
  } else line.append(raw);
  body.append(line);
  if (after && after.trim()) body.append(el("div", "dim", after));
  box.append(body);
  return box;
}

function sourceView(r) {
  const frag = document.createDocumentFragment();
  const l = r.line;
  const lower = { printed: "printed list", csv: "CSV export", email: "email" };
  frag.append(el("p", "ev-h", `From the ${lower[l.source]}, ${l.loc.replace(/^Row/, "row").replace(/^Line/, "line")}`));
  if (r.unread) {
    const p = el("p", "mail");
    p.append(el("span", "body", l.raw));
    frag.append(p);
    return frag;
  }
  if (l.source === "email") frag.append(mailView(r));
  else frag.append(recordView(r));
  const cap = l.source === "printed"
    ? `Typed out from the printed list, line ${l.line}. Kunde and Bestell-Nr. are in its header.`
    : l.source === "csv" ? `Cells named as a spreadsheet would name them; row 1 is the header.` : `Line ${l.line} of the email.`;
  frag.append(el("p", "src-cap", cap));
  return frag;
}

function checksView(r) {
  const ul = el("ul", "checks");
  for (const c of r.checks) {
    const li = el("li");
    const ic = icon(c.state === "pass" ? "check" : c.state === "none" ? "none" : "cross");
    ic.classList.add(`st-${c.state}`);
    li.append(ic, el("span", "k", c.label), el("span", "t", c.text));
    li.setAttribute("aria-label", `${c.label}: ${c.state === "pass" ? "passes" : "fails"}, ${c.text}`);
    ul.append(li);
  }
  return ul;
}

const FIELD_NAMES = {
  po: "Order", customer: "Customer", article: "Article", description: "Name", qty: "Packs", pack: "Pack",
  cas: "CAS", un: "UN number", adrClass: "ADR class", packingGroup: "Packing group", batch: "Batch", expiry: "Expiry",
};

function importView(r) {
  const t = el("table", "fields");
  const thead = el("thead");
  const hr = el("tr");
  hr.append(el("th", null, "Field"), el("th", null, "Value"), el("th", null, "From"));
  thead.append(hr);
  const tb = el("tbody");
  for (const [k, f] of Object.entries(r.row)) {
    if (["un", "adrClass", "packingGroup"].includes(k) && !r.item?.dg) continue;
    const tr = el("tr");
    const nf = f.value === NOT_FOUND;
    tr.append(el("td", "f", FIELD_NAMES[k]), el("td", nf ? "v nf" : "v", f.value), el("td", "from", f.from?.where || NOT_FOUND));
    tb.append(tr);
  }
  t.append(thead, tb);
  return t;
}

function detail(r) {
  const box = el("div", "evidence");
  const staged = r.status === "staged";
  box.append(el("p", "side-h", `${SOURCES[r.line.source]}, ${r.line.loc}`));
  box.append(el("p", `side-title ${staged ? "st-pass" : "st-fail"}`, staged ? "Staged for import" : "Held back"));
  box.append(sourceView(r));

  if (!staged) {
    box.append(el("p", "ev-h", "Why it is held back"));
    const ul = el("ul", "reasons");
    for (const reason of r.reasons) {
      const li = el("li");
      li.append(icon("cross"), el("span", null, reason.text));
      ul.append(li);
    }
    box.append(ul);
    const acts = el("div", "ev-actions");
    if (r.reasons.some((x) => x.code === "dg_missing") && r.item?.article === "20220") {
      const b = el("button", "btn text", "Fill in UN 1789 from ADR Table A");
      b.type = "button";
      b.addEventListener("click", fixUn);
      acts.append(b);
    }
    if (r.duplicateOf) {
      const b = el("button", "btn text", "Open the first one");
      b.type = "button";
      b.addEventListener("click", () => focusLine(r.duplicateOf));
      acts.append(b);
    }
    if (acts.childElementCount) box.append(acts);
  }

  if (r.checks.length) {
    box.append(el("p", "ev-h", "Checked against the product master"));
    box.append(checksView(r));
  }

  if (staged) {
    box.append(el("p", "ev-h", "The import line, field by field"));
    box.append(importView(r));
  }
  return box;
}

/** One line a reader gets without a tap. */
function shortReason(r) {
  const x = r.reasons[0];
  const l = r.line;
  switch (x.code) {
    case "unknown_article": return `Art.-Nr. ${l.article?.value ?? ""} ${NOT_FOUND} in the product master.`;
    case "pack_size": return `${fmtPack(l.pack?.value) === NOT_FOUND ? `"${l.pack?.text ?? ""}"` : fmtPack(l.pack.value)} is not a pack it is sold in.`;
    case "dg_missing": return `ADR class ${r.item.dg.adrClass || "?"}, but no UN number in the master.`;
    case "expired_batch": {
      const b = r.item.batches.find((y) => y.batch === l.batch.value);
      return `Batch ${b.batch} expired ${fmtDate(b.expiry)}.`;
    }
    case "duplicate": {
      const first = state.results.find((y) => y.line.id === r.duplicateOf)?.line;
      return first ? `Repeats ${SOURCES[first.source]}, ${first.loc.split(",")[0].toLowerCase()}.` : "Repeats an earlier line.";
    }
    default: return x.text;
  }
}

function rowItem(r) {
  const li = el("div", "row-item");
  const btn = el("button", "row");
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  const ok = r.status === "staged";
  const st = el("span", `status ${ok ? "st-pass" : "st-fail"}`);
  st.append(icon(ok ? "check" : "cross"), ok ? "Staged" : "Held");
  const val = el("span", "val");
  const l = r.line;
  if (r.unread) {
    val.append(el("b", null, "Unread line"));
  } else {
    const title = el("b");
    title.append(el("span", "nb", `${l.qty?.text ?? "?"} × ${(l.pack?.text ?? "?").replace(";", " ")}`), ` ${l.description?.text ?? ""}`);
    val.append(title);
  }
  val.append(`${SOURCES[l.source]}, ${l.loc.split(",")[0].toLowerCase().replace("pos.", "Pos.")}`);
  if (!ok) val.append(el("span", "meta st-fail", shortReason(r)));
  const chev = icon("chev");
  chev.classList.add("chev");
  btn.append(st, val, chev);
  const entry = { id: l.id, li, btn, r };
  btn.addEventListener("click", () => toggle(entry));
  li.append(btn);
  li._entry = entry;
  return li;
}

function closeOpen() {
  if (!open) return;
  open.btn.setAttribute("aria-expanded", "false");
  open.li.querySelector(".evidence")?.remove();
  open = null;
  $("side").replaceChildren();
}

function show(entry, animate = true) {
  const box = detail(entry.r);
  if (animate) box.classList.add("enter");
  entry.btn.setAttribute("aria-expanded", "true");
  if (wide.matches) $("side").replaceChildren(box);
  else entry.li.append(box);
  open = entry;
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("drawn")));
}

function toggle(entry) {
  const same = open && open.id === entry.id;
  closeOpen();
  if (!same) show(entry);
}

wide.addEventListener("change", () => {
  if (!open) return;
  const entry = open;
  closeOpen();
  show(entry, false);
});

function focusLine(id) {
  const li = [...document.querySelectorAll(".row-item")].find((x) => x._entry?.id === id);
  if (!li) return;
  closeOpen();
  show(li._entry, true);
  li.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
}

function parseMaster(text) {
  const m = JSON.parse(text);
  if (!Array.isArray(m) || m.some((x) => !x || typeof x !== "object" || !x.article || !Array.isArray(x.packs) || !Array.isArray(x.batches))) throw new Error("shape");
  return m;
}

function render({ fresh = false, focusId = null } = {}) {
  closeOpen();
  const master = parseMaster(drafts.master);
  const morning = readMorning(drafts);
  const results = checkMorning(morning, master, { dispatchDate: S.dispatchDate });
  state = { morning, results, master };
  const { total, held, staged } = summarize(results);

  const sum = $("summary");
  if (held) {
    sum.replaceChildren(el("span", "sum-main st-fail", `${held} of ${total} lines held back`));
    sum.append(el("span", "sum-side", `${staged} staged`));
  } else {
    sum.replaceChildren(el("span", "sum-main st-pass", `${staged} of ${total} lines staged`));
  }

  const order = results.map((_, i) => i).sort((a, b) => (results[a].status === results[b].status ? a - b : results[a].status === "held" ? -1 : 1));
  const rows = el("div", "rows");
  rows.append(...order.map((i) => rowItem(results[i])));
  if (fresh) rows.classList.add("fresh");
  const g = el("section", "group");
  g.append(el("h2", "group-h", `Dispatch ${fmtDate(S.dispatchDate)}${held ? ", held back first" : ""}`), rows);
  $("groups").replaceChildren(g);

  // Approval starts over whenever the lines change.
  approved = null;
  $("approve-sub").textContent = staged
    ? `${staged} lines, each tied to the line it came from. Nothing goes to the ERP until someone approves.${held ? ` The ${held} held lines stay out.` : ""}`
    : "Nothing to import yet.";
  $("approve-btn").textContent = `Approve ${staged} line${staged === 1 ? "" : "s"}`;
  $("approve-btn").disabled = !staged;
  $("approved").hidden = true;
  $("download-btn").hidden = true;
  $("file-pre").textContent = importCsv(results);

  let li = rows.children[0];
  if (focusId) li = [...rows.children].find((x) => x._entry.id === focusId) || li;
  if (li) {
    show(li._entry, Boolean(focusId));
    if (focusId) li.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
  }
}

let approved = null;
$("approve-btn").addEventListener("click", () => {
  const { staged } = summarize(state.results);
  approved = new Date();
  const t = approved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const p = $("approved");
  p.replaceChildren(icon("check"), el("span", null, `Approved at ${t}. The import file has ${staged} lines, each with its source. In a real setup this is where it would go to the ERP; here it stays on the page.`));
  p.hidden = false;
  $("approve-btn").disabled = true;
  $("download-btn").hidden = false;
});
$("download-btn").addEventListener("click", () => {
  const blob = new Blob(["﻿" + importCsv(state.results)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `import-${S.dispatchDate}-sample.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("file-btn").addEventListener("click", () => {
  const w = $("file-wrap");
  w.hidden = !w.hidden;
  $("file-btn").setAttribute("aria-expanded", String(!w.hidden));
  $("file-btn").textContent = w.hidden ? "Show the file" : "Hide the file";
});

function showTab(name) {
  drafts[tab] = $("src-in").value;
  tab = name;
  $("src-in").value = drafts[tab];
  for (const b of document.querySelectorAll(".seg-btn")) b.setAttribute("aria-selected", String(b.dataset.src === name));
}
for (const b of document.querySelectorAll(".seg-btn")) b.addEventListener("click", () => showTab(b.dataset.src));

function checkAgain(opts = {}) {
  drafts[tab] = $("src-in").value;
  const err = $("src-error");
  try {
    render({ fresh: true, ...opts });
    err.hidden = true;
    return true;
  } catch {
    err.textContent = "The product master isn't a JSON list of articles with packs and batches. Reset the sample to see the shape.";
    err.hidden = false;
    return false;
  }
}

function fixUn() {
  drafts[tab] = $("src-in").value;
  let m;
  try { m = parseMaster(drafts.master); } catch { m = JSON.parse(sample().master); }
  const acid = m.find((x) => x.article === "20220");
  if (acid && acid.dg) acid.dg.un = "1789";
  drafts.master = JSON.stringify(m, null, 2);
  if (tab === "master") $("src-in").value = drafts.master;
  const id = state.results.find((r) => r.item?.article === "20220")?.line.id;
  checkAgain({ focusId: id });
}

$("check-btn").addEventListener("click", () => {
  if (checkAgain()) $("summary").scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
});
$("fix-btn").addEventListener("click", fixUn);
$("reset-btn").addEventListener("click", () => {
  drafts = sample();
  $("src-in").value = drafts[tab];
  checkAgain();
});
$("why-btn").addEventListener("click", () => {
  const t = $("why");
  t.hidden = !t.hidden;
  $("why-btn").setAttribute("aria-expanded", String(!t.hidden));
});
$("terms-btn").addEventListener("click", () => {
  const t = $("terms");
  t.hidden = !t.hidden;
  $("terms-btn").setAttribute("aria-expanded", String(!t.hidden));
});

$("src-in").value = drafts[tab];
render();
