import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyAnnual } from "../../lib/gic/model";
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001",
  viewer = "10000000-0000-4000-8000-000000000002",
  outsider = "10000000-0000-4000-8000-000000000003",
  otherOwner = "10000000-0000-4000-8000-000000000004";
const workspace = "20000000-0000-4000-8000-000000000001",
  otherWorkspace = "20000000-0000-4000-8000-000000000002",
  id = "30000000-0000-4000-8000-000000000001";
const data = {
  reference: "TEST-001",
  started_at: "2026-06-30T20:00:00+10:00",
  processed_at: "2026-06-30T23:59:00+10:00",
  feed_tonnes: 12.25,
  gross_grams: 125.5,
  gold_percent: 82.4,
  notes: "test only",
  status: "active",
};
before(async () => {
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202609060001_gic.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202609060002_run_timing.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [
    owner,
    viewer,
    outsider,
    otherOwner,
  ]);
  await db.query(
    "insert into gic_workspaces(id,name,mine_name) values($1,'Test operation','Test mine'),($2,'Other operation','Other mine')",
    [workspace, otherWorkspace],
  );
  await db.query(
    "insert into gic_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",
    [workspace, owner, viewer, otherWorkspace, otherOwner],
  );
});
after(async () => {
  await db.close();
});
async function asUser(
  user: string,
  sql: string,
  params: unknown[] = [],
  role = "authenticated",
) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    await db.exec(`set local role ${role}`);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows as Record<string, any>[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const save = "select gic_save_run($1,$2,$3,$4::jsonb,$5)";
test("owner creates durable run and immutable audit entry atomically", async () => {
  await asUser(owner, save, [workspace, id, 0, JSON.stringify(data), ""]);
  const records = await asUser(owner, "select * from gic_runs");
  assert.equal(records.length, 1);
  assert.equal(records[0].data.gross_grams, 125.5);
  assert.equal(records[0].created_by, owner);
  assert.equal((await asUser(owner, "select * from gic_audit"))[0].version, 1);
});
test("anonymous and non-members cannot access run records", async () => {
  await assert.rejects(
    asUser("", "select * from gic_runs", [], "anon"),
    /permission denied/,
  );
  assert.equal((await asUser(outsider, "select * from gic_runs")).length, 0);
  assert.equal((await asUser(otherOwner, "select * from gic_runs")).length, 0);
  assert.equal((await asUser(otherOwner, "select * from gic_audit")).length, 0);
  assert.equal(
    (
      await asUser(
        otherOwner,
        "select gic_export_snapshot($1,2026) as result",
        [workspace],
      )
    )[0].result,
    null,
  );
});
test("viewers can read but cannot mutate, and direct writes cannot bypass audit", async () => {
  assert.equal((await asUser(viewer, "select * from gic_runs")).length, 1);
  await assert.rejects(
    asUser(viewer, save, [workspace, id, 1, JSON.stringify(data), "change"]),
    /Access denied/,
  );
  await assert.rejects(
    asUser(owner, "delete from gic_audit"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(owner, "update gic_runs set version=99"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(owner, "update gic_members set role='owner'"),
    /permission denied/,
  );
});
test("cross-workspace mutation, missing values and duplicate identifiers fail", async () => {
  await assert.rejects(
    asUser(otherOwner, save, [
      workspace,
      id,
      1,
      JSON.stringify(data),
      "change",
    ]),
    /Access denied/,
  );
  await assert.rejects(
    asUser(owner, save, [
      workspace,
      "30000000-0000-4000-8000-000000000002",
      0,
      JSON.stringify(data),
      "",
    ]),
    /duplicate key/,
  );
  await assert.rejects(
    asUser(owner, save, [
      workspace,
      id,
      1,
      JSON.stringify({ ...data, gold_percent: null }),
      "bad value",
    ]),
    /Invalid number/,
  );
  await assert.rejects(
    asUser(owner, save, [
      workspace,
      id,
      null,
      JSON.stringify(data),
      "null version",
    ]),
    /Invalid version/,
  );
  await assert.rejects(
    asUser(owner, save, [
      workspace,
      id,
      1,
      JSON.stringify({ ...data, gold_percent: 101 }),
      "bad purity",
    ]),
    /Invalid gold percentage/,
  );
});
test("corrections preserve original values and reject stale updates", async () => {
  await asUser(owner, save, [
    workspace,
    id,
    1,
    JSON.stringify({ ...data, gross_grams: 130 }),
    "Correct scale reading",
  ]);
  await assert.rejects(
    asUser(owner, save, [workspace, id, 1, JSON.stringify(data), "stale"]),
    /CONFLICT/,
  );
  const history = await asUser(
    owner,
    "select * from gic_audit order by version",
  );
  assert.equal(history.length, 2);
  assert.equal(history[0].snapshot.gross_grams, 125.5);
  assert.equal(history[1].snapshot.gross_grams, 130);
});
test("annual review binds to a processing revision; subsequent changes invalidate it", async () => {
  const annual = {
    ...emptyAnnual(),
    coverage_confirmed: true,
    checks: { PRODUCTS_PROCESSED: true },
  };
  await asUser(owner, "select gic_save_annual($1,2026,0,$2::jsonb,2)", [
    workspace,
    JSON.stringify(annual),
  ]);
  const first = (
    await asUser(owner, "select gic_export_snapshot($1,2026) as result", [
      workspace,
    ])
  )[0].result;
  assert.equal(first.runs_version, first.report.runs_version);
  assert.equal(first.runs.length, 1);
  // Moving a run OUT of a financial year must invalidate that old year's return too.
  await asUser(owner, save, [
    workspace,
    id,
    2,
    JSON.stringify({ ...data, processed_at: "2026-07-01T00:01:00+10:00" }),
    "Correct processing date",
  ]);
  const changed = (
    await asUser(owner, "select gic_export_snapshot($1,2026) as result", [
      workspace,
    ])
  )[0].result;
  assert.equal(changed.runs.length, 0);
  assert.notEqual(changed.runs_version, changed.report.runs_version);
  await assert.rejects(
    asUser(owner, "select gic_save_annual($1,2026,1,$2::jsonb,2)", [
      workspace,
      JSON.stringify(annual),
    ]),
    /CONFLICT/,
  );
});
test("voiding retains the run and audit rather than deleting production history", async () => {
  await asUser(owner, save, [
    workspace,
    id,
    3,
    JSON.stringify({ ...data, status: "void" }),
    "Duplicate production record",
  ]);
  assert.equal(
    (await asUser(owner, "select data from gic_runs"))[0].data.status,
    "void",
  );
  assert.equal(
    (await asUser(owner, "select * from gic_audit where entity_type='run'"))
      .length,
    4,
  );
});
test("annual storage rejects malformed rows even when bypassing the website", async () => {
  await assert.rejects(
    asUser(owner, "select gic_save_annual($1,2027,0,$2::jsonb,4)", [
      workspace,
      JSON.stringify({ ...emptyAnnual(), rows: { SALES: ["bad"] } }),
    ]),
    /Invalid row/,
  );
  await assert.rejects(
    asUser(owner, "select gic_save_annual($1,2027,0,$2::jsonb,4)", [
      workspace,
      JSON.stringify({ ...emptyAnnual(), checks: { SALES: "yes" } }),
    ]),
    /Invalid review/,
  );
});

test("database rejects missing or reversed start/end times", async () => {
  const badId = "30000000-0000-4000-8000-000000000009";
  for (const started_at of [
    undefined,
    null,
    "2026-07-01T00:00:00+10:00",
    data.processed_at,
  ]) {
    await assert.rejects(
      asUser(owner, save, [
        workspace,
        badId,
        0,
        JSON.stringify({ ...data, reference: "BAD-TIME", started_at }),
        "",
      ]),
      /Start time|End time/,
    );
  }
});
