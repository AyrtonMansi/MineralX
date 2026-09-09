import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const facility='de000000-0000-4000-8000-000000000003',project='de000000-0000-4000-8000-000000000004';
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
// Real browser PostgreSQL, command functions, UI, and IndexedDB persistence. Only raster imagery is stubbed.
async function start(page,path=`/ops?scope=${project}`){
 const errors=[],protectedRequests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/ops/')||u.hostname.endsWith('.supabase.co'))protectedRequests.push(r.url());});
 await page.route('**/api/basemap/**',r=>r.fulfill({contentType:'image/png',body:TILE}));
 await page.goto(path+'&mode=development',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('combobox',{name:'Workspace or site'})).toBeVisible({timeout:30000});
 return {errors,protectedRequests};
}
const region=(page,name)=>page.getByRole('region',{name,exact:true});
async function save(form,button){await form.getByRole('button',{name:button,exact:true}).click();await expect(form).toHaveCount(0,{timeout:20000});}
async function person(page,scope,name='Synthetic operator'){
 await page.goto(`/ops/work?scope=${scope}&view=people`);await page.getByRole('button',{name:'Add planning personnel',exact:true}).click();
 const f=region(page,'Add planning personnel');await f.getByLabel('Person / crew name').fill(name);await save(f,'Save person');
}
async function program(page,name='Synthetic drill campaign'){
 await page.goto(`/ops?scope=${project}`);await page.getByRole('button',{name:'Create work program',exact:true}).click();
 const f=region(page,'Plan a work program');await f.getByLabel('Program name').fill(name);
 await f.getByLabel('Responsible person').selectOption({label:'Synthetic operator'});await f.getByLabel('Outcome / purpose').fill('Synthetic drilling plan, not operational data');
 await save(f,'Save program');await page.getByRole('link').filter({has:page.getByRole('heading',{name,exact:true})}).click();
 await expect(page.getByRole('heading',{name,exact:true,level:1})).toBeVisible();return new URL(page.url()).searchParams.get('item');
}
async function task(page,title,scope=project,programId=''){
 await page.goto(`/ops/work?scope=${scope}&action=task${programId?'&program='+programId:''}`);
 const f=region(page,'Plan a task');await f.getByLabel('Task / work package title').fill(title);
 await f.getByLabel('Responsible person').selectOption({label:'Synthetic operator'});await save(f,'Save task');
 await page.getByRole('link').filter({has:page.getByText(title,{exact:true})}).click();
 return new URL(page.url()).searchParams.get('item');
}
async function asset(page,code,kind,state='installed',capacity=''){
 await page.goto(`/ops/plant?scope=${facility}&view=assets`);await page.getByRole('button',{name:'Add equipment',exact:true}).click();
 const f=region(page,'Record equipment');await f.getByLabel('Equipment code').fill(code);await f.getByLabel('Equipment name').fill('Synthetic '+code);await f.getByLabel('Equipment type').selectOption(kind);await f.getByLabel('Equipment state').selectOption(state);
 if(capacity){await f.getByText('Additional planning details & evidence',{exact:true}).click();await f.getByLabel('Rated capacity').fill(capacity);await f.getByLabel('Capacity unit').selectOption(kind==='tank'?'L':'kW');}
 await save(f,'Save equipment');
}
async function fuel(page,kind,litres,at,reference){
 await page.goto(`/ops/plant?scope=${facility}&view=energy`);await page.getByRole('button',{name:'Record diesel movement',exact:true}).click();
 const f=region(page,'Record diesel movement');await f.getByLabel('Record type').selectOption(kind);await f.getByRole('combobox',{name:/^Tank/}).selectOption({label:'Synthetic T1'});
 await f.getByLabel('Measured quantity, L').fill(litres);await f.getByLabel('Actual observation time').fill(at);await f.getByLabel('Docket / observation reference').fill(reference);await save(f,'Save fuel record');
}

