import {test,expect} from '@playwright/test';

const project='de000000-0000-4000-8000-000000000004';
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');

async function globeWorkspace(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('mineralx-geology',1);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const database=request.result,transaction=database.transaction('records','readonly'),read=transaction.objectStore('records').get('workspace');
   transaction.oncomplete=()=>{database.close();resolve(read.result);};
   transaction.onabort=()=>{database.close();reject(transaction.error);};
  };
 }));
}

async function saved(page){await expect(page.locator('.mxf-status')).toHaveAttribute('data-state','saved');}
async function navigation(page,name){await page.getByRole('navigation',{name:'Geology workspace'}).getByRole('button',{name,exact:true}).click();}

// This test follows the actual browser-local records through both applications.
// It does not sign in, mock either persistence layer, or permit live Operations
// or Supabase traffic.
test('a Globe program keeps its UUID through device Operations and back to Globe without staff requests',async({page})=>{
 test.setTimeout(75_000);
 const protectedRequests=[];
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.pathname.startsWith('/api/ops/')||url.hostname.endsWith('.supabase.co'))protectedRequests.push(request.url());
 });
 await page.route('**/api/basemap/**',route=>route.fulfill({status:200,contentType:'image/png',body:TILE}));
 await page.route(/\/api\/ops(?:\/|$)/,route=>route.abort());
 await page.route(/https?:\/\/[^/]*\.supabase\.co(?:\/|$)/,route=>route.abort());

 const title='UUID bridge sampling program';
 await page.goto('/mineralx',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('link',{name:'Open Device Exploration & work →',exact:true})).toHaveAttribute('href','/ops/geology?mode=development');
 await page.getByLabel('Project name',{exact:true}).fill('UUID bridge project');
 await page.getByRole('button',{name:'Create project',exact:true}).click();
 await saved(page);
 await navigation(page,'Programs');
 await page.getByLabel('Program name',{exact:true}).fill(title);
 await page.getByRole('button',{name:'Create program',exact:true}).click();
 await expect.poll(async()=>{
  const workspace=await globeWorkspace(page),active=workspace?.data?.projects?.find(row=>row.id===workspace.data.activeProjectId);
  return active?.programs?.find(row=>row.name===title)?.recordId||null;
 }).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i);
 const initial=await globeWorkspace(page),globeProject=initial.data.projects.find(row=>row.id===initial.data.activeProjectId),programId=globeProject.programs.find(row=>row.name===title).recordId;

 await page.goto(`/ops/geology?scope=${project}&view=map&mode=development`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.ops-connection')).toContainText('Device workspace',{timeout:30_000});
 const selector=page.getByRole('combobox',{name:'Work program',exact:true});
 await expect(selector).toBeVisible({timeout:30_000});
 const option=selector.locator('option',{hasText:title});
 await expect(option).toHaveAttribute('value',programId);
 await selector.selectOption(programId);
 await expect(selector).toHaveValue(programId);

 await page.goto('/mineralx',{waitUntil:'domcontentloaded'});
 await saved(page);
 await navigation(page,'Programs');
 await expect(page.locator('.mxf-card').filter({hasText:title})).toHaveCount(1);
 const returned=await globeWorkspace(page),returnedProject=returned.data.projects.find(row=>row.id===returned.data.activeProjectId),returnedPrograms=returnedProject.programs.filter(row=>row.name===title);
 expect(returnedPrograms).toHaveLength(1);
 expect(returnedPrograms[0].recordId).toBe(programId);
 expect(protectedRequests).toEqual([]);
});
