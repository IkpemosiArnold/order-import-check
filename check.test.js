import { test } from "node:test";
import assert from "node:assert/strict";
import { readMorning, parsePrinted, parseCsv, parseEmail, num, pack } from "./parse.js";
import { checkMorning, summarize, casValid, fefo, importCsv, NOT_FOUND } from "./check.js";
import * as S from "./samples.js";

const run = (over = {}) => {
  const master = over.master || S.master;
  const morning = readMorning({ printedList: S.printedList, csvExport: S.csvExport, email: S.email, ...over });
  return { morning, results: checkMorning(morning, master, { dispatchDate: S.dispatchDate }) };
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const sourceText = (morning, ref) => morning.text[ref.source][ref.line - 1].slice(ref.start, ref.end);

test("CAS check digit, as cas.org describes it", () => {
  assert.equal(casValid("107-07-3"), true); // the worked example on cas.org
  for (const m of S.master) assert.equal(casValid(m.cas), true, m.cas);
  assert.equal(casValid("64-17-6"), false);
  assert.equal(casValid("64175"), false);
  assert.equal(casValid(""), false);
});

test("German numbers and packs", () => {
  assert.equal(num("2,5"), 2.5);
  assert.equal(num("1.000"), 1000);
  assert.equal(num("abc"), null);
  assert.deepEqual(pack("2,5 l"), { size: 2.5, unit: "L" });
  assert.deepEqual(pack("25kg"), { size: 25, unit: "kg" });
  assert.equal(pack("25 Kanister"), null);
});

test("the sample morning: 13 lines, 8 staged, 5 held, one of each reason", () => {
  const { results } = run();
  assert.deepEqual(summarize(results), { total: 13, held: 5, staged: 8 });
  const held = Object.fromEntries(results.filter((r) => r.status === "held").map((r) => [r.line.id, r.reasons.map((x) => x.code)]));
  assert.deepEqual(held, {
    "printed-2": ["expired_batch"],
    "printed-4": ["unknown_article"],
    "csv-3": ["pack_size"],
    "csv-4": ["dg_missing"],
    "email-10": ["duplicate"],
  });
});

test("every field read from a source points at the exact text it came from", () => {
  const { morning } = run();
  assert.equal(morning.lines.length, 13);
  for (const l of morning.lines) {
    for (const k of ["customer", "po", "article", "qty", "description"]) {
      assert.ok(l[k].ref, `${l.id} ${k} has a reference`);
      assert.equal(sourceText(morning, l[k].ref), l[k].text, `${l.id} ${k}`);
    }
    const p = l.pack.ref.parts || [l.pack.ref];
    assert.ok(p.every((r) => sourceText(morning, r).length > 0), `${l.id} pack`);
  }
  const p2 = morning.lines.find((l) => l.id === "printed-2");
  assert.equal(sourceText(morning, p2.batch.ref), "C2511-008");
  const c4 = morning.lines.find((l) => l.id === "csv-4");
  assert.equal(c4.article.ref.cell, "D4");
  assert.equal(c4.cas.ref.cell, "E4");
});

test("every staged field has a value and a source; missing values say not found", () => {
  const { results } = run();
  for (const r of results.filter((x) => x.status === "staged")) {
    for (const [k, f] of Object.entries(r.row)) {
      if (["un", "adrClass", "packingGroup"].includes(k) && !r.item.dg) continue;
      assert.ok(f.value && f.value !== NOT_FOUND, `${r.line.id} ${k} has a value`);
      assert.ok(f.from && f.from.where, `${r.line.id} ${k} has a source`);
    }
  }
});

test("an unknown article is never matched by name", () => {
  const { results } = run();
  const r = results.find((x) => x.line.id === "printed-4");
  assert.equal(r.item, null);
  assert.equal(r.row.description.value, NOT_FOUND);
  assert.equal(r.row.cas.value, NOT_FOUND);
});

test("the expired batch is held, not swapped for an in-date one", () => {
  const { results } = run();
  const r = results.find((x) => x.line.id === "printed-2");
  assert.equal(r.row.batch.value, NOT_FOUND);
  assert.match(r.reasons[0].text, /31\.10\.2026/);
});

test("first expiry, first out skips expired batches", () => {
  const b = fefo([{ batch: "old", expiry: "2026-10-31" }, { batch: "late", expiry: "2029-01-01" }, { batch: "soon", expiry: "2027-01-01" }], "2026-11-13");
  assert.equal(b.batch, "soon");
  assert.equal(fefo([{ batch: "old", expiry: "2026-10-31" }], "2026-11-13"), null);
});

test("the repeat is held and the first one stays staged", () => {
  const { results } = run();
  assert.equal(results.find((x) => x.line.id === "csv-5").status, "staged");
  const dup = results.find((x) => x.line.id === "email-10");
  assert.equal(dup.duplicateOf, "csv-5");
});

test("filling in the UN number lets the acid through", () => {
  const master = clone(S.master);
  master.find((m) => m.article === "20220").dg.un = "1789";
  const { results } = run({ master });
  const r = results.find((x) => x.line.id === "csv-4");
  assert.equal(r.status, "staged");
  assert.equal(r.row.un.value, "1789");
  assert.deepEqual(summarize(results), { total: 13, held: 4, staged: 9 });
});

test("an article whose dangerous goods status is missing is held, not assumed safe", () => {
  const master = clone(S.master);
  delete master.find((m) => m.article === "20220").dg;
  const { results } = run({ master });
  const r = results.find((x) => x.line.id === "csv-4");
  assert.equal(r.status, "held");
  assert.deepEqual(r.reasons.map((x) => x.code), ["dg_unknown"]);
  assert.equal(results.find((x) => x.line.id === "printed-3").status, "staged"); // dg: false still passes
});

test("a CAS number on the order that disagrees with the master is held", () => {
  const csv = S.csvExport.replace("67-64-1", "67-64-2");
  const { results } = run({ csvExport: csv });
  assert.deepEqual(results.find((x) => x.line.id === "csv-5").reasons.map((r) => r.code), ["cas"]);
});

test("a requested batch that is not in the master says not found", () => {
  const printed = S.printedList.replace("C2511-008", "C9999-001");
  const { results } = run({ printedList: printed });
  const r = results.find((x) => x.line.id === "printed-2");
  assert.deepEqual(r.reasons.map((x) => x.code), ["batch_unknown"]);
  assert.match(r.reasons[0].text, /not found/);
});

test("an item-like line in the email that does not parse is held, not dropped", () => {
  const email = S.email.replace("6 x 1 L ethanol 96 %, art. 10110", "6 x 1 L ethanol 96 %, art. 10110\nsix bottles of the usual, art. 10110 too");
  const { results } = run({ email });
  const u = results.filter((r) => r.unread);
  assert.equal(u.length, 1);
  assert.equal(u[0].status, "held");
});

test("a printed list with an empty Charge cell reads the other columns correctly", () => {
  const p = parsePrinted(S.printedList);
  assert.equal(p.lines.length, 5);
  assert.equal(p.lines[0].batch, null);
  assert.equal(p.lines[0].pack.text, "25 L");
  assert.equal(p.lines[1].batch.value, "C2511-008");
});

test("CSV and email readers", () => {
  const c = parseCsv(S.csvExport);
  assert.equal(c.lines.length, 5);
  assert.deepEqual(c.lines[1].pack.value, { size: 10, unit: "L" });
  const e = parseEmail(S.email);
  assert.equal(e.lines.length, 3);
  assert.equal(e.lines[0].po.value, "EK-2026-0912");
  assert.equal(e.lines[0].customer.value, "Elbtal Kosmetik GmbH");
});

test("the import file has the staged lines only, each with its source", () => {
  const { results } = run();
  const rows = importCsv(results).trim().split("\n");
  assert.equal(rows.length, 1 + 8);
  assert.ok(rows[0].endsWith(";source"));
  assert.ok(rows.slice(1).every((r) => /;(Printed list|CSV export|Email), /.test(r)));
  assert.ok(!rows.some((r) => r.includes("10140")));
});
