// Self-host pinned WASM and schema: no CDN, credentials, operational data or runtime SQL fetch.
import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
const migrations=['202609060001_gic.sql','202609060002_run_timing.sql','20260907010000_operations_core.sql','20260907011000_operations_gold.sql','20260907012000_operations_geology.sql','20260907013000_operations_reads.sql','20260907073020_operations_acceptance_fixes.sql','20260907090000_operations_reconciliation.sql','20260909020000_operations_workflow.sql','20260910010000_operations_processing_program_choices.sql'];
await mkdir('public/ops-development-assets',{recursive:true});
for(const file of ['pglite.wasm','initdb.wasm','pglite.data'])await copyFile('node_modules/@electric-sql/pglite/dist/'+file,'public/ops-development-assets/'+file);
const sql=await Promise.all(migrations.map(async name=>({name,sql:await readFile('supabase/migrations/'+name,'utf8')})));
await writeFile('lib/ops/development-schema.generated.ts','// Generated from the reviewed migrations. Browser-local sandbox only.\nexport default '+JSON.stringify(sql)+';\n');
