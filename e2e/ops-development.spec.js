import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const facility='de000000-0000-4000-8000-000000000003',project='de000000-0000-4000-8000-000000000004';
// These synthetic observations are entered in the facility's wall-clock time, not UTC.
// datetime-local normalises zero seconds away; Playwright fill requires that canonical form.
function plantTime(ms){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}${p.second==='00'?'':':'+p.second}`;}
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
async function open(page,path='/ops'){
 const forbidden=[];page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/ops/')||u.hostname.endsWith('.supabase.co'))forbidden.push(r.url());});
 // Public map imagery is deterministic. Application, database, imports and local saving are real.
 await page.route('**/api/basemap/**',r=>r.fulfill({contentType:'image/png',body:TILE}));
 await page.goto(path+(path.includes('?')?'&':'?')+'mode=development',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('combobox',{name:'Workspace or site'})).toHaveCount(0,{timeout:30000});
 // The first browser-local workspace open compiles the self-hosted database
 // runtime and can legitimately take longer than Playwright's 5s default.
 await expect(page.locator('.ops-connection')).toContainText('Device workspace',{timeout:30000});
 return forbidden;
}
async function feed(page,reference){
 await page.locator('#operations-navigation').getByRole('link',{name:'Processing',exact:true}).click();await page.getByRole('navigation',{name:'Processing workspace'}).getByRole('link',{name:'Processing',exact:true}).click();
 await page.getByRole('button',{name:'Feed',exact:true}).click();
 await page.getByRole('button',{name:'Record feed lot',exact:true}).click();
 const form=page.getByRole('region',{name:'Record feed lot',exact:true});
 await form.getByLabel('Feed / stockpile reference').fill(reference);await form.getByLabel('Received quantity, t').fill('5');
 await form.getByRole('button',{name:'Record feed lot',exact:true}).click();
 await expect(form).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:reference})).toBeVisible();
}
async function run(page){
 await page.getByRole('button',{name:'Runs',exact:true}).click();await page.getByRole('button',{name:'Processing run',exact:true}).click();
 const form=page.getByRole('region',{name:'Processing run',exact:true});
 await expect(form.getByLabel('Feed lot', {exact:false}).locator('option')).toHaveCount(2);
 await form.getByLabel('Feed lot',{exact:false}).selectOption({index:1});await form.getByLabel('Measured tonnes').fill('2.5');
 const now=Date.now();await form.getByLabel('Actual start').fill(plantTime(now-2*3600000));await form.getByLabel('Actual end').fill(plantTime(now-3600000));
 await form.getByLabel('Shift notes / handover').fill('Development browser run — synthetic measurement');
 await form.getByRole('button',{name:'Save run draft'}).click();await expect(form).toHaveCount(0);
 const row=page.locator('tbody tr').first();await expect(row).toBeVisible();return (await row.locator('td').first().innerText()).trim();
}

test('no-login suite uses real local save/reload and never requests protected services',async({page})=>{
 const calls=await open(page);await feed(page,'DEV-FEED-ONLY');const reference=await run(page);
 await expect(page.locator('.ops-connection')).toContainText('Saved in this browser');await page.reload();
 await expect(page.getByRole('row').filter({hasText:reference})).toBeVisible({timeout:30000});
 await page.getByRole('link',{name:'Record clean-up / gold lot',exact:true}).click();
 const lot=page.getByRole('region',{name:'Record clean-up / physical gold lot',exact:true});
 await lot.getByLabel('Lot / clean-up reference').fill('DEV-CLEANUP-ONLY');
 // Exercise the exact-minute boundary on every run instead of depending on the wall clock.
 const yesterday=plantTime(Math.floor((Date.now()-86400000)/60000)*60000);
 await lot.getByLabel('Actual clean-up time').fill(yesterday);await lot.getByRole('checkbox',{name:new RegExp(reference)}).check();
 // A clean-up cannot precede the run it covers. Preserve this real validation assertion.
 await lot.getByRole('button',{name:'Record physical lot'}).click();
 await expect(lot.getByRole('alert')).toContainText('A linked run is outside the clean-up facility/campaign or follows the clean-up');
 await expect(lot.getByLabel('Lot / clean-up reference')).toHaveValue('DEV-CLEANUP-ONLY');
 await lot.getByLabel('Actual clean-up time').fill(plantTime(Date.now()-30*60000));
 await lot.getByRole('button',{name:'Record physical lot'}).click();await expect(lot).toHaveCount(0);
 await page.getByRole('button',{name:'Open DEV-CLEANUP-ONLY'}).click();
 await expect(page.getByRole('region',{name:'Gold lot next action'})).toContainText('Not recognised');
 await page.getByText('All measurement actions / corrections',{exact:true}).click();await page.getByRole('button',{name:'Verify gold measurement and assay'}).click();
 await expect(page.getByRole('button',{name:'Verify selected evidence'})).toBeDisabled();
 await expect(page.getByText('Development mode cannot approve production or sign custody.',{exact:false})).toBeVisible();
 expect(calls).toEqual([]);
 await page.screenshot({path:'test-results/development-gold-workflow.png',fullPage:true});
});

test('the first standalone task needs no work program',async({page})=>{
 const calls=await open(page,`/ops?scope=${facility}`);
 const firstSteps=page.locator('.ops-first-steps');
 await expect(firstSteps.getByRole('heading',{name:'Start with the next accountable task.',exact:true})).toBeVisible({timeout:30000});
 await expect(firstSteps.getByRole('button',{name:'Create work program',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create first task',exact:true}).click();
 const form=page.getByRole('region',{name:'Plan a task',exact:true});
 const program=form.getByLabel('Work program (optional)',{exact:false});
 await expect(program).toHaveValue('');
 await expect(program.locator('option').first()).toHaveText('Standalone task — no work program');
 await expect(form.getByText('Leave this as standalone for one-off work.',{exact:false})).toBeVisible();
 await form.getByLabel('Task / work package title').fill('DEV-STANDALONE-TASK');
 await form.getByRole('button',{name:'Save task',exact:true}).click();
 await expect(form).toHaveCount(0);
 await expect(page.getByText('DEV-STANDALONE-TASK',{exact:true})).toBeVisible();
 expect(calls).toEqual([]);
});

test('geology capture, reviewed map import and original bytes survive reload without login',async({page})=>{
 const calls=await open(page,`/ops/geology?scope=${project}`);
 await page.getByRole('button',{name:'Collect a physical sample',exact:true}).click();
 const form=page.getByRole('region',{name:'Collect a physical sample'});
 await form.getByLabel('Physical sample / bag identifier').fill('DEV-BAG-001');await form.getByLabel('Actual collection date').fill(new Date(Date.now()-86400000).toISOString().slice(0,10));
 await form.getByLabel('Latitude, WGS84').fill('-20');await form.getByLabel('Longitude, WGS84').fill('145');
 await form.getByRole('button',{name:'Save sample',exact:true}).click();await expect(form).toHaveCount(0);
 await page.reload();await expect(page.getByRole('button',{name:'Open DEV-BAG-001'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Map & sources',exact:true}).click();
 await page.getByRole('button',{name:'Publish project map source',exact:true}).click();
 const layer=page.getByRole('region',{name:'Publish project map source'});
 const source=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Development tenement',source:'synthetic'},geometry:{type:'Polygon',coordinates:[[[145,-20],[145.1,-20],[145.1,-20.1],[145,-20]]]}}]});
 await layer.locator('input[type=file]').setInputFiles({name:'development-tenement.geojson',mimeType:'application/geo+json',buffer:Buffer.from(source)});
 await expect(layer.getByRole('combobox',{name:'Verified source evidence'})).not.toHaveValue('');
 await layer.getByLabel('Layer name').fill('Development boundary');await layer.getByLabel('Project role').selectOption('boundary');
 await layer.getByRole('checkbox',{name:'I reviewed geometry, warnings and the destination project'}).check();
 await layer.getByRole('button',{name:'Preview source & changes'}).click();await expect(layer.getByText('Current source preview')).toBeVisible();
 await layer.getByRole('button',{name:'Publish reviewed map layer'}).click();await expect(layer).toHaveCount(0);
 await page.goto(`/ops/geology?scope=${project}&view=spatialLayers`);await page.reload();
 await page.getByRole('button',{name:'Open Development boundary'}).click();
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download original source'}).click();
 const downloaded=await waiting;expect((await readFile(await downloaded.path())).toString()).toBe(source);
 expect(calls).toEqual([]);
});

test('local storage failure retains a canonical processing program draft and feeds the shared selector after retry',async({page})=>{
 await open(page,`/ops/programs?scope=${facility}`);await page.getByRole('button',{name:'Create work program'}).click();
 const form=page.getByRole('region',{name:'Plan a work program'});await form.getByLabel('Program name').fill('RECOVERED-DEVELOPMENT-PROGRAM');await form.getByLabel('Type of work').selectOption('processing');
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;window.restoreDevelopmentStorage=()=>{IDBDatabase.prototype.transaction=original;};IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')throw new DOMException('Injected development storage quota','QuotaExceededError');return original.call(this,names,mode,...args);};});
 await form.getByRole('button',{name:'Save program',exact:true}).click();
 await expect(form.getByRole('alert')).toBeVisible();await expect(form.getByLabel('Program name')).toHaveValue('RECOVERED-DEVELOPMENT-PROGRAM');
 await expect(page.locator('.ops-connection')).not.toContainText('Saved in this browser');
 await page.evaluate(()=>window.restoreDevelopmentStorage());
 await form.getByRole('button',{name:'Retry original save',exact:true}).click();await expect(form).toHaveCount(0);
 await page.goto(`/ops/plant?scope=${facility}&view=runs&mode=development`);await expect(page.locator('.ops-connection')).toContainText('Device workspace',{timeout:30000});await page.getByRole('button',{name:'Processing run',exact:true}).click();
 const runForm=page.getByRole('region',{name:'Processing run'}),program=runForm.getByLabel('Processing program (optional)');
 await expect(program.locator('option',{hasText:'RECOVERED-DEVELOPMENT-PROGRAM'})).toHaveCount(1,{timeout:30000});await expect(program).toHaveValue('');
});

test('one browser writer prevents concurrent overwrites; separate browsers have no shared data',async({page,context,browser,baseURL})=>{
 await open(page);await feed(page,'BROWSER-A-ONLY');
 const second=await context.newPage();await second.goto(`/ops/plant?scope=${facility}&view=feed`);
 await expect(second.getByText('The development workspace is open in another tab.',{exact:false})).toBeVisible({timeout:20000});
 await page.close();await second.reload();await expect(second.getByRole('row').filter({hasText:'BROWSER-A-ONLY'})).toBeVisible({timeout:30000});
 const separate=await browser.newContext({baseURL});try{const fresh=await separate.newPage();await open(fresh,`/ops/plant?scope=${facility}&view=feed`);await expect(fresh.getByRole('heading',{name:'No records yet'})).toBeVisible();await expect(fresh.getByText('BROWSER-A-ONLY')).toHaveCount(0);}finally{await separate.close();}
});

test('development choice never authorises live APIs and switching to staff stays explicit',async({page,request})=>{
 const calls=await open(page);await expect(page.getByRole('link',{name:'Development settings',exact:true})).toHaveCount(0);
 await expect(page.locator('.ops-development-banner')).toHaveCount(0);await expect(page.getByRole('link',{name:'Staff sign-in',exact:true})).toBeVisible();expect(calls).toEqual([]);
 const response=await request.get('/api/ops/context?mode=development',{headers:{'x-mineralx-ops-mode':'development'}});
 expect([401,503]).toContain(response.status());expect(await response.text()).not.toContain('Development facility');
 const write=await request.post('/api/ops/command?mode=development',{
  data:{scopeId:facility,id:crypto.randomUUID(),requestId:crypto.randomUUID(),expectedVersion:0,action:'campaign.create',payload:{name:'Must not write production'}},
  headers:{'x-mineralx-ops-mode':'development'},
 });
 expect([401,403,503]).toContain(write.status());
 await page.getByRole('link',{name:'Staff sign-in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your work starts here.'})).toBeVisible();
 await expect(page.locator('[data-mineralx-ops-mode]')).toHaveAttribute('data-mineralx-ops-mode','staff');
 await page.getByRole('link',{name:'Continue without sign-in — development workspace'}).click();await expect(page.locator('.ops-connection')).toContainText('Device workspace');
});

test('development backup downloads actual local PostgreSQL records and files',async({page})=>{
 const calls=await open(page);await feed(page,'BACKUP-DEVELOPMENT-ONLY');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download device backup'}).click();const file=await pending;
 expect(file.suggestedFilename()).toMatch(/^MineralX-DEVELOPMENT-.*\.tgz$/);const bytes=await readFile(await file.path());expect(bytes[0]).toBe(0x1f);expect(bytes[1]).toBe(0x8b);expect(bytes.length).toBeGreaterThan(1000);expect(calls).toEqual([]);
});

test('visiting staff sign-in does not replace the chosen device workspace',async({page})=>{
 await open(page,'/ops/pit');await page.getByRole('link',{name:'Staff sign-in',exact:true}).click();await expect(page.getByRole('heading',{name:'Your work starts here.'})).toBeVisible();await expect(page.locator('[data-mineralx-ops-mode]')).toHaveAttribute('data-mineralx-ops-mode','staff');await page.goto('/ops/pit');await expect(page.getByRole('heading',{name:'Pits & stockpiles',exact:true})).toBeVisible({timeout:30000});await expect(page.locator('.ops-connection')).toContainText('Device workspace');
});
test('the explicit staff gate offers an explicit return to the same device tool',async({page})=>{
 await page.goto('/ops/pit?mode=staff');await expect(page.getByRole('link',{name:'Staff sign in',exact:true})).toBeVisible({timeout:30000});const back=page.getByRole('link',{name:'Open device workspace',exact:true});await expect(back).toHaveAttribute('href','/ops/pit?mode=development');await back.click();await expect(page.getByRole('heading',{name:'Pits & stockpiles',exact:true})).toBeVisible({timeout:30000});await expect(page.locator('.ops-connection')).toContainText('Device workspace');
});

test('a legacy processing URL lands in Gold and keeps only compatible lot context',async({page})=>{
 await page.goto(`/ops/plant?scope=${facility}&view=lots&item=legacy-lot&action=run&mode=development`,{waitUntil:'domcontentloaded'});
 await expect(page).toHaveURL(new RegExp(`/ops/gold\\?scope=${facility}&view=lots&item=legacy-lot&mode=development`));
 await expect(page.getByRole('heading',{name:'Gold',exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('button',{name:'Gold lots',exact:true})).toBeVisible();
});

test('a legacy processing-program URL lands on the shared canonical program',async({page})=>{
 await page.goto(`/ops/plant?scope=${facility}&view=campaigns&item=legacy-program&mode=development`,{waitUntil:'domcontentloaded'});
 await expect(page).toHaveURL(new RegExp(`/ops/programs\\?scope=${facility}&item=legacy-program&mode=development`));
 await expect(page.getByRole('heading',{name:'Programs',exact:true})).toBeVisible({timeout:30000});
});

test('the mobile Operations drawer keeps focus and can be closed with its control or Escape',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page,`/ops/pit?scope=${project}`);const drawer=page.locator('#operations-navigation'),menu=page.getByRole('button',{name:'Menu',exact:true}),close=page.getByRole('button',{name:'Close',exact:true}),last=drawer.getByRole('link').last();await menu.click();await expect(drawer).toHaveClass(/is-open/);await expect(close).toBeFocused();await last.focus();await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();await close.click();await expect(drawer).not.toHaveClass(/is-open/);await expect(menu).toBeFocused();await menu.click();await page.keyboard.press('Escape');await expect(drawer).not.toHaveClass(/is-open/);await expect(menu).toBeFocused();
});
