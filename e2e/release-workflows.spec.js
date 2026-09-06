import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
async function saved(page){await expect(page.locator('.mxf-status')).toHaveAttribute('data-state','saved');}
async function db(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('mineralx-geology',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const database=r.result;const tx=database.transaction('records','readonly');const q=tx.objectStore('records').get('workspace');tx.oncomplete=()=>{database.close();resolve(q.result);};};}));}
async function createProject(page,name='Release fixture'){await page.getByLabel('Project name',{exact:true}).fill(name);await page.getByRole('button',{name:'Create project',exact:true}).click();await expect.poll(async()=>(await db(page))?.data.projects.length).toBe(1);}
async function collect(page,id='BAG-1'){await page.getByRole('button',{name:'+ Collect sample',exact:true}).click();await page.getByLabel('Bag / sample ID',{exact:true}).fill(id);await page.getByLabel('Latitude (WGS84)',{exact:true}).fill('-21');await page.getByLabel('Longitude (WGS84)',{exact:true}).fill('145');await page.getByRole('textbox',{name:'Field notes',exact:true}).fill('Quartz, "veined"\nSecond line');await page.getByRole('button',{name:'Save record',exact:true}).click();await expect.poll(async()=>(await db(page))?.data.projects[0].samples.some(s=>s.id===id)).toBe(true);}
async function nav(page,name){await page.getByRole('navigation',{name:'Geology workspace'}).getByRole('button',{name,exact:true}).click();}
test.beforeEach(async({page})=>{await page.route('**/api/basemap/**',route=>route.fulfill({status:200,contentType:'image/png',body:TILE}));});

test('human field-to-result workflow survives reload and exports a complete backup',async({page})=>{
 const crashes=[];page.on('pageerror',e=>crashes.push(e.message));
 await page.goto('/mineralx');await expect(page.getByRole('navigation',{name:'Geology workspace'}).getByRole('button')).toHaveCount(5);
 await createProject(page);await collect(page);
 const original=(await db(page)).data.projects[0].samples[0].recordId;
 await page.reload();await saved(page);await nav(page,'Programs');
 await page.getByLabel('Program name',{exact:true}).fill('Recon program');await page.getByRole('button',{name:'Create program',exact:true}).click();await saved(page);
 await nav(page,'Samples');await page.locator('.mxf-sample>summary').click();await page.getByRole('combobox',{name:'Program',exact:true}).selectOption({label:'Recon program'});await saved(page);
 await page.getByRole('checkbox',{name:'Select BAG-1 for dispatch'}).check();await page.getByLabel('Receiving laboratory',{exact:true}).fill('Fixture laboratory');await page.getByRole('button',{name:'Record dispatch (1)',exact:true}).click();await saved(page);
 await nav(page,'Review');await page.getByText('DSP-0001 · Fixture laboratory · dispatched',{exact:true}).click();await page.getByRole('checkbox',{name:'BAG-1',exact:true}).check();await page.getByLabel('Receipt reference',{exact:true}).fill('RECEIPT-1');await page.getByRole('button',{name:'Record laboratory receipt',exact:true}).click();await saved(page);
 await page.getByLabel('Certificate / batch reference',{exact:true}).fill('CERT-1');await page.getByLabel('CSV result text',{exact:true}).fill('sample_id,Au_ppb,Cu_ppm\nBAG-1,500,1000');await page.getByRole('button',{name:'Stage results for review',exact:true}).click();await saved(page);
 let state=(await db(page)).data.projects[0];expect(state.samples[0].assays).toEqual({});expect(state.assayBatches[0].results[0].value).toBe(.5);expect(state.assayBatches[0].results[1].value).toBe(.1);
 await page.getByLabel('Reviewing geologist',{exact:true}).fill('Release test geologist');await page.getByRole('button',{name:'Release reviewed results',exact:true}).click();await saved(page);
 state=(await db(page)).data.projects[0];expect(state.samples[0].recordId).toBe(original);expect(state.samples[0].assays).toEqual({Au:.5,Cu:.1});expect(state.samples[0].assayHistory).toHaveLength(1);expect(state.dispatches[0].status).toBe('received');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download full backup',exact:true}).click();const download=await downloadPromise;const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));const payload=JSON.parse(backup.payload);expect(payload.store.projects[0].samples[0].notes).toBe('Quartz, "veined"\nSecond line');expect(payload.store.projects[0].assayBatches[0].rawCsv).toContain('Au_ppb');
 await page.screenshot({path:'test-results/geology-review-desktop.png',fullPage:true});
 await page.reload();await saved(page);expect((await db(page)).data.projects[0].samples[0].assays.Au).toBe(.5);expect(crashes).toEqual([]);
});

