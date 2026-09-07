import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {KML,makeZip,polygon} from '../test/fixtures/spatial-fixtures.js';
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
const collection=features=>({type:'FeatureCollection',features});
async function saved(page){await expect(page.locator('.mxf-status')).toHaveAttribute('data-state','saved');}
async function db(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('mineralx-geology',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const database=req.result,tx=database.transaction('records','readonly'),q=tx.objectStore('records').get('workspace');tx.oncomplete=()=>{database.close();resolve(q.result);};};}));}
async function start(page,name='Spatial fixtures'){
 await page.goto('/mineralx');await saved(page);
 await page.getByLabel('Project name',{exact:true}).fill(name);await page.getByRole('button',{name:'Create project',exact:true}).click();await saved(page);
 await page.getByRole('button',{name:'Map layers',exact:true}).click();
 await expect(page.getByRole('region',{name:'Map layers'})).toBeVisible();
}
const layers=page=>page.getByRole('region',{name:'Map layers'});
const importer=page=>page.getByRole('region',{name:'Import project map files'});
async function importFiles(page,files){await layers(page).getByRole('button',{name:'Import map files',exact:true}).click();await importer(page).getByLabel('Map files',{exact:true}).setInputFiles(files);await expect(importer(page).getByText('Reading and validating files…',{exact:false})).toHaveCount(0);}
async function saveImport(page){await importer(page).getByRole('button',{name:/^Save to /}).click();await expect(importer(page).getByRole('status')).toContainText('Saved');await saved(page);await importer(page).getByRole('button',{name:'Back to map',exact:true}).click();}
async function downloadFile(page,button){const pending=page.waitForEvent('download');await button.click();const file=await pending;return {name:file.suggestedFilename(),bytes:await fs.readFile(await file.path())};}
async function nav(page,name){await page.getByRole('navigation',{name:'Geology workspace'}).getByRole('button',{name,exact:true}).click();}
test.beforeEach(async({page})=>{await page.route('**/api/basemap/**',r=>r.fulfill({status:200,contentType:'image/png',body:TILE}));});

test('tenement KML retains every polygon and interior ring through save, reload and exports',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page);
 await layers(page).getByRole('button',{name:'+ Import tenement boundary',exact:true}).click();
 await importer(page).getByLabel('Map files',{exact:true}).setInputFiles({name:'Tenements.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(KML)});
 await expect(importer(page).getByText('1 points · 1 lines · 2 polygons',{exact:false})).toBeVisible();
 await saveImport(page);
 let project=(await db(page)).data.projects[0];
 expect(project.boundary.data.features).toHaveLength(2);expect(project.boundary.data.features[0].geometry.coordinates).toHaveLength(2);
 expect(project.spatialLayers[0].data.features).toHaveLength(4);expect(project.samples).toHaveLength(0);
 const sourceId=project.spatialLayers[0].recordId;
 expect(project.spatialLayers[0].data.features[0].properties.extendedData.tenement_id).toBe('ML-1');
 expect(project.spatialLayers[0].data.features[0].properties.folderPath).toEqual(['GIS export','Tenements']);
 await page.reload();await saved(page);await page.getByRole('button',{name:'Map layers',exact:true}).click();
 const row=layers(page).locator(`[data-layer-id="spatial:${project.id}:${sourceId}"]`);
 await row.getByText('Layer details',{exact:true}).click();
 const original=await downloadFile(page,row.getByRole('button',{name:'Export original KML',exact:true}));expect(original.bytes.toString()).toBe(KML);
 const exported=await downloadFile(page,row.getByRole('button',{name:'Export GeoJSON',exact:true}));expect(JSON.parse(exported.bytes.toString()).features).toHaveLength(4);
 const boundaryRow=layers(page).locator(`[data-layer-id="bnd:${project.id}"]`);await boundaryRow.getByText('Layer details',{exact:true}).click();
 const boundary=await downloadFile(page,boundaryRow.getByRole('button',{name:'Export boundary KML',exact:true}));expect(boundary.bytes.toString().match(/<Polygon>/g)).toHaveLength(2);expect(boundary.bytes.toString()).toContain('<innerBoundaryIs>');expect(boundary.bytes.toString()).toContain('Lease &amp; One');
 await boundaryRow.getByRole('checkbox',{name:'Show Tenement boundary',exact:true}).uncheck();await expect(boundaryRow.getByRole('checkbox')).not.toBeChecked();
 await page.reload();await saved(page);await page.getByRole('button',{name:'Map layers',exact:true}).click();await expect(layers(page).getByRole('checkbox',{name:'Show Tenement boundary',exact:true})).not.toBeChecked();
 await page.screenshot({path:'test-results/geology-spatial-layers-desktop.png',fullPage:true});expect(errors).toEqual([]);
});

