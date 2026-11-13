# Order Import Check

One morning's orders arrive three ways: a printed order list typed out line by line, a CSV export from a customer's purchasing system, and an email. Plain code reads all three, checks every line against a product master, and stages a clean import file that a person approves before it goes anywhere. Anything that does not check out is held back with the reason.

The sample is a made-up fine chemicals distributor in Germany: 13 order lines from two customers. Eight are staged. Five are held back on purpose.

## The checks

A line is staged only when all of these hold:

1. **The article number is in the product master.** It is never matched by name. "Ethanol 70 %" with an unknown article number stays unknown.
2. **The pack is one the article is sold in.** 10 L of an article sold in 1, 5, 25 and 200 L is held. Nobody turns it into something else.
3. **The CAS number checks out.** The master's CAS number passes its check digit, and a CAS number on the order matches the master.
4. **A dangerous good has its transport fields.** UN number, ADR class and packing group must be in the master, because the road transport document needs them.
5. **The batch is in date on the dispatch day.** A batch the customer asked for must exist and not be expired. It is not swapped for another batch without asking. With no batch requested, the page proposes the in-date batch that expires first.
6. **It is not a repeat.** Same customer, purchase order, article, quantity and pack as an earlier line, for example a line that is in the CSV and again in the email.

The five held in the sample: an expired requested batch, an unknown article number, a pack size not sold, a hazardous acid with no UN number in the master, and a repeated line.

## Every field has a source

Tap any line. The page shows the source it came from (the printed-list columns, the CSV cells by spreadsheet name such as `D4`, or the email line) with the values it used underlined. For a staged line it lists every import field with its value and where that value came from: a cell, a line, or a named field in the product master. Anything not found says "not found".

The import file carries a `source` column, so every line in the ERP can be traced back to the order it came from.

Press "Fill in UN 1789 for me" to complete the acid's master record and watch that line go through.

## Terms

- **CAS number**: registry number of a substance. The last digit is a check digit, tested as described by CAS: https://www.cas.org/training/documentation/chemical-substances/checkdig
- **UN number, ADR class, packing group**: particulars a dangerous goods transport document needs under ADR 5.4.1.1.1, with values from ADR Table A. UNECE: https://unece.org/transport/dangerous-goods. Plain summary from the UK HSE: https://www.hse.gov.uk/cdg/manual/consignment.htm
- **First expiry, first out (FEFO)**: stock leaves in order of expiry, and expired stock is removed from saleable stock. EU Good Distribution Practice guidelines 2013/C 343/01, section 5.5: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52013XC1123(01)
- **Art.-Nr., Bezeichnung, Menge, Gebinde, Charge**: the German column names on the order list: article number, description, quantity, pack, batch.

## Where a model would go

A model could read a photo of the printed list, or a free-form email, into lines. This check sits between that reading and the ERP. A person only approves lines whose every field already traces back to a source and a master record.

## Run the tests

```
node --test
```

Needs Node 20 or later. No dependencies.

## Open the page locally

```
python3 -m http.server 8786
```

Then open http://localhost:8786. The page makes no network calls beyond its own files.

## Limits

- It reads typed text. A scanned list would need OCR first, and OCR output would need its own check.
- The email reader expects lines shaped "2 x 25 kg name, art. 12345". Anything item-like that does not fit is held as unread, not guessed.
- No stock levels, prices, customer-specific minimum shelf life, or segregation of incompatible dangerous goods.
- CAS numbers, UN numbers and ADR classes are the public values for these substances. Packing groups are the usual ones for these grades; a real master takes them from each supplier's SDS, section 14.
- The import format is a generic semicolon CSV. A real ERP has its own import format.

## Design

It follows the shared direction for these demos: rows split by hairlines, the result as the largest thing on the page, and an underline that draws under the values a line uses. Public Sans for the tool, Newsreader for anything quoted from a source, navy ink and a periwinkle accent.

Fonts: Public Sans and Newsreader (SIL Open Font License), latin subsets in `fonts/`, served from this folder.

## Provenance

Built on 13 Nov 2026 with AI coding agents, directed by Arnold Ikpemosi Adeyemi. Made-up customers, orders and batches. Not regulatory advice.

## Licence

MIT. See `LICENSE`.
