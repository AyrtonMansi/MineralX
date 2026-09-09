import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const project='de000000-0000-4000-8000-000000000004';
function scan(){const lines=[];for(let z=0;z<=10;z++)for(let x=0;x<=10;x++)lines.push(`v ${x*2} 0 ${z*2}`);for(let z=0;z<10;z++)for(let x=0;x<10;x++){const a=z*11+x+1;lines.push(`f ${a} ${a+11} ${a+1}`,`f ${a+1} ${a+11} ${a+12}`);}return Buffer.from(lines.join('\n'));}
async function open(page){await page.goto(`/ops/pit?scope=${project}&mode=development`);await expect(page.getByRole('heading',{name:'Pits & stockpiles',exact:true})).toBeVisible({timeout:30000});}
async function importScan(page){await expect(page.getByRole('region',{name:'iPhone LiDAR workflow'})).toContainText('Choose the exported mesh from Files');await page.getByLabel('Choose exported mesh from Files').setInputFiles({name:'synthetic-survey.obj',mimeType:'text/plain',buffer:scan()});await expect(page.getByLabel('Scenario name')).toHaveValue('synthetic-survey',{timeout:30000});await expect(page.locator('.pit-canvas canvas')).toBeVisible();}
async function backup(page){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export scenario backup',exact:true}).click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));}
async function selectSurface(page){await page.getByRole('button',{name:'Top view',exact:true}).click();await page.getByRole('button',{name:'Edit surface',exact:true}).click();const canvas=page.locator('.pit-canvas canvas');const box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:box.height/2}});await expect(page.getByText('Selected local point',{exact:false})).toBeVisible();return box;}
test('real mesh import, deformation, original ghost, undo, durable save and portable backup',async({page})=>{
 const errors=[],protectedCalls=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/ops/'))protectedCalls.push(r.url());});
 await open(page);await importScan(page);const original=await backup(page);expect(Buffer.from(original.source.base64,'base64')).toEqual(scan());
 await selectSurface(page);await page.getByRole('button',{name:'Apply movement',exact:true}).click();let changed=await backup(page);expect(changed.original).toEqual(original.original);expect(changed.edited).not.toEqual(original.edited);
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await backup(page)).edited).toEqual(original.edited);
 await page.getByRole('button',{name:'Redo',exact:true}).click();expect((await backup(page)).edited).toEqual(changed.edited);
 await page.getByRole('button',{name:'Save scenario',exact:true}).click();await expect(page.locator('.pit-status')).toContainText('Saved on this device');
 await page.reload();await page.getByRole('combobox',{name:'Saved on this device',exact:true}).selectOption({label:'synthetic-survey · v1'});await page.getByRole('button',{name:'Open saved scenario'}).click();expect((await backup(page)).edited).toEqual(changed.edited);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download original scan'}).click();expect(await readFile(await(await dl).path())).toEqual(scan());
 await page.getByText('Import a scan or scenario',{exact:true}).click();await page.getByLabel('Choose exported mesh from Files').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});await expect(page.locator('.pit-status')).toContainText('Scan ready');expect((await backup(page)).edited).toEqual(changed.edited);
 expect(errors).toEqual([]);expect(protectedCalls).toEqual([]);await page.screenshot({path:'test-results/pit-desktop.png',fullPage:true});
});
test('dragging a wall handle changes only the planning geometry',async({page})=>{
 await open(page);await importScan(page);const before=await backup(page);const box=await selectSurface(page);
 // In top view the world X arrow projects horizontally right from the selected centre.
 await page.mouse.move(box.x+box.width/2+45,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+110,box.y+box.height/2,{steps:12});await page.mouse.up();
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();const after=await backup(page);expect(after.edited).not.toEqual(before.edited);expect(after.original).toEqual(before.original);
});
test('mobile scan errors preserve current work and editing controls fit the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await page.getByRole('button',{name:'Try a practice pit'}).click();await expect(page.getByLabel('Scenario name')).toHaveValue('Practice pit — synthetic');
 page.on('dialog',d=>d.accept());await page.getByText('Import a scan or scenario',{exact:true}).click();await page.getByLabel('Choose exported mesh from Files').setInputFiles({name:'camera.mov',mimeType:'video/quicktime',buffer:Buffer.from('not depth')});
 await expect(page.locator('.pit-workspace').getByRole('alert')).toContainText('camera video');await expect(page.getByLabel('Scenario name')).toHaveValue('Practice pit — synthetic');await page.getByRole('button',{name:'Dismiss',exact:true}).click();
 await page.getByText('Import a scan or scenario',{exact:true}).click();await selectSurface(page);await expect(page.getByRole('button',{name:'Apply movement',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/pit-mobile.png',fullPage:true});
});
test('failed device saves retain work, retry commits, and stale versions cannot overwrite newer scenarios',async({page})=>{
 await open(page);await importScan(page);const before=await backup(page);
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='scenarios'){IDBObjectStore.prototype.put=put;throw new DOMException('Simulated storage exhaustion','QuotaExceededError');}return put.apply(this,args);};});
 await page.getByRole('button',{name:'Save scenario',exact:true}).click();await expect(page.locator('.pit-status')).toContainText('Not saved');expect((await backup(page)).edited).toEqual(before.edited);
 await page.getByRole('button',{name:'Save scenario',exact:true}).click();await expect(page.locator('.pit-status')).toContainText('Saved on this device');
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('mineralx-pit-scenarios',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('scenarios','readwrite'),store=tx.objectStore('scenarios'),q=store.getAll();q.onsuccess=()=>{const row=q.result[0];row.project.version++;row.project.name='Newer saved scenario';store.put(row);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
 await page.getByLabel('Scenario name').fill('My unsaved edits');await page.getByRole('button',{name:'Save scenario',exact:true}).click();await expect(page.locator('.pit-workspace').getByRole('alert')).toContainText('another tab');expect((await backup(page)).name).toBe('My unsaved edits');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Open saved scenario'}).click();await expect(page.getByLabel('Scenario name')).toHaveValue('Newer saved scenario');expect((await backup(page)).version).toBe(2);
 await page.goto('/ops/pit?scope=de000000-0000-4000-8000-000000000003&mode=development');await expect(page).toHaveURL(new RegExp(`/ops/pit\\?scope=${project}&mode=development`));await expect(page.getByRole('heading',{name:'Pits & stockpiles',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Saved on this device',exact:true})).toHaveCount(1);
});