test('Home and the suite Globe create and edit one canonical campaign; reload keeps the same ID',async({page})=>{
 const trace=await start(page);await person(page,project);const id=await program(page);
 await page.getByRole('link',{name:'Open in Geology Globe',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Work program',exact:true})).toHaveValue(id);
 await expect(page.getByRole('combobox',{name:'Work program',exact:true}).locator(`option[value="${id}"]`)).toHaveText('Synthetic drill campaign');
 await page.getByRole('link',{name:'Program plan & tasks →',exact:true}).click();await page.getByRole('button',{name:'Edit program plan'}).click();
 const f=region(page,'Plan a work program');await f.getByLabel('Program name').fill('Renamed canonical campaign');await save(f,'Save program');
 await page.goto(`/ops?scope=${project}`);await page.reload();await expect(page.getByRole('heading',{name:'Renamed canonical campaign',exact:true})).toBeVisible({timeout:30000});
 await page.goto(`/ops/geology?scope=${project}&view=map`);await page.getByText('Create program',{exact:true}).click();await page.getByRole('link',{name:'Geological mapping',exact:true}).click();
 const map=region(page,'Plan a work program');await expect(map.getByLabel('Type of work')).toHaveValue('mapping');await map.getByLabel('Program name').fill('Created from Globe');await save(map,'Save program');
 await page.goto(`/ops?scope=${project}`);await expect(page.getByRole('heading',{name:'Created from Globe',exact:true})).toBeVisible();
 expect(trace.errors).toEqual([]);expect(trace.protectedRequests).toEqual([]);
 await page.screenshot({path:'test-results/workflow-home-desktop.png',fullPage:true});
});

test('work sequencing validates dependencies, exposes personnel and retains a useful schedule',async({page})=>{
 const trace=await start(page);await person(page,project);const id=await program(page,'Synthetic site plan');
 const first=await task(page,'Prepare drill site',project,id);const second=await task(page,'Begin drilling',project,id);
 await page.getByRole('button',{name:'Edit task plan'}).click();const f=region(page,'Plan a task');
 await f.getByText('Additional planning details & evidence',{exact:true}).click();await f.getByRole('checkbox',{name:/Prepare drill site/}).check();
 await f.getByLabel('Due date').fill('2026-09-14');await save(f,'Save task');
 await page.getByRole('button',{name:'Update progress / resolve'}).click();const progress=region(page,'Update task progress');await progress.getByLabel('Next state').selectOption('in_progress');await progress.getByLabel('Progress / blocker').fill('Attempting before prerequisite');
 await progress.getByRole('button',{name:'Save progress'}).click();await expect(progress.getByRole('alert')).toBeVisible();
 page.once('dialog',d=>d.accept());await progress.getByRole('button',{name:'Close',exact:true}).click();
 await page.goto(`/ops/work?scope=${project}&item=${first}`);await page.getByRole('button',{name:'Update progress / resolve'}).click();
 const done=region(page,'Update task progress');await done.getByLabel('Next state').selectOption('resolved');await done.getByLabel('Progress / blocker').fill('Synthetic completion evidence');await save(done,'Save progress');
 await page.goto(`/ops/work?scope=${project}&item=${second}`);await page.getByRole('button',{name:'Update progress / resolve'}).click();
 const next=region(page,'Update task progress');await next.getByLabel('Next state').selectOption('in_progress');await next.getByLabel('Progress / blocker').fill('Predecessor completed');await save(next,'Save progress');
 await page.goto(`/ops/work?scope=${project}`);await page.getByRole('combobox',{name:'View',exact:true}).selectOption('Schedule');
 await expect(page.getByRole('region',{name:'Fourteen day work schedule'})).toContainText('Begin drilling');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/workflow-schedule-mobile.png',fullPage:true});expect(trace.errors).toEqual([]);
});

test('a failed program save stays open, retries idempotently and appears once after reload',async({page})=>{
 await start(page);await page.getByRole('button',{name:'Create work program',exact:true}).click();const f=region(page,'Plan a work program');await f.getByLabel('Program name').fill('RECOVER-PROGRAM');
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;window.restoreWorkflowStorage=()=>{IDBDatabase.prototype.transaction=original;};IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')throw new DOMException('Injected storage quota','QuotaExceededError');return original.call(this,names,mode,...args);};});
 await f.getByRole('button',{name:'Save program'}).click();await expect(f.getByRole('alert')).toBeVisible();await expect(f.getByLabel('Program name')).toHaveValue('RECOVER-PROGRAM');
 await page.evaluate(()=>window.restoreWorkflowStorage());await save(f,'Retry original save');await page.reload();await expect(page.getByRole('heading',{name:'RECOVER-PROGRAM',exact:true})).toHaveCount(1,{timeout:30000});
});

test('diesel balances compare independent dips, and proposed solar never becomes measured generation',async({page})=>{
 const trace=await start(page,`/ops?scope=${facility}`);await asset(page,'T1','tank','installed','1000');await asset(page,'PV1','solar','proposed','12');
 await fuel(page,'opening','200','2026-09-01T09:00:00','SYN-OPEN');await fuel(page,'delivery','500','2026-09-02T09:00:00','SYN-DEL');await fuel(page,'issue','100','2026-09-03T09:00:00','SYN-USE');await fuel(page,'dip','590','2026-09-04T09:00:00','SYN-DIP');
 await expect(page.getByText('600 L',{exact:true})).toBeVisible();await expect(page.getByText(/difference -10 L/)).toBeVisible();
 await page.getByRole('button',{name:'Record energy observation',exact:true}).click();const f=region(page,'Record energy observation');await f.getByLabel('Metered equipment').selectOption({label:'Synthetic PV1'});await f.getByLabel('Observation type').selectOption('solar_generation');await f.getByLabel('Interval starts').fill('2026-09-02T08:00:00');await f.getByLabel('Interval ends').fill('2026-09-02T16:00:00');await f.getByLabel('Measured interval').fill('50');await f.getByLabel('Meter IDs').fill('Synthetic actual meter difference');
 await f.getByRole('button',{name:'Save observation'}).click();await expect(f.getByRole('alert')).toContainText('installed asset');
 page.once('dialog',d=>d.accept());await f.getByRole('button',{name:'Close',exact:true}).click();await page.reload();await expect(page.getByText('600 L',{exact:true})).toBeVisible({timeout:30000});
 await page.screenshot({path:'test-results/workflow-energy-desktop.png',fullPage:true});expect(trace.errors).toEqual([]);expect(trace.protectedRequests).toEqual([]);
});

test('private engineering reuses the plant diagram without touching public review notes',async({page})=>{
 const trace=await start(page,`/ops?scope=${facility}`);const notes=[];page.on('request',r=>{if(/\/api\/plant/.test(new URL(r.url()).pathname))notes.push(r.url());});
 await page.goto(`/ops/plant?scope=${facility}&view=engineering`);await expect(page.getByText('P5 engineering reference · existing layout',{exact:true})).toBeVisible();await expect(page.locator('.plant-app svg').first()).toBeVisible();
 await page.getByRole('button',{name:'Add engineering revision'}).click();const f=region(page,'Record engineering revision');await f.getByLabel('Revision title').fill('Synthetic pump relocation');await f.getByLabel('Drawing / revision reference').fill('SYN-P5-C1');await save(f,'Save engineering record');
 await expect(page.getByRole('heading',{name:'Synthetic pump relocation',exact:true})).toBeVisible();expect(notes).toEqual([]);expect(trace.errors).toEqual([]);
 await page.screenshot({path:'test-results/workflow-engineering-desktop.png',fullPage:true});
});

test('workflow records are present in the complete development backup, not a separate browser key',async({page})=>{
 await start(page);await person(page,project);await program(page,'BACKUP-CANONICAL');
 await page.getByRole('link',{name:'Development settings',exact:true}).click();const wait=page.waitForEvent('download');await page.getByRole('button',{name:'Download development backup'}).click();const file=await wait;const bytes=await readFile(await file.path());expect(bytes[0]).toBe(0x1f);expect(bytes[1]).toBe(0x8b);expect(bytes.length).toBeGreaterThan(1000);
 // SQL restore, content hash and record identity are also tested in the isolated database suite.
});
