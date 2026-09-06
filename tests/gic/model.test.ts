import test from "node:test";
import assert from "node:assert/strict";
import {
  annualSchema,
  componentCsv,
  csv,
  emptyAnnual,
  financialYear,
  fineGold,
  processingRows,
  rowIssues,
  runSchema,
  type Run,
  type RunInput,
} from "../../lib/gic/model";
const input: RunInput = {
  reference: "TEST-001",
  processed_at: "2026-06-30T23:59:00+10:00",
  feed_tonnes: 12.25,
  gross_grams: 125.5,
  gold_percent: 82.4,
  notes: "",
  status: "active",
};
const run: Run = {
  id: "00000000-0000-4000-8000-000000000001",
  workspace_id: "test",
  version: 1,
  data: input,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};
test("four run metrics calculate contained gold without treating purity as recovery", () => {
  assert.equal(runSchema.safeParse(input).success, true);
  assert.ok(Math.abs(fineGold(input) - 103.412) < 1e-9);
  assert.equal(
    processingRows([run], emptyAnnual(), "Test mine")[0].RECOVERY,
    "",
  );
});
test("Queensland financial-year boundary uses AEST, not UTC or browser zone", () => {
  assert.equal(financialYear("2026-06-30T13:59:59Z"), 2026);
  assert.equal(financialYear("2026-06-30T14:00:00Z"), 2027);
});
test("missing, negative, non-finite, impossible purity and future timestamps are rejected", () => {
  for (const patch of [
    { feed_tonnes: undefined },
    { gross_grams: -1 },
    { gold_percent: 101 },
    { gross_grams: Infinity },
    { processed_at: "2099-01-01T00:00:00Z" },
    { feed_tonnes: "12" },
    { gold_percent: null },
  ])
    assert.equal(runSchema.safeParse({ ...input, ...patch }).success, false);
  assert.equal(
    runSchema.safeParse({
      ...input,
      gross_grams: 0,
      gold_percent: 0,
      feed_tonnes: 0,
    }).success,
    true,
  );
});
test("annual aggregation excludes voided runs and preserves contained-gold mass", () => {
  const annual = emptyAnnual();
  annual.rows.PRODUCTS_PROCESSED = [
    { RECOVERY: "80", INPUT_MATERIAL: "Alluvial Wash" },
  ];
  const rows = processingRows(
    [
      run,
      {
        ...run,
        id: "second",
        data: { ...input, gross_grams: 10, gold_percent: 50, feed_tonnes: 1.2 },
      },
      { ...run, id: "void", data: { ...input, status: "void" } },
    ],
    annual,
    "Test mine",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].INPUT_QTY, "13");
  assert.equal(rows[0].OUTPUT_QTY, "135.5");
  assert.equal(rows[0].CONTAINED_COMMODITY_QTY, "108.412");
  assert.equal(rows[0].PROCESS, "Gravity Concentrate");
  assert.equal(rows[0].RECOVERY, "80");
  assert.equal(processingRows([], annual, "Test mine").length, 0);
});
test("annual drafts permit partial work without inventing nil entries", () => {
  assert.equal(annualSchema.safeParse(emptyAnnual()).success, true);
  assert.equal(
    annualSchema.safeParse({
      ...emptyAnnual(),
      rows: { MINE_DETAILS: [{ MINE_NAME: "Test mine" }] },
    }).success,
    true,
  );
  assert.equal(
    annualSchema.safeParse({ ...emptyAnnual(), rows: { UNKNOWN: [] } }).success,
    false,
  );
  assert.equal(
    annualSchema.safeParse({ ...emptyAnnual(), lodgement_date: "2026-09-01" })
      .success,
    false,
  );
});
test("component checks enforce period, leap-year days, domestic freight and unknown recovery", () => {
  const mine = {
    MINE_NAME: "Test mine",
    MINE_OPERATOR: "Test operator",
    PERIOD_END: "2026-06-30",
    DAYS_OF_OPERATION: "365",
    WASTE_ROCK: "0",
    WASTE_UNITS: "TONNES (t)",
  };
  assert.deepEqual(rowIssues("MINE_DETAILS", mine, 2026), []);
  assert.ok(
    rowIssues("MINE_DETAILS", { ...mine, DAYS_OF_OPERATION: "366" }, 2026)
      .length,
  );
  assert.ok(
    rowIssues("MINE_DETAILS", { ...mine, PERIOD_END: "2026-02-30" }, 2026)
      .length,
  );
  assert.ok(
    rowIssues("SALES", { COUNTRY: "Australia" }, 2026).some((v) =>
      v.includes("freight"),
    ),
  );
  assert.ok(
    rowIssues(
      "PRODUCTS_PROCESSED",
      processingRows([run], emptyAnnual(), "Test mine")[0],
      2026,
    ).includes("Recovery"),
  );
});
test("official CSV preserves headers and DD-MM-YYYY dates; cells cannot execute formulas", () => {
  const text = componentCsv("MINE_DETAILS", [
    { MINE_NAME: "Test mine", PERIOD_END: "2026-06-30" },
  ]);
  assert.ok(text.startsWith('"MINE_NAME","MINE_OPERATOR","PERIOD_END"'));
  assert.ok(text.includes('"30-06-2026"'));
  assert.equal(
    csv(
      ["Notes"],
      [
        { Notes: '=HYPERLINK("bad")' },
        { Notes: "\t+SUM(1,2)" },
        { Notes: 'safe, "quoted"\ntext' },
      ],
    ),
    '"Notes"\r\n"\'=HYPERLINK(""bad"")"\r\n"\'\t+SUM(1,2)"\r\n"safe, ""quoted""\ntext"\r\n',
  );
});
