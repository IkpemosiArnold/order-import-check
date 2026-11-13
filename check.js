// Checks each order line against the product master and stages a clean import.
// Plain code, no model. A line is staged only when every check passes; otherwise it is held
// back with the reason. Nothing is guessed: a value that is not in a source says "not found".

import { SOURCES, fmtPack } from "./parse.js";

export const NOT_FOUND = "not found";

/**
 * CAS Registry Number check digit: drop the hyphens, weight the digits before the check digit
 * 1, 2, 3 ... from the right, sum, and take the last digit. Source: cas.org, "Check digit
 * verification of CAS Registry Numbers".
 */
export function casValid(cas) {
  const m = String(cas ?? "").trim().match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!m) return false;
  const digits = (m[1] + m[2]).split("").reverse();
  const sum = digits.reduce((s, d, i) => s + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]);
}

export function fmtDate(iso) {
  if (!iso) return NOT_FOUND;
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const masterRef = (article, what) => ({ source: "master", where: `Product master, ${article}, ${what}` });

const samePack = (a, b) => a && b && a.unit === b.unit && Math.abs(a.size - b.size) < 1e-9;

/** First expiry, first out: the in-date batch that expires soonest. */
export function fefo(batches, dispatchDate) {
  return [...(batches || [])]
    .filter((b) => b.expiry && b.expiry >= dispatchDate)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0))[0] || null;
}

/**
 * Checks one line. Returns the checks (pass / fail / none), the reasons it is held, and, when it
 * passes, the import row with every field's source.
 */
