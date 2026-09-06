import { z } from "zod";
import template from "./return-schema.json";

export const vocabulary = template.vocabulary;
export const runSchema = z
  .object({
    reference: z.string().trim().min(1).max(80),
    processed_at: z
      .string()
      .datetime({ offset: true })
      .refine(
        (v) =>
          Date.parse(v) <= Date.now() + 60_000 &&
          Date.parse(v) >= Date.parse("2000-01-01"),
        "Check the processing timestamp.",
      ),
    feed_tonnes: z.number().finite().min(0).max(9999999999),
    gross_grams: z.number().finite().min(0).max(9999999999),
    gold_percent: z.number().finite().min(0).max(100),
    notes: z.string().trim().max(2000),
    status: z.enum(["active", "void"]),
  })
  .strict();

export type RunInput = z.infer<typeof runSchema>;
export type Run = {
  id: string;
  workspace_id: string;
  version: number;
  data: RunInput;
  created_at: string;
  updated_at: string;
};
export type Workspace = {
  id: string;
  name: string;
  mine_name: string;
  runs_version: number;
  role: "owner" | "editor" | "viewer";
};
export function fineGold(run: RunInput) {
  return (run.gross_grams * run.gold_percent) / 100;
}
export function financialYear(iso: string) {
  const date = new Date(new Date(iso).getTime() + 10 * 60 * 60 * 1000);
  return date.getUTCFullYear() + (date.getUTCMonth() >= 6 ? 1 : 0);
}
export function fyLabel(year: number) {
  return `${year - 1}–${String(year).slice(-2)}`;
}
export function fyBounds(year: number) {
  return {
    from: `${year - 1}-07-01T00:00:00+10:00`,
    to: `${year}-07-01T00:00:00+10:00`,
  };
}
export function localInput(iso: string) {
  return new Date(new Date(iso).getTime() + 36e5 * 10)
    .toISOString()
    .slice(0, 16);
}
export function displayDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
export function grams(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}
export const componentNames = Object.keys(template.components) as Component[];
export type Component = keyof typeof template.components;
export type ReturnRow = Record<string, string>;
export const componentLabels: Record<Component, string> = {
  MINE_DETAILS: "Mine details",
  TENEMENT_STATUS: "Tenements",
  RAW_MATERIAL_MINED: "Material mined",
  RAW_MATERIAL_TRANSFERRED: "Transfers",
  RAW_COMMODITY_STOCKPILE: "Stockpiles",
  PRODUCTS_PROCESSED: "Processing",
  SALES: "Sales",
};
export const fields = template.components;
const fieldVocab: Record<string, keyof typeof vocabulary> = {
  WASTE_UNITS: "B",
  TENEMENT_TYPE: "E",
  PRODUCTION_STATUS: "F",
  MATERIAL_MINED: "L",
  OUTPUT_UNITS: "B",
  CONTAINED_COMMODITY: "AE",
  GRADE_UNIT: "D",
  TRANSFER_TYPE: "G",
  MATERIAL_TRANSFERRED: "L",
  TRANSFER_UNIT: "C",
  COMMODITY_UNIT: "B",
  MATERIAL_STOCKPILED: "L",
  STOCKPILE_UNIT: "C",
  STOCKPILE_PURPOSE: "I",
  COUNTRY: "J",
  AUSTRALIAN_STATE: "K",
  PRODUCT_FORM: "N",
  PRODUCT_UNITS: "B",
  INPUT_MATERIAL: "M",
};
export function optionsFor(key: string): string[] | undefined {
  return fieldVocab[key] ? vocabulary[fieldVocab[key]] : undefined;
}
export function fieldLabel(key: string) {
  return key
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
}
export type AnnualData = {
  rows: Partial<Record<Component, ReturnRow[]>>;
  checks: Partial<Record<Component, boolean>>;
  notes: string;
  coverage_confirmed: boolean;
  lodgement_date: string;
  lodgement_reference: string;
};
export type AnnualReport = {
  id: string;
  workspace_id: string;
  year: number;
  version: number;
  runs_version: number;
  data: AnnualData;
  updated_at: string;
};
export const emptyAnnual = (): AnnualData => ({
  rows: {},
  checks: {},
  notes: "",
  coverage_confirmed: false,
  lodgement_date: "",
  lodgement_reference: "",
});
export const annualSchema = z
  .object({
    rows: z.partialRecord(
      z.enum(componentNames as [Component, ...Component[]]),
      z.array(z.record(z.string().max(80), z.string().max(2000))).max(1000),
    ),
    checks: z.partialRecord(
      z.enum(componentNames as [Component, ...Component[]]),
      z.boolean(),
    ),
    notes: z.string().max(4000),
    coverage_confirmed: z.boolean(),
    lodgement_date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
    lodgement_reference: z.string().max(200),
  })
  .strict()
  .refine(
    (v) => Boolean(v.lodgement_date) === Boolean(v.lodgement_reference),
    "Enter both the lodgement date and receipt reference.",
  );
