// Reads three kinds of morning order: a typed-out printed list, a CSV export and an email.
// Plain code, no model. Every field keeps a reference to the line and characters it came from,
// so the page can underline it and the import file can name it.

export const SOURCES = {
  printed: "Printed list",
  csv: "CSV export",
  email: "Email",
};

const UNITS = { l: "L", kg: "kg", g: "g", ml: "mL" };

/** "2,5" or "2.5" or "1.000" (German thousands) to a number; null when it is not one. */
export function num(text) {
  const t = String(text ?? "").trim();
  if (!/^\d{1,3}(\.\d{3})+(,\d+)?$|^\d+([.,]\d+)?$/.test(t)) return null;
  const n = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "25 L", "2,5 l", "200L" to { size, unit }; null when it is not a pack. */
export function pack(text) {
  const m = String(text ?? "").trim().match(/^(\d+(?:[.,]\d+)?)\s*(l|kg|g|ml)$/i);
  if (!m) return null;
  return { size: num(m[1]), unit: UNITS[m[2].toLowerCase()] };
}

export function fmtPack(p) {
  if (!p) return "not found";
  return `${String(p.size).replace(".", ",")} ${p.unit}`;
}

/** A field read from a source: the value, the text as written, and where it sits. */
function field(value, text, ref) {
  return { value, text, ref };
}

/** Runs of text separated by two or more spaces, with their start offsets. */
function cells(line) {
  const out = [];
  const re = /\S+(?: \S+)*/g;
  let m;
  while ((m = re.exec(line))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

function lineAt(lines, lineNo) {
  return lines[lineNo - 1] ?? "";
}

/** Header value after a label such as "Kunde:" on a given line, up to a double space. */
function labelled(lines, label) {
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].indexOf(label);
    if (at < 0) continue;
    const rest = lines[i].slice(at + label.length);
    const lead = rest.match(/^\s*/)[0].length;
    const m = rest.slice(lead).match(/^\S+(?: \S+)*/);
    if (!m) continue;
    const start = at + label.length + lead;
    return { text: m[0], line: i + 1, start, end: start + m[0].length };
  }
  return null;
}

/**
 * A printed order list, typed out as it reads on paper. Columns are found from the header row
 * (Pos, Art.-Nr., Bezeichnung, Menge, Gebinde, Charge), so an empty Charge cell is simply empty.
 */
export function parsePrinted(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const src = "printed";
  const kunde = labelled(lines, "Kunde:");
  const po = labelled(lines, "Bestell-Nr.:");
  const hIdx = lines.findIndex((l) => /^\s*Pos\b/.test(l) && /Art\.?-?Nr/.test(l));
  const out = [];
  const unread = [];
  if (hIdx < 0) return { lines: out, unread, text: lines };
  const header = cells(lines[hIdx]);
  const colOf = (start) => {
    let best = null;
    for (const h of header) if (h.start <= start + 2) best = h;
    return best ? best.text : null;
  };
  const headRef = (h, col) => (h ? { source: src, line: h.line, start: h.start, end: h.end, where: `${SOURCES[src]}, header, ${col}` } : null);
  for (let i = hIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const lineNo = i + 1;
    const byCol = {};
    for (const c of cells(raw)) {
      const col = colOf(c.start);
      if (col && !byCol[col]) byCol[col] = c;
    }
    const pos = byCol.Pos?.text;
    if (!pos || !/^\d+$/.test(pos)) {
      unread.push({ source: src, line: lineNo, raw });
      continue;
    }
    const loc = `Pos. ${pos}`;
    const ref = (col) => byCol[col] ? { source: src, line: lineNo, start: byCol[col].start, end: byCol[col].end, where: `${SOURCES[src]}, ${loc}, column ${col}` } : null;
    const g = (col) => byCol[col]?.text ?? null;
    out.push({
      id: `printed-${pos}`,
      source: src,
      loc,
      line: lineNo,
      customer: field(kunde?.text ?? null, kunde?.text ?? null, headRef(kunde, "Kunde")),
      po: field(po?.text ?? null, po?.text ?? null, headRef(po, "Bestell-Nr.")),
      article: field(g("Art.-Nr."), g("Art.-Nr."), ref("Art.-Nr.")),
      description: field(g("Bezeichnung"), g("Bezeichnung"), ref("Bezeichnung")),
      qty: field(num(g("Menge")), g("Menge"), ref("Menge")),
      pack: field(pack(g("Gebinde")), g("Gebinde"), ref("Gebinde")),
      batch: g("Charge") ? field(g("Charge"), g("Charge"), ref("Charge")) : null,
      cas: null,
    });
  }
  return { lines: out, unread, text: lines };
}

/** Splits one CSV line on a delimiter, honouring double quotes, keeping each cell's offsets. */
function splitCsv(line, delim) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    let start = i;
    let value = "";
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { value += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else value += line[i++];
      }
      while (i < line.length && line[i] !== delim) i++;
    } else {
      while (i < line.length && line[i] !== delim) value += line[i++];
    }
    out.push({ text: value.trim(), start, end: i });
    i++;
  }
  return out;
}

