import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [suite,route]=await Promise.all([
 readFile(new URL('../../lib/mcp/suite-tools.ts',import.meta.url),'utf8'),
 readFile(new URL('../../app/api/mcp/route.ts',import.meta.url),'utf8'),
]);

test('MCP exposes a permission-aware map of the full MineralX suite',()=>{
 assert.match(suite,/registerTool\('get_mineralx_suite_capabilities'/);
 for(const surface of ['exploration','engineering','processing','equipment','maintenance','energy','gold','programs','work','files','reports','intelligence','pit'])assert.match(suite,new RegExp(`${surface}:`));
 assert.match(route,/registerSuiteMcpTools\(server, principal\)/);
});

test('ChatGPT can resolve exact authorised suite surfaces without inventing routes',()=>{
 assert.match(suite,/registerTool\('open_mineralx_surface'/);
 assert.match(suite,/requirements:Record<Surface/);
 assert.match(suite,/if\(!permitted\(scope,surface\)\)throw new OpsError\('forbidden'/);
});

test('suite capability contract keeps physical plant operation outside MCP',()=>{
 assert.match(suite,/physical plant operation is never exposed/);
 assert.doesNotMatch(suite,/equipment\.start|equipment\.stop|plant\.operate/);
});