export function checkLine(line, master, { dispatchDate }) {
  const checks = [];
  const reasons = [];
  const hold = (code, text, mark) => reasons.push({ code, text, mark });
  const art = line.article?.value;
  const item = (art && master.find((m) => m.article === art)) || null;

  // 1. The article number is in the product master. Never matched by name.
  if (!art) {
    hold("unknown_article", "No article number on this line.", "article");
    checks.push({ key: "article", state: "fail", label: "Article", text: "No article number" });
  } else if (!item) {
    hold("unknown_article", `Art.-Nr. ${art} is not in the product master. Not matched by name.`, "article");
    checks.push({ key: "article", state: "fail", label: "Article", text: `${art}: ${NOT_FOUND} in the product master` });
  } else {
    checks.push({ key: "article", state: "pass", label: "Article", text: `${art}, ${item.name}` });
  }

  // 2. Quantity is a whole number of packs.
  const q = line.qty?.value;
  if (!(Number.isInteger(q) && q > 0)) {
    hold("quantity", `Quantity "${line.qty?.text ?? ""}" is not a whole number of packs.`, "qty");
    checks.push({ key: "qty", state: "fail", label: "Quantity", text: line.qty?.text ? `"${line.qty.text}"` : NOT_FOUND });
  }

  // 3. The pack size is one the article is sold in.
  const p = line.pack?.value;
  if (item) {
    const sold = item.packs.map(fmtPack).join(", ");
    if (!p) {
      hold("pack_size", `Pack "${line.pack?.text ?? ""}" could not be read. Sold as ${sold}.`, "pack");
      checks.push({ key: "pack", state: "fail", label: "Pack", text: `${line.pack?.text || NOT_FOUND}; sold as ${sold}` });
    } else if (!item.packs.some((x) => samePack(x, p))) {
      hold("pack_size", `${fmtPack(p)} is not a pack this article is sold in. Sold as ${sold}.`, "pack");
      checks.push({ key: "pack", state: "fail", label: "Pack", text: `${fmtPack(p)} ordered; sold as ${sold}` });
    } else {
      checks.push({ key: "pack", state: "pass", label: "Pack", text: `${fmtPack(p)}, a pack in the master` });
    }
  }

  // 4. CAS number: the master's has a valid check digit, and an order that carries one agrees.
  if (item) {
    if (!casValid(item.cas)) {
      hold("cas", `CAS ${item.cas || NOT_FOUND} in the product master fails the check digit.`, null);
      checks.push({ key: "cas", state: "fail", label: "CAS", text: `${item.cas || NOT_FOUND} fails the check digit` });
    } else if (line.cas && line.cas.value !== item.cas) {
      hold("cas", `CAS ${line.cas.value} on the order is not the master's ${item.cas}.`, "cas");
      checks.push({ key: "cas", state: "fail", label: "CAS", text: `${line.cas.value} on the order, ${item.cas} in the master` });
    } else {
      checks.push({ key: "cas", state: "pass", label: "CAS", text: line.cas ? `${item.cas}, matches the master, check digit valid` : `${item.cas}, check digit valid` });
    }
  }

  // 5. Dangerous goods. The master must say one of two things: the ADR entry, or that the article is not
  // dangerous goods (dg: false). A record that says neither is held. Missing is not the same as safe.
  if (item) {
    if (item.dg) {
      const miss = [];
      if (!/^\d{4}$/.test(item.dg.un || "")) miss.push("UN number");
      if (!item.dg.adrClass) miss.push("ADR class");
      if (!item.dg.packingGroup) miss.push("packing group");
      if (miss.length) {
        const list = miss.join(" and ");
        hold("dg_missing", `Dangerous goods, ADR class ${item.dg.adrClass || NOT_FOUND}, but the ${list} ${miss.length > 1 ? "are" : "is"} ${NOT_FOUND} in the product master. The transport document needs ${miss.length > 1 ? "them" : "it"} (ADR 5.4.1.1.1).`, null);
        checks.push({ key: "dg", state: "fail", label: "Dangerous goods", text: `Class ${item.dg.adrClass || "?"}, ${list} ${NOT_FOUND}` });
      } else {
        checks.push({ key: "dg", state: "pass", label: "Dangerous goods", text: `UN ${item.dg.un}, class ${item.dg.adrClass}, PG ${item.dg.packingGroup}` });
      }
    } else if (item.dg === false) {
      checks.push({ key: "dg", state: "pass", label: "Dangerous goods", text: "Marked as not dangerous goods in the master" });
    } else {
      hold("dg_unknown", `The product master does not say whether this article is dangerous goods. Not assumed safe.`, null);
      checks.push({ key: "dg", state: "fail", label: "Dangerous goods", text: `Status ${NOT_FOUND} in the product master` });
    }
  }

  // 6. Batch: a requested batch must exist and be in date on the dispatch day; otherwise first expiry, first out.
  let batch = null;
  let batchFrom = null;
  if (item) {
    if (line.batch) {
      const b = item.batches.find((x) => x.batch === line.batch.value);
      if (!b) {
        hold("batch_unknown", `Batch ${line.batch.value} is ${NOT_FOUND} in the product master.`, "batch");
        checks.push({ key: "batch", state: "fail", label: "Batch", text: `${line.batch.value}: ${NOT_FOUND}` });
      } else if (b.expiry < dispatchDate) {
        hold("expired_batch", `Batch ${b.batch} expired ${fmtDate(b.expiry)}; dispatch is ${fmtDate(dispatchDate)}. Not swapped for another batch without asking.`, "batch");
        checks.push({ key: "batch", state: "fail", label: "Batch", text: `${b.batch} expired ${fmtDate(b.expiry)}` });
      } else {
        batch = b;
        batchFrom = line.batch.ref;
        checks.push({ key: "batch", state: "pass", label: "Batch", text: `${b.batch} as ordered, expires ${fmtDate(b.expiry)}` });
      }
    } else {
      const b = fefo(item.batches, dispatchDate);
      if (!b) {
        hold("no_batch", `No batch in the product master is in date on ${fmtDate(dispatchDate)}.`, null);
        checks.push({ key: "batch", state: "fail", label: "Batch", text: `No in-date batch` });
      } else {
        batch = b;
        batchFrom = masterRef(item.article, "batches, first expiry first out");
        checks.push({ key: "batch", state: "pass", label: "Batch", text: `${b.batch} proposed (first expiry, first out), expires ${fmtDate(b.expiry)}` });
      }
    }
  }

  // Customer and purchase order are needed to place the line.
  if (!line.customer?.value) hold("header", `Customer ${NOT_FOUND} for this line.`, null);
  if (!line.po?.value) hold("header", `Purchase order number ${NOT_FOUND} for this line.`, null);

  const v = (x) => (x == null || x === "" ? NOT_FOUND : x);
  const row = {
    po: { value: v(line.po?.value), from: line.po?.ref || null },
    customer: { value: v(line.customer?.value), from: line.customer?.ref || null },
    article: { value: v(art), from: line.article?.ref || null },
    description: { value: v(item?.name), from: item ? masterRef(item.article, "name") : null },
    qty: { value: Number.isInteger(q) ? String(q) : NOT_FOUND, from: line.qty?.ref || null },
    pack: { value: p ? fmtPack(p) : NOT_FOUND, from: line.pack?.ref || null },
    cas: { value: v(item?.cas), from: line.cas ? line.cas.ref : item ? masterRef(item.article, "CAS") : null },
    un: { value: item?.dg ? v(item.dg.un) : "", from: item?.dg ? masterRef(item.article, "UN number") : null },
    adrClass: { value: item?.dg ? v(item.dg.adrClass) : "", from: item?.dg ? masterRef(item.article, "ADR class") : null },
    packingGroup: { value: item?.dg ? v(item.dg.packingGroup) : "", from: item?.dg ? masterRef(item.article, "packing group") : null },
    batch: { value: v(batch?.batch), from: batchFrom },
    expiry: { value: batch ? fmtDate(batch.expiry) : NOT_FOUND, from: batch ? masterRef(item.article, `batch ${batch.batch}, expiry`) : null },
  };

  return { line, item, checks, reasons, row };
}