test('drill capture rejects overlap and preserves physical bag identity',async({page})=>{
 await page.goto('/mineralx');await createProject(page,'Drill fixture');await nav(page,'Drilling');await page.getByText('Add drillhole',{exact:true}).click();
 for(const [label,value] of [['Hole ID','DH-1'],['Depth (m)','20'],['Latitude (WGS84)','-21'],['Longitude (WGS84)','145'],['Azimuth (degrees)','90'],['Dip (degrees)','-60']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Add hole',exact:true}).click();await saved(page);await page.getByRole('button',{name:'Sample RC interval',exact:true}).click();await page.getByLabel('Bag / sample ID',{exact:true}).fill('DRILL-1');await page.getByLabel('From (m)',{exact:true}).fill('0');await page.getByLabel('To (m)',{exact:true}).fill('1');await page.getByRole('button',{name:'Save and next',exact:true}).click();await saved(page);
 await page.getByLabel('Bag / sample ID',{exact:true}).fill('DRILL-2');await page.getByLabel('From (m)',{exact:true}).fill('.5');await page.getByLabel('To (m)',{exact:true}).fill('1.5');await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.locator('.mxf-panel').getByRole('alert')).toContainText('overlaps');
 let p=(await db(page)).data.projects[0];expect(p.samples).toHaveLength(1);expect(p.intervals[0].sampleRecordId).toBe(p.samples[0].recordId);
 await page.getByLabel('From (m)',{exact:true}).fill('1');await page.getByLabel('To (m)',{exact:true}).fill('2');await page.getByRole('button',{name:'Save record',exact:true}).click();await saved(page);p=(await db(page)).data.projects[0];expect(p.samples).toHaveLength(2);expect(p.intervals[1].sampleId).toBe('DRILL-2');
});

test('corrupted legacy bytes cannot be replaced by a demo or empty autosave',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('mx-store-v8','{"version":8,');});await page.goto('/mineralx');await expect(page.getByRole('region',{name:'Workspace recovery'})).toBeVisible();await expect(page.locator('.mxf-status')).toHaveAttribute('data-state','blocked');expect(await page.evaluate(()=>localStorage.getItem('mx-store-v8'))).toBe('{"version":8,');expect(await db(page)).toBeUndefined();await expect(page.getByRole('button',{name:'Download original saved bytes',exact:true})).toBeVisible();
});

test('a stale second tab cannot silently overwrite the newer database revision',async({page,context})=>{
 await page.goto('/mineralx');await createProject(page,'Concurrency fixture');const second=await context.newPage();await second.goto('/mineralx');await saved(second);
 await collect(page,'FIRST');await second.getByRole('button',{name:'+ Collect sample',exact:true}).click();await second.getByLabel('Bag / sample ID',{exact:true}).fill('SECOND');await second.getByLabel('Latitude (WGS84)',{exact:true}).fill('-22');await second.getByLabel('Longitude (WGS84)',{exact:true}).fill('146');await second.getByRole('button',{name:'Save record',exact:true}).click();await expect(second.locator('.mxf-status')).toHaveAttribute('data-state','conflict');
 const p=(await db(page)).data.projects[0];expect(p.samples.map(s=>s.id)).toEqual(['FIRST']);await expect(second.getByRole('button',{name:'Back up open workspace',exact:true})).toBeVisible();await second.close();
});

test('GPS capture, draft recovery and mobile navigation work without horizontal overflow',async({page,context})=>{
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:-23,longitude:147,accuracy:7});await page.setViewportSize({width:390,height:844});await page.goto('/mineralx');await createProject(page,'Mobile fixture');await page.getByRole('button',{name:'+ Collect sample',exact:true}).click();await page.getByLabel('Bag / sample ID',{exact:true}).fill('DRAFT-GPS');await page.getByRole('button',{name:'Capture GPS',exact:true}).click();await expect(page.getByLabel('Latitude (WGS84)',{exact:true})).toHaveValue('-23');await page.getByRole('textbox',{name:'Field notes',exact:true}).fill('Draft must survive reload');
 await page.reload();await saved(page);await page.getByRole('button',{name:'+ Collect sample',exact:true}).click();await expect(page.getByLabel('Bag / sample ID',{exact:true})).toHaveValue('DRAFT-GPS');await expect(page.getByRole('textbox',{name:'Field notes',exact:true})).toHaveValue('Draft must survive reload');await page.screenshot({path:'test-results/geology-capture-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole('button',{name:'Save record',exact:true}).click();await saved(page);expect((await db(page)).data.projects[0].samples[0].coordinateAccuracyM).toBe(7);
});

test('offline app-shell reload preserves access to capture and saved records',async({page,context})=>{
 await page.goto('/mineralx');await createProject(page,'Offline fixture');await expect(page.locator('.mxf-release')).toContainText('Offline capture ready',{timeout:30000});await context.setOffline(true);await page.reload();await saved(page);await collect(page,'OFFLINE-1');expect((await db(page)).data.projects[0].samples[0].id).toBe('OFFLINE-1');await context.setOffline(false);await page.reload();await saved(page);expect((await db(page)).data.projects[0].samples[0].id).toBe('OFFLINE-1');
});