test('KMZ imports embedded documents without following network links and preserves exact archive bytes',async({page})=>{
 await start(page,'KMZ project');let outbound=0;
 await page.route('**/evil.example/**',route=>{outbound++;route.abort();});
 const linked='<kml xmlns="http://www.opengis.net/kml/2.2"><Document><NetworkLink><Link><href>https://evil.example/private.kml</href></Link></NetworkLink></Document></kml>';
 const kmz=makeZip({'doc.kml':linked,'geology/geology.kml':KML,'icons/a.png':'unused'});
 await importFiles(page,[{name:'External software.kmz',mimeType:'application/vnd.google-earth.kmz',buffer:kmz}]);
 await expect(importer(page).getByRole('button',{name:/^Save to /})).toBeDisabled();
 await importer(page).getByRole('checkbox',{name:'I have reviewed the unrendered content and display limitations.',exact:true}).check();
 await saveImport(page);let p=(await db(page)).data.projects[0];expect(p.boundary).toBeNull();expect(p.spatialLayers[0].data.features).toHaveLength(4);
 expect(p.spatialLayers[0].source.sha256).toBe(createHash('sha256').update(kmz).digest('hex'));expect(outbound).toBe(0);
 const row=layers(page).locator(`[data-layer-id="spatial:${p.id}:${p.spatialLayers[0].recordId}"]`);await row.getByText('Layer details',{exact:true}).click();
 const original=await downloadFile(page,row.getByRole('button',{name:'Export original KMZ',exact:true}));expect(original.bytes.equals(kmz)).toBe(true);
 await importFiles(page,[{name:'External software.kmz',mimeType:'application/vnd.google-earth.kmz',buffer:kmz}]);await importer(page).getByRole('checkbox',{name:'I have reviewed the unrendered content and display limitations.',exact:true}).check();await saveImport(page);expect((await db(page)).data.projects[0].spatialLayers).toHaveLength(1);
});

