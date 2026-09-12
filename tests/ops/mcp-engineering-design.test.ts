import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const files=await Promise.all([
 readFile(new URL('../../lib/mcp/plant-tools.ts',import.meta.url),'utf8'),
 readFile(new URL('../../app/api/mcp/route.ts',import.meta.url),'utf8'),
 readFile(new URL('../../components/ops/EngineeringCadPreview.tsx',import.meta.url),'utf8'),
 readFile(new URL('../../supabase/migrations/20260912050000_engineering_design_changesets.sql',import.meta.url),'utf8'),
]);
const [tools,route,preview,migration]=files;

test('ChatGPT MCP exposes read, instant-preview and durable plant design tools',()=>{
 for(const name of ['get_mineralx_plant_model','preview_mineralx_plant_design','list_mineralx_plant_designs','get_mineralx_plant_design','propose_mineralx_plant_design'])assert.match(tools,new RegExp(`registerTool\\('${name}'`));
 assert.match(route,/registerPlantMcpTools\(server, principal\)/);
});

test('instant previews reach the real Engineering CAD surface without a database write',()=>{
 assert.match(tools,/writes nothing to the database/);
 assert.match(tools,/draft/);
 assert.match(preview,/applyPlantDesignOperations/);
 assert.match(preview,/ChatGPT design preview/);
});

test('durable MCP geometry is proposal-only and routed through a closed gateway',()=>{
 assert.match(migration,/engineering_design_changesets/);
 assert.match(migration,/mx_ops_plant_design_create/);
 assert.match(migration,/p_operation not in\('mx_ops_plant_design_list','mx_ops_plant_design_read','mx_ops_plant_design_create'\)/);
 assert.doesNotMatch(migration,/plant\.operate|equipment\.start|equipment\.stop|physical_control/);
 assert.match(tools,/does not publish an as-built revision/);
 assert.match(tools,/does not.*control physical plant/);
});

test('the stored proposal requires plant.capture and deterministic validation',()=>{
 assert.match(migration,/require_permission\(p_scope,'plant\.capture'\)/);
 assert.match(migration,/p_validation->>'ok'='true'/);
 assert.match(migration,/IDEMPOTENCY_MISMATCH/);
});
