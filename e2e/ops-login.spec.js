import {test,expect} from '@playwright/test';

test('a first visit explains the available workspaces before opening any records',async({page})=>{
 const protectedCalls=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/ops/'))protectedCalls.push(request.url());});
 await page.goto('/ops',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-mineralx-ops-mode]')).toHaveAttribute('data-mineralx-ops-mode','chooser');
 await expect(page.getByRole('heading',{name:'Choose the workspace that holds this work.'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Staff sign in',exact:true})).toHaveAttribute('href','/ops/login');
 await expect(page.getByRole('link',{name:'Open private meetings',exact:true})).toHaveAttribute('href','/ops/meetings');
 await expect(page.getByRole('link',{name:'Open device workspace',exact:true})).toHaveAttribute('href','/ops?mode=development');
 expect(protectedCalls).toEqual([]);
 await page.getByRole('link',{name:'Staff sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your work starts here.'})).toBeVisible();
});

test('sign-in remains visible while the Operations context request is pending',async({page})=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});let requested=false;
 await page.route('**/api/ops/context',async route=>{requested=true;await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Operations unavailable',code:'unavailable'})}).catch(()=>{});});
 try{
  await page.goto('/ops/login',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>requested).toBe(true);
  await expect(page.getByRole('heading',{name:'Your work starts here.'})).toBeVisible({timeout:3000});
  await expect(page.getByRole('link',{name:'Existing processing / admin sign-in'})).toHaveAttribute('href','/gic/login');
  await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Reset your password'})).toBeVisible();
 }finally{release();}
});

test('anonymous continuation cannot grant access or follow an external next URL',async({request,baseURL})=>{
 const response=await request.get('/ops/auth/continue?next=%2F%2Fevil.example',{maxRedirects:0});
 expect([302,303,307]).toContain(response.status());
 const target=new URL(response.headers().location,baseURL);
 expect(target.origin).toBe(new URL(baseURL).origin);expect(target.pathname).toBe('/ops/login');
 expect(target.searchParams.get('next')).toBe('/ops');
 expect(response.headers()['cache-control']).toContain('no-store');
});

test('a failed server account check is distinguished from invalid credentials',async({page})=>{
 await page.goto('/ops/login?access=unavailable');
 await expect(page.getByText('Account access could not be checked.',{exact:false})).toBeVisible();
 await expect(page.getByRole('link',{name:'Existing processing / admin sign-in'})).toBeVisible();
});
