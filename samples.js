// Sample data for one morning at a made-up fine chemicals distributor in Germany.
// Customers, orders, batches and expiry dates are invented for this demo.
// CAS numbers, UN numbers and ADR classes are the public values for these substances;
// packing groups match the ADR 2025 entries for these strengths. Check your own SDS, section 14.

export const dispatchDate = "2026-11-13";

// A printed order list, typed out line by line as it reads on paper.
export const printedList = `AUFTRAGSLISTE                          Druck 12.11.2026 07:12
Kunde: Muster Pharma GmbH              Bestell-Nr.: 4500017731
Liefertermin: 13.11.2026

Pos  Art.-Nr.  Bezeichnung                  Menge  Gebinde  Charge
1    10110     Ethanol 96 % Ph. Eur.        4      25 L
2    30310     Citronensäure wasserfrei     2      25 kg    C2511-008
3    40410     Cellulose mikrokristallin    5      20 kg
4    10140     Ethanol 70 %                 6      5 L
5    40420     Magnesiumstearat             2      10 kg`;

// A CSV export from a customer's purchasing system. German Excel style: semicolons, decimal commas.
export const csvExport = `Kunde;Bestellnr;Pos;Art.-Nr.;CAS;Bezeichnung;Menge;Gebinde;Einheit
Elbtal Kosmetik GmbH;EK-2026-0912;10;30320;56-81-5;Glycerin 99,5 %;3;25;kg
Elbtal Kosmetik GmbH;EK-2026-0912;20;10130;67-63-0;2-Propanol;8;10;L
Elbtal Kosmetik GmbH;EK-2026-0912;30;20220;7647-01-0;Salzsäure 37 %;2;25;L
Elbtal Kosmetik GmbH;EK-2026-0912;40;10120;67-64-1;Aceton;1;200;L
Elbtal Kosmetik GmbH;EK-2026-0912;50;30330;7647-14-5;Natriumchlorid;10;25;kg`;

// An emailed order from the same customer, adding to the same purchase order.
export const email = `From: Jana Weber, Elbtal Kosmetik GmbH <einkauf@elbtal-kosmetik.example>
Sent: Thu 12 Nov 2026 07:48
Subject: PO EK-2026-0912, a few more items

Good morning,

please add these to PO EK-2026-0912 for tomorrow:

2 x 25 kg sodium hydroxide solution 50 %, art. 20210
1 x 200 L acetone, art. 10120
6 x 1 L ethanol 96 %, art. 10110

Thanks and best regards
Jana Weber
Purchasing`;

// The product master (Artikelstamm). dg is false where the master marks the article as not dangerous goods.
// A record with no dg entry at all is held: missing is not the same as safe.
export const master = [
  {
    article: "10110", name: "Ethanol 96 % Ph. Eur.", cas: "64-17-5",
    packs: [{ size: 1, unit: "L" }, { size: 2.5, unit: "L" }, { size: 25, unit: "L" }, { size: 200, unit: "L" }],
    dg: { un: "1170", adrClass: "3", packingGroup: "II" },
    batches: [{ batch: "E2603-052", expiry: "2027-03-31" }, { batch: "E2607-114", expiry: "2028-07-31" }],
  },
  {
    article: "10120", name: "Aceton technisch", cas: "67-64-1",
    packs: [{ size: 2.5, unit: "L" }, { size: 25, unit: "L" }, { size: 200, unit: "L" }],
    dg: { un: "1090", adrClass: "3", packingGroup: "II" },
    batches: [{ batch: "A2605-031", expiry: "2028-05-31" }],
  },
  {
    article: "10130", name: "2-Propanol Ph. Eur.", cas: "67-63-0",
    packs: [{ size: 1, unit: "L" }, { size: 5, unit: "L" }, { size: 25, unit: "L" }, { size: 200, unit: "L" }],
    dg: { un: "1219", adrClass: "3", packingGroup: "II" },
    batches: [{ batch: "P2606-077", expiry: "2028-06-30" }],
  },
  {
    article: "20210", name: "Natronlauge 50 %", cas: "1310-73-2",
    packs: [{ size: 25, unit: "kg" }, { size: 1000, unit: "kg" }],
    dg: { un: "1824", adrClass: "8", packingGroup: "II" },
    batches: [{ batch: "N2609-012", expiry: "2027-09-30" }],
  },
  {
    // The UN number was never filled in for this article.
    article: "20220", name: "Salzsäure 37 % technisch", cas: "7647-01-0",
    packs: [{ size: 2.5, unit: "L" }, { size: 25, unit: "L" }],
    dg: { un: "", adrClass: "8", packingGroup: "II" },
    batches: [{ batch: "S2608-044", expiry: "2027-08-31" }],
  },
  {
    article: "30310", name: "Citronensäure wasserfrei Ph. Eur.", cas: "77-92-9",
    packs: [{ size: 1, unit: "kg" }, { size: 25, unit: "kg" }],
    dg: false,
    batches: [{ batch: "C2511-008", expiry: "2026-10-31" }, { batch: "C2604-021", expiry: "2029-04-30" }],
  },
  {
    article: "30320", name: "Glycerin 99,5 % Ph. Eur.", cas: "56-81-5",
    packs: [{ size: 1, unit: "kg" }, { size: 25, unit: "kg" }, { size: 250, unit: "kg" }],
    dg: false,
    batches: [{ batch: "G2602-019", expiry: "2027-02-28" }, { batch: "G2608-066", expiry: "2028-08-31" }],
  },
  {
    article: "30330", name: "Natriumchlorid Ph. Eur.", cas: "7647-14-5",
    packs: [{ size: 1, unit: "kg" }, { size: 25, unit: "kg" }],
    dg: false,
    batches: [{ batch: "K2601-003", expiry: "2029-01-31" }],
  },
  {
    article: "40410", name: "Cellulose mikrokristallin Ph. Eur.", cas: "9004-34-6",
    packs: [{ size: 20, unit: "kg" }],
    dg: false,
    batches: [{ batch: "M2512-090", expiry: "2027-12-31" }, { batch: "M2606-015", expiry: "2028-06-30" }],
  },
  {
    article: "40420", name: "Magnesiumstearat Ph. Eur.", cas: "557-04-0",
    packs: [{ size: 10, unit: "kg" }, { size: 25, unit: "kg" }],
    dg: false,
    batches: [{ batch: "T2603-027", expiry: "2027-03-31" }],
  },
];
