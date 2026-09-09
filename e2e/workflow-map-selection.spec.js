import {test,expect} from '@playwright/test';
const project='de000000-0000-4000-8000-000000000004';
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
const region=(page,name)=>page.getByRole('region',{name,exact:true});
async function save(form,button){await form.getByRole('button',{name:button,exact:true}).click();await expect(form).toHaveCount(0,{timeout:20000});}
// Real local PostgreSQL, source normalization, MapLibre rendering and pointer events.
// External background tiles alone are synthetic. No application or record APIs are mocked.
test('the shared Exploration map opens the exact field record on a rendered point click, including after reload',async({page})=>{
 test.setTimeout(75000);
 const errors=[],protectedRequests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/ops/')||u.hostname.endsWith('.supabase.co'))protectedRequests.push(r.url());});
 await page.route('**/api/basemap/**',r=>r.fulfill({contentType:'image/png',body:TILE}));
 await page.goto(`/ops?scope=${project}&mode=development`,{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('combobox',{name:'Workspace or site'})).toHaveCount(0,{timeout:30000});
 const title='SYNTHETIC-MAP-TARGET';
 await page.goto(`/ops/geology?scope=${project}&view=targets`);
 await page.getByRole('button',{name:'Record field target',exact:true}).click();
 const f=region(page,'Record field target');await f.getByLabel('Target name').fill(title);
 await f.getByLabel('Latitude, WGS84').fill('-20');await f.getByLabel('Longitude, WGS84').fill('144');
 await save(f,'Record target');
 // The register and detail heading use the generated target reference, not its name.
 // Read that visible identity from the sole saved row; never inject a database ID.
 const row=page.getByRole('row').filter({has:page.getByRole('button',{name:/^Open TG-/})});
 await expect(row).toHaveCount(1);
 const reference=(await row.getByRole('cell').first().innerText()).trim();
 expect(reference).toMatch(/^TG-/);
 await row.getByRole('button',{name:`Open ${reference}`,exact:true}).click();
 await expect(page.getByRole('heading',{name:reference,exact:true,level:2})).toBeVisible();
 await expect(page.getByText(title,{exact:true})).toBeVisible();
 const id=new URL(page.url()).searchParams.get('item');expect(id).toMatch(/^[0-9a-f-]{36}$/);
 for(const reload of [false,true]){
  await page.goto(`/ops/geology?scope=${project}&view=map`);
  if(reload)await page.reload();
  const canvas=page.locator('.ops-map-canvas canvas.maplibregl-canvas');await expect(canvas).toBeVisible({timeout:30000});
  await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();expect(box).not.toBeNull();
  const point={x:box.width/2,y:box.height/2};
  // One canonical target means fitBounds centres it. Pointer feedback proves a rendered hit,
  // not a timer or an injected map object. Retries only hover; navigation is clicked once.
  await expect(async()=>{await canvas.hover({position:{x:15,y:15}});await canvas.hover({position:point});await expect(canvas).toHaveCSS('cursor','pointer',{timeout:1000});}).toPass({timeout:15000});
  await canvas.click({position:point});
  await expect(page.getByRole('heading',{name:reference,exact:true,level:2})).toBeVisible();
  await expect(page.getByText(title,{exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('item')).toBe(id);
 }
 expect(errors).toEqual([]);expect(protectedRequests).toEqual([]);
});
