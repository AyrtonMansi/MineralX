import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../../lib/mcp/plant-tools.ts',import.meta.url),'utf8');
const model=await readFile(new URL('../../lib/plant/equipment-model.ts',import.meta.url),'utf8');

test('ChatGPT can audit equipment modelling gaps before inventing dimensions',()=>{
 assert.match(source,/registerTool\('get_mineralx_equipment_modeling_gaps'/);
 assert.match(source,/Use verified source evidence when available/);
 assert.match(source,/without representing those dimensions as measured, OEM or as-built/);
});

test('modelling gap guidance covers core processing and gravity equipment',()=>{
 for(const key of ['hammer_crusher','vertical_impact_crusher','vibrating_screen','jig','knudsen_bowl','sluice','shaker_table','spiral_concentrator','cyclone','tank','pump']){
  assert.ok(model.includes(`${key}:`),`${key} should have modelling-gap guidance`);
 }
 assert.match(model,/OEM\/vendor general-arrangement drawing or datasheet/);
 assert.match(model,/site measurements or survey for installed equipment/);
});