test('GeoJSON layer renders selectable safe attributes; opacity, basemap and archival persist on mobile',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,'Geology layers');
 const point=collection([{type:'Feature',properties:{name:'Mapped reference',description:'<img src=x onerror="window.__unsafeImport=1">',lithology:'Quartz'},geometry:{type:'Point',coordinates:[145,-21]}}]);
 await importFiles(page,[{name:'Reference.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(point))}]);await saveImport(page);
 const p=(await db(page)).data.projects[0],id=`spatial:${p.id}:${p.spatialLayers[0].recordId}`;
 let row=layers(page).locator(`[data-layer-id="${id}"]`);await row.getByRole('button',{name:'Zoom to Reference',exact:true}).click();await page.waitForTimeout(800);
 const canvas=page.locator('.maplibregl-canvas'),box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.mx-spatial-popup')).toContainText('Mapped reference');expect(await page.evaluate(()=>window.__unsafeImport)).toBeUndefined();await expect(page.locator('.mx-spatial-popup img')).toHaveCount(0);
 await row.getByText('Layer details',{exact:true}).click();const slider=row.getByRole('slider',{name:'Reference opacity'});await slider.focus();await slider.press('Home');for(let i=0;i<35;i++)await slider.press('ArrowRight');
 await layers(page).getByText('Map appearance',{exact:true}).click();await layers(page).getByRole('combobox',{name:'Basemap',exact:true}).selectOption('topo');
 await page.reload();await saved(page);await page.getByRole('button',{name:'Map layers',exact:true}).click();row=layers(page).locator(`[data-layer-id="${id}"]`);await expect(row.locator('details').first()).toHaveJSProperty('open',true);await expect(row.getByRole('slider',{name:'Reference opacity'})).toHaveValue('35');await layers(page).getByText('Map appearance',{exact:true}).click();await expect(layers(page).getByRole('combobox',{name:'Basemap',exact:true})).toHaveValue('topo');
 page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Archive layer',exact:true}).click();await saved(page);expect((await db(page)).data.projects[0].spatialLayers[0].archivedAt).toBeTruthy();
 await layers(page).getByText('Archived sources',{exact:true}).click();await layers(page).getByRole('button',{name:'Restore layer',exact:true}).click();await saved(page);expect((await db(page)).data.projects[0].spatialLayers[0].archivedAt).toBeNull();
 await page.setViewportSize({width:390,height:844});await expect(layers(page)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/geology-spatial-layers-mobile.png',fullPage:true});expect(errors).toEqual([]);
});

test('invalid KML, projected GeoJSON and unsafe KMZ fail visibly without changing saved records',async({page})=>{
 await start(page);const before=JSON.stringify((await db(page)).data.projects[0]);
 await importFiles(page,[{name:'bad.kml',mimeType:'text/xml',buffer:Buffer.from(KML.replace('145.1,-21','500000,7500000'))},{name:'entities.kml',mimeType:'text/xml',buffer:Buffer.from('<!DOCTYPE kml [<!ENTITY x "bad">]><kml/>')},{name:'traversal.kmz',mimeType:'application/zip',buffer:makeZip({'../doc.kml':KML})},{name:'projected.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...collection([polygon]),crs:{type:'name',properties:{name:'EPSG:28355'}}}))}]);
 await expect(importer(page).getByRole('alert')).toHaveCount(4);await expect(importer(page).getByRole('button',{name:/^Save to /})).toBeDisabled();expect(JSON.stringify((await db(page)).data.projects[0])).toBe(before);
});

test('an aborted import transaction retains its preview and never claims saved',async({page})=>{
 await start(page);await importFiles(page,[{name:'Local.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(collection([polygon])))}]);
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;let once=true;IDBObjectStore.prototype.put=function(...args){if(once&&args[1]==='workspace'){once=false;this.transaction.abort();throw new DOMException('Injected interrupted write','AbortError');}return original.apply(this,args);};});
 await importer(page).getByRole('button',{name:/^Save to /}).click();await expect(importer(page).getByRole('alert')).toContainText('Not confirmed saved');await expect(importer(page).getByText('Local.geojson',{exact:true})).toBeVisible();expect((await db(page)).data.projects[0].spatialLayers||[]).toHaveLength(0);
});

test('complete backup restores boundaries, source files and layer preferences into a fresh browser',async({page,browser})=>{
 await start(page,'Backup project');await importFiles(page,[{name:'Reference.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(collection([polygon])))}]);await importer(page).getByRole('combobox',{name:'Use as',exact:true}).selectOption('boundary');await saveImport(page);
 const original=(await db(page)).data.projects[0];await layers(page).getByRole('checkbox',{name:'Show Reference',exact:true}).uncheck();await nav(page,'Review');
 const backup=await downloadFile(page,page.getByRole('button',{name:'Download full backup',exact:true}));
 const context=await browser.newContext();const other=await context.newPage();await other.route('**/api/basemap/**',r=>r.fulfill({status:200,contentType:'image/png',body:TILE}));
 try{
  await other.goto(new URL('/mineralx',page.url()).href);await saved(other);await nav(other,'Review');
  await other.getByLabel('Restore a backup',{exact:true}).setInputFiles({name:'workspace.json',mimeType:'application/json',buffer:backup.bytes});
  await other.getByRole('button',{name:'Back up current view and restore this backup',exact:true}).click();await saved(other);
  await expect.poll(async()=>(await db(other)).data.projects.length).toBe(1);
  expect((await db(other)).data.projects[0].spatialLayers[0].source).toEqual(original.spatialLayers[0].source);
  expect((await db(other)).data.projects[0].boundary.data).toEqual(original.boundary.data);
  await nav(other,'Map');await other.getByRole('button',{name:'Map layers',exact:true}).click();await expect(layers(other).getByRole('checkbox',{name:'Show Reference',exact:true})).not.toBeChecked();
 }finally{await context.close();}
});


test('unsaved spatial preview cannot be discarded by workspace navigation without confirmation',async({page})=>{
 await start(page,'Navigation protection');await importFiles(page,[{name:'Uncommitted.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(collection([polygon])))}]);
 await expect(importer(page).getByText('Uncommitted.geojson',{exact:true})).toBeVisible();
 const dismiss=async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('without saving');await dialog.dismiss();};
 page.once('dialog',dismiss);await nav(page,'Samples');await expect(importer(page)).toBeVisible();await expect(page.getByRole('region',{name:'Samples workspace'})).toHaveCount(0);
 page.once('dialog',dismiss);await importer(page).getByRole('button',{name:'Back to map',exact:true}).click();await expect(importer(page)).toBeVisible();
 expect((await db(page)).data.projects[0].spatialLayers||[]).toHaveLength(0);
 await saveImport(page);await nav(page,'Samples');await expect(page.getByRole('region',{name:'Samples workspace'})).toBeVisible();expect((await db(page)).data.projects[0].spatialLayers).toHaveLength(1);
});
