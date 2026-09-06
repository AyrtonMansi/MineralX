import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Plant plans are isolated by membership and cannot be changed by browser clients", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;",
    );
    for (const file of [
      "202609060001_gic.sql",
      "202609060003_plant_layouts.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const owner = "10000000-0000-4000-8000-000000000001",
      viewer = "10000000-0000-4000-8000-000000000002",
      outsider = "10000000-0000-4000-8000-000000000003",
      w = "20000000-0000-4000-8000-000000000001",
      other = "20000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users values($1),($2),($3)", [
      owner,
      viewer,
      outsider,
    ]);
    await db.query(
      "insert into gic_workspaces(id,name,mine_name) values($1,'Test','Test'),($2,'Other','Other')",
      [w, other],
    );
    await db.query(
      "insert into gic_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'viewer')",
      [w, owner, viewer],
    );
    await db.query(
      "insert into plant_layouts(workspace_id,revision,data) values($1,'Test','{}'),($2,'Test','{}')",
      [w, other],
    );
    const query = async (user: string, sql: string, role = "authenticated") => {
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          user,
        ]);
        await db.exec(`set local role ${role}`);
        return await db.query(sql);
      } finally {
        await db.exec("rollback");
      }
    };
    assert.equal(
      (await query(owner, "select * from plant_layouts")).rows.length,
      1,
    );
    assert.equal(
      (await query(viewer, "select * from plant_layouts")).rows.length,
      1,
    );
    assert.equal(
      (await query(outsider, "select * from plant_layouts")).rows.length,
      0,
    );
    await assert.rejects(
      () => query("", "select * from plant_layouts", "anon"),
      /permission denied/,
    );
    for (const user of [owner, viewer, outsider])
      await assert.rejects(
        () => query(user, "update plant_layouts set revision='changed'"),
        /permission denied/,
      );
    assert.equal(
      (await db.query("select * from plant_layouts")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
