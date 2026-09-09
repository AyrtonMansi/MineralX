import {test,expect} from '@playwright/test';
test.beforeEach(async({context,baseURL})=>{await context.addCookies([{name:'mx-ops-workspace-mode',value:'staff',domain:new URL(baseURL).hostname,path:'/ops',httpOnly:true,sameSite:'Lax'}]);});
// UI integration fixtures only. These tests do not claim live identity/database acceptance.
const scopeId='00000000-0000-4000-8000-000000000011',userId='00000000-0000-4000-8000-000000000001';
const scope={id:scopeId,name:'Synthetic project',code:'SYNTHETIC',kind:'project',timezone:'Australia/Brisbane',permissions:['geo.read','geo.capture','geo.publish','files.geo','work.read','work.write'],version:1,policy:{}};
const project={id:scopeId,name:scope.name,color:'#24553d',samples:[],collars:[],targets:[],programs:[],dispatches:[],assayBatches:[],spatialLayers:[],geology:[],surveys:[],intervals:[],boundary:null};
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
async function fixture(page){
 await page.route('**/api/basemap/**',r=>r.fulfill({status:200,contentType:'image/png',body:TILE}));
 await page.route('**/api/ops/**',r=>{
  const name=new URL(r.request().url()).pathname.split('/').pop();
  if(r.request().method()!=='GET')return r.fulfill({status:503,json:{error:{code:'unavailable',message:'No shared writes in UI fixtures'}}});
  return r.fulfill({json:name==='context'?{userId,scopes:[scope],organisations:[],aal:'aal1',schemaVersion:6,capabilities:{sharedGeology:true,evidence:true}}:name==='geology'?{project,versions:{},revision:1}:name==='files'?[]:name==='register'?{rows:[],next:null}:name==='choices'?{}:name==='workflow'?{types:[],programs:[],tasks:[],people:[],assets:[],fuel:[],energy:[],engineering:[],costs:[],spares:[],spareMoves:[],dependencies:[],complete:true}:{}});
 });
}
test('Operations fixture retains an unsaved entry when navigation is cancelled',async({page})=>{
 await fixture(page);await page.goto(`/ops/geology?scope=${scopeId}`);
 await page.getByRole('button',{name:'Collect a physical sample',exact:true}).click();
 await page.getByLabel('Physical sample / bag identifier').fill('UNSUBMITTED-FIXTURE');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'Work',exact:true}).click();
 await expect(page.getByLabel('Physical sample / bag identifier')).toHaveValue('UNSUBMITTED-FIXTURE');
 await expect(page).toHaveURL(/\/ops\/geology/);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'Work',exact:true}).click();
 await expect(page).toHaveURL(/\/ops\/work/);
});
test('Operations map fixture preserves personal visibility on mobile reload',async({page})=>{
 await fixture(page);await page.setViewportSize({width:390,height:844});
 await page.goto(`/ops/geology?scope=${scopeId}&view=map`);
 await page.getByRole('checkbox',{name:'Physical samples',exact:true}).uncheck();
 await page.reload();await expect(page.getByRole('checkbox',{name:'Physical samples',exact:true})).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Targets',exact:true})).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('expired invitation completion is reachable without Operations membership',async({page})=>{
 await page.route('**/api/ops/**',r=>r.fulfill({status:401,json:{error:{code:'unauthenticated',message:'Sign in with your invited MineralX account.'}}}));
 await page.goto('/ops/auth/complete#error=access_denied');
 await expect(page.getByRole('heading',{name:'Complete staff access'})).toBeVisible();
 await expect(page.locator('.ops-message[role=alert]')).toContainText('expired');
 await expect(page).toHaveURL(/\/ops\/auth\/complete$/);
});