export function rowIssues(
  component: Component,
  row: ReturnRow,
  year: number,
): string[] {
  const issues: string[] = [];
  for (const field of fields[component]) {
    const value = row[field.key]?.trim() ?? "";
    if (!value) {
      if (field.required) issues.push(fieldLabel(field.key));
      continue;
    }
    if (
      field.type === "number" &&
      (!Number.isFinite(Number(value)) || Number(value) < 0)
    )
      issues.push(`${fieldLabel(field.key)} must be a non-negative number`);
    if (
      field.type === "text" &&
      /^\d+$/.test(field.limit) &&
      value.length > Number(field.limit)
    )
      issues.push(`${fieldLabel(field.key)} is too long`);
    const opts = optionsFor(field.key);
    if (opts && !opts.includes(value))
      issues.push(`${fieldLabel(field.key)}: choose a template value`);
    if (field.type === "date") {
      const d = new Date(`${value}T00:00:00+10:00`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(d.getTime()) ||
        localInput(d.toISOString()).slice(0, 10) !== value
      )
        issues.push(`${fieldLabel(field.key)} is invalid`);
      else if (financialYear(d.toISOString()) !== year)
        issues.push(
          `${fieldLabel(field.key)} falls outside this financial year`,
        );
    }
  }
  if (component === "MINE_DETAILS") {
    if (row.PERIOD_END !== `${year}-06-30`)
      issues.push("Period end must be 30 June of this reporting year");
    const maxDays =
      (Date.parse(fyBounds(year).to) - Date.parse(fyBounds(year).from)) / 864e5;
    if (
      !Number.isInteger(Number(row.DAYS_OF_OPERATION)) ||
      Number(row.DAYS_OF_OPERATION) > maxDays
    )
      issues.push("Check days of operation");
  }
  if (
    component === "PRODUCTS_PROCESSED" &&
    row.RECOVERY &&
    (!Number.isInteger(Number(row.RECOVERY)) || Number(row.RECOVERY) > 100)
  )
    issues.push("Recovery must be a whole percentage from 0 to 100");
  if (
    component === "SALES" &&
    row.COUNTRY === "Australia" &&
    (!row.AUSTRALIAN_STATE ||
      row.TOTAL_FREIGHT_COST === "" ||
      row.TOTAL_FREIGHT_COST === undefined)
  )
    issues.push(
      "Australian sales require destination state and freight cost (zero if none)",
    );
  return issues;
}
export function processingRows(
  runs: Run[],
  annual: AnnualData,
  mineName: string,
): ReturnRow[] {
  const active = runs.filter((r) => r.data.status === "active");
  if (!active.length) return [];
  const extra = annual.rows.PRODUCTS_PROCESSED?.[0] ?? {};
  return [
    {
      INPUT_NUMBER: "1",
      INPUT_MATERIAL: extra.INPUT_MATERIAL || "",
      INPUT_QTY: String(
        Math.round(active.reduce((s, r) => s + r.data.feed_tonnes, 0)),
      ),
      INPUT_UNITS: "TONNES (t)",
      PROCESS: "Gravity Concentrate",
      PROCESSOR: extra.PROCESSOR || mineName,
      PRODUCT_NUMBER: "1",
      PRODUCT_FORM: "Bullion",
      OUTPUT_QTY: String(
        Number(active.reduce((s, r) => s + r.data.gross_grams, 0).toFixed(5)),
      ),
      OUTPUT_UNITS: "GRAMS (g)",
      CONTAINED_COMMODITY: "Gold (Au)",
      CONTAINED_COMMODITY_QTY: String(
        Number(active.reduce((s, r) => s + fineGold(r.data), 0).toFixed(5)),
      ),
      CONTAINED_COMMODITY_UNIT: "GRAMS (g)",
      RECOVERY: extra.RECOVERY ?? "",
    },
  ];
}
export function csv(headers: string[], rows: ReturnRow[]): string {
  const escape = (value: unknown) => {
    const s = String(value ?? "");
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(s) ? `'${s}` : s;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))]
      .map((r) => r.map(escape).join(","))
      .join("\r\n") + "\r\n"
  );
}
export function componentCsv(component: Component, rows: ReturnRow[]): string {
  const headers = fields[component].map((f) => f.key);
  const exported = rows.map((row) =>
    Object.fromEntries(
      fields[component].map((f) => {
        const value = row[f.key] ?? "";
        return [
          f.key,
          f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? value.split("-").reverse().join("-")
            : value,
        ];
      }),
    ),
  );
  return csv(headers, exported);
}