const colLetter = (n) => {
  let s = "";
  n += 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** A CSV export. Semicolons or commas; row 1 is the header, as a spreadsheet would number it. */
export function parseCsv(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const src = "csv";
  const out = [];
  const unread = [];
  if (!lines[0]?.trim()) return { lines: out, unread, text: lines };
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const head = splitCsv(lines[0], delim).map((c) => c.text);
  const idx = (names) => head.findIndex((h) => names.some((n) => h.toLowerCase() === n.toLowerCase()));
  const col = {
    customer: idx(["Kunde", "Customer"]),
    po: idx(["Bestellnr", "Bestell-Nr.", "PO"]),
    pos: idx(["Pos", "Position"]),
    article: idx(["Art.-Nr.", "Artikelnummer", "Article"]),
    cas: idx(["CAS"]),
    description: idx(["Bezeichnung", "Description"]),
    qty: idx(["Menge", "Qty", "Quantity"]),
    size: idx(["Gebinde", "Pack"]),
    unit: idx(["Einheit", "Unit"]),
  };
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const row = i + 1;
    const cs = splitCsv(raw, delim);
    const loc = `row ${row}`;
    const cell = (k) => (col[k] >= 0 && cs[col[k]] && cs[col[k]].text !== "" ? cs[col[k]] : null);
    const ref = (k) => {
      const c = cell(k);
      if (!c) return null;
      const name = head[col[k]];
      return { source: src, line: row, start: c.start, end: c.end, cell: `${colLetter(col[k])}${row}`, where: `${SOURCES[src]}, cell ${colLetter(col[k])}${row} (${name})` };
    };
    const t = (k) => cell(k)?.text ?? null;
    const sizeText = t("size");
    const unitText = t("unit");
    const p = sizeText != null && unitText != null ? pack(`${sizeText} ${unitText}`) : null;
    const packRef = ref("size") && ref("unit")
      ? { ...ref("size"), end: ref("unit").end, cell: `${ref("size").cell}:${ref("unit").cell}`, where: `${SOURCES[src]}, cells ${ref("size").cell} and ${ref("unit").cell} (${head[col.size]}, ${head[col.unit]})`, parts: [ref("size"), ref("unit")] }
      : ref("size");
    out.push({
      id: `csv-${row}`,
      source: src,
      loc: `Row ${row}${t("pos") ? `, Pos ${t("pos")}` : ""}`,
      line: row,
      customer: field(t("customer"), t("customer"), ref("customer")),
      po: field(t("po"), t("po"), ref("po")),
      article: field(t("article"), t("article"), ref("article")),
      description: field(t("description"), t("description"), ref("description")),
      qty: field(num(t("qty")), t("qty"), ref("qty")),
      pack: field(p, sizeText != null ? `${sizeText} ${unitText ?? ""}`.trim() : null, packRef),
      batch: null,
      cas: t("cas") ? field(t("cas"), t("cas"), ref("cas")) : null,
    });
  }
  return { lines: out, unread, text: lines, header: head };
}

const ITEM = /^(\d+)\s*x\s*(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml))\s+(.+?),\s*art\.?\s*(?:no\.?\s*)?(\d{4,6})\s*$/i;
const LOOKS_LIKE_ITEM = /^\s*\d+\s*x\s|\bart\.?\s*(?:no\.?\s*)?\d{3,}/i;

/** An emailed order. Items are lines shaped "2 x 25 kg name, art. 12345". Anything item-like that is not, is reported unread. */
export function parseEmail(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const src = "email";
  const out = [];
  const unread = [];
  let customer = null;
  let po = null;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { bodyStart = i + 1; break; }
    const from = l.match(/^From:\s*([^,<]+),\s*([^<]+?)\s*</i);
    if (from) {
      const start = l.indexOf(from[2], l.indexOf(",") + 1);
      customer = { source: src, text: from[2], line: i + 1, start, end: start + from[2].length, where: `${SOURCES[src]}, line ${i + 1} (From)` };
    }
    const subj = l.match(/^Subject:.*?\bPO\s+([A-Z0-9][A-Z0-9-]*[A-Z0-9])/i);
    if (subj) {
      const start = l.indexOf(subj[1]);
      po = { source: src, text: subj[1], line: i + 1, start, end: start + subj[1].length, where: `${SOURCES[src]}, line ${i + 1} (Subject)` };
    }
  }
  const at = (text, raw, from = 0) => raw.indexOf(text, from);
  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const m = raw.trim().match(ITEM);
    if (!m) {
      if (LOOKS_LIKE_ITEM.test(raw)) unread.push({ source: src, line: lineNo, raw });
      continue;
    }
    const lead = raw.length - raw.trimStart().length;
    const qStart = lead;
    const pStart = at(m[2], raw, qStart + m[1].length);
    const dStart = at(m[3], raw, pStart + m[2].length);
    const aStart = raw.lastIndexOf(m[4]);
    const where = (what) => `${SOURCES[src]}, line ${lineNo} (${what})`;
    const r = (s, t, what) => ({ source: src, line: lineNo, start: s, end: s + t.length, where: where(what) });
    out.push({
      id: `email-${lineNo}`,
      source: src,
      loc: `Line ${lineNo}`,
      line: lineNo,
      customer: field(customer?.text ?? null, customer?.text ?? null, customer),
      po: field(po?.text ?? null, po?.text ?? null, po),
      article: field(m[4], m[4], r(aStart, m[4], "article")),
      description: field(m[3], m[3], r(dStart, m[3], "name")),
      qty: field(num(m[1]), m[1], r(qStart, m[1], "quantity")),
      pack: field(pack(m[2]), m[2], r(pStart, m[2], "pack")),
      batch: null,
      cas: null,
    });
  }
  return { lines: out, unread, text: lines };
}

/** All three sources, in the order a person would read them in the morning. */
export function readMorning({ printedList, csvExport, email }) {
  const p = parsePrinted(printedList);
  const c = parseCsv(csvExport);
  const e = parseEmail(email);
  return {
    lines: [...p.lines, ...c.lines, ...e.lines],
    unread: [...p.unread, ...c.unread, ...e.unread],
    text: { printed: p.text, csv: c.text, email: e.text },
  };
}