const dupKey = (l) => [l.customer?.value, l.po?.value, l.article?.value, l.qty?.value, l.pack?.value?.size, l.pack?.value?.unit].join("|").toLowerCase();

/** Checks every line, then holds repeats: same customer, PO, article, quantity and pack as an earlier line. */
export function checkMorning(morning, master, { dispatchDate }) {
  const seen = new Map();
  const results = morning.lines.map((line) => {
    const r = checkLine(line, master, { dispatchDate });
    const key = dupKey(line);
    const first = seen.get(key);
    if (first) {
      r.reasons.push({
        code: "duplicate",
        text: `Same PO, article, quantity and pack as ${SOURCES[first.source]}, ${first.loc}. It could be a repeat or a second order. Held for a person to say which.`,
        mark: "article",
      });
      r.checks.push({ key: "dup", state: "fail", label: "Duplicate", text: `Same as ${SOURCES[first.source]}, ${first.loc}` });
      r.duplicateOf = first.id;
    } else {
      seen.set(key, line);
      r.checks.push({ key: "dup", state: "pass", label: "Duplicate", text: "First time this line appears" });
    }
    r.status = r.reasons.length ? "held" : "staged";
    return r;
  });
  for (const u of morning.unread || []) {
    results.push({
      line: { id: `${u.source}-unread-${u.line}`, source: u.source, loc: u.source === "csv" ? `Row ${u.line}` : `Line ${u.line}`, line: u.line, raw: u.raw },
      item: null,
      checks: [],
      reasons: [{ code: "unread", text: "This line looks like an order line but could not be read. Not guessed.", mark: null }],
      row: null,
      status: "held",
      unread: true,
    });
  }
  return results;
}

export function summarize(results) {
  const held = results.filter((r) => r.status === "held").length;
  return { total: results.length, held, staged: results.length - held };
}

const IMPORT_COLUMNS = [
  ["order_ref", "po"], ["customer", "customer"], ["article_no", "article"], ["description", "description"],
  ["qty_packs", "qty"], ["pack", "pack"], ["cas", "cas"], ["un_number", "un"], ["adr_class", "adrClass"],
  ["packing_group", "packingGroup"], ["batch", "batch"], ["batch_expiry", "expiry"],
];

const csvCell = (s) => {
  const t = String(s ?? "");
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Where a staged line came from, as one short reference. */
export function sourceRef(line) {
  return `${SOURCES[line.source]}, ${line.loc}`;
}

/** The import file: staged lines only, semicolon separated, each with the source line it came from. */
export function importCsv(results) {
  const head = [...IMPORT_COLUMNS.map((c) => c[0]), "source"];
  const rows = results
    .filter((r) => r.status === "staged")
    .map((r) => [...IMPORT_COLUMNS.map(([, k]) => r.row[k].value), sourceRef(r.line)]);
  return [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\n") + "\n";
}

export { IMPORT_COLUMNS };
