import {test,expect} from '@playwright/test';
const ws='40000000-0000-4000-8000-000000000001',actor='40000000-0000-4000-8000-000000000002',mid='40000000-0000-4000-8000-000000000003',cid='40000000-0000-4000-8000-000000000004';
const source='Synthetic notes only.\nNext steps\n\nField lead\n* Inspect synthetic stockpile.\n\nSummary\n<img src=x onerror="window.meetingInjection=true">';
function fixture(){const meeting={id:mid,workspace_id:ws,workspace_name:'Synthetic private JV',title:'Synthetic planning meeting',held_on:'2026-09-09',current_revision:1,imported_at:'2026-09-09T02:00:00Z',actions:1,pending:1,reviewed:0,dismissed:0};return {index:{userId:actor,email:'synthetic@example.invalid',workspaces:[{id:ws,name:'Synthetic private JV',role:'reviewer'}],meetings:[meeting],more:false,intake:{automatic:false,message:'Continuous intake is not connected yet.'}},detail:{meeting,revision:1,source:{source_text:source,source_hash:'a'.repeat(64),source_url:'',source_kind:'manual',imported_at:'2026-09-09T02:00:00Z'},versions:[{revision:1,imported_at:'2026-09-09T02:00:00Z'}],candidates:[{id:cid,ordinal:1,title:'Inspect synthetic stockpile',owner_text:'Field lead',source_quote:'Inspect synthetic stockpile.',flags:['Confirm relative date'],state:'proposed',due_on:null,review_note:'',version:1}],canReview:true}};}
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'private, no-store'},body:JSON.stringify(data)});

test('Meetings is discoverable from Operations and remains private even with development requested',async({page,request})=>{
 await page.route('**/api/ops/meetings',r=>json(r,{error:{code:'unauthenticated',message:'Sign in with your assigned account.'}},401));
 await page.goto('/ops?mode=development');await expect(page.getByRole('navigation',{name:'Operations'}).getByRole('link',{name:'Meetings',exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('navigation',{name:'Operations'}).getByRole('link',{name:'Meetings',exact:true}).click();await expect(page.getByRole('heading',{name:'Meetings',exact:true})).toHaveCount(1);await expect(page.getByRole('heading',{name:'Sign in to view your meetings'})).toBeVisible();await expect(page.getByLabel('Temporary development access')).toHaveCount(0);
 await page.goto('/ops/meetings?mode=development');await expect(page.locator('[data-mineralx-ops-mode="staff"]')).toBeVisible();await expect(page.getByRole('heading',{name:'Sign in to view your meetings'})).toBeVisible();
 const response=await request.get('/api/ops/meetings');expect([401,503]).toContain(response.status());expect(response.headers()['cache-control']).toContain('no-store');expect(await response.text()).not.toContain('source_text');
});

test('a Meetings URL cannot silently select the device workspace for later visits',async({page,context})=>{
 await page.goto('/ops/meetings?mode=development',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-mineralx-ops-mode="staff"]')).toBeVisible();
 expect((await context.cookies()).some(cookie=>cookie.name==='mx-ops-workspace-mode')).toBe(false);
 await page.goto('/ops/meetings?mode=staff',{waitUntil:'domcontentloaded'});
 expect((await context.cookies()).some(cookie=>cookie.name==='mx-ops-workspace-mode')).toBe(false);
 await page.goto('/ops',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-mineralx-ops-mode="chooser"]')).toBeVisible();
});

test('manual note import carries a Gmail source link for later revisions',async({page})=>{
 const f=fixture(),imports=[];await page.route('**/api/ops/meetings',route=>{if(route.request().method()==='POST'){imports.push(route.request().postDataJSON());return json(route,{id:mid});}return json(route,f.index);});await page.route('**/api/ops/meetings/'+mid+'**',route=>json(route,f.detail));
 await page.goto('/ops/meetings');await page.getByRole('button',{name:'Add meeting notes',exact:true}).click();const form=page.getByRole('form',{name:'Import meeting notes'});
 await form.getByLabel('Meeting date').fill('2026-09-09');await form.getByLabel('Meeting title').fill('Linked source meeting');await form.getByLabel('Gmail source link (optional)').fill('https://mail.google.com/mail/#all/synthetic-source');await form.getByLabel('Original notes').fill('Synthetic meeting notes with enough detail.\n\nNext steps\n\nField lead\n* Confirm the source revision.\n\nSummary');await form.getByRole('button',{name:'Save meeting',exact:true}).click();
 await expect.poll(()=>imports.length).toBe(1);expect(imports[0].sourceUrl).toBe('https://mail.google.com/mail/#all/synthetic-source');
});

test('the mobile Meetings drawer keeps focus and can be closed with its control or Escape',async({page})=>{
 const f=fixture();await page.route('**/api/ops/meetings',route=>json(route,f.index));await page.route('**/api/ops/meetings/'+mid+'**',route=>json(route,f.detail));await page.setViewportSize({width:390,height:844});await page.goto('/ops/meetings');
 const drawer=page.locator('#meetings-navigation'),menu=page.getByRole('button',{name:'Menu',exact:true}),close=page.getByRole('button',{name:'Close',exact:true}),last=drawer.getByRole('link').last();await menu.click();await expect(drawer).toHaveClass(/is-open/);await expect(close).toBeFocused();await last.focus();await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();await close.click();await expect(drawer).not.toHaveClass(/is-open/);await expect(menu).toBeFocused();await menu.click();await page.keyboard.press('Escape');await expect(drawer).not.toHaveClass(/is-open/);await expect(menu).toBeFocused();
});

test('private meeting reader shows actions and escaped source notes on desktop and mobile',async({page})=>{
 const f=fixture(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/ops/meetings',r=>json(r,f.index));await page.route('**/api/ops/meetings/'+mid,r=>json(r,f.detail));
 await page.goto('/ops/meetings');await expect(page.getByRole('heading',{name:'Synthetic planning meeting'})).toBeVisible();await expect(page.getByRole('heading',{name:'Inspect synthetic stockpile'})).toBeVisible();await page.getByRole('button',{name:'Original notes'}).click();await expect(page.locator('.mt-notes pre')).toHaveText(source);expect(await page.evaluate(()=>window.meetingInjection)).toBeUndefined();await expect(page.locator('.mt-notes img')).toHaveCount(0);
 await page.screenshot({path:'test-results/meetings-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Meetings',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/meetings-mobile.png',fullPage:true});expect(errors).toEqual([]);
});

test('private meeting navigation does not promise staff-only Operations pages',async({page})=>{
 const f=fixture();await page.route('**/api/ops/meetings',r=>json(r,f.index));await page.route('**/api/ops/meetings/'+mid,r=>json(r,f.detail));
 await page.goto('/ops/meetings');const nav=page.getByRole('navigation',{name:'Meetings navigation'});
 await expect(nav.getByRole('link',{name:/Meetings/})).toBeVisible();await expect(nav.getByRole('link',{name:/Device workspace/})).toHaveAttribute('href','/ops?mode=development');await expect(nav.getByRole('link',{name:/Shared Operations/})).toHaveAttribute('href','/ops/login');
 await expect(nav.getByRole('link',{name:'Geology',exact:true})).toHaveCount(0);await expect(nav.getByRole('link',{name:'Plant',exact:true})).toHaveCount(0);
});

test('failed review retains the entry and retry uses one request identity',async({page})=>{
 const f=fixture(),attempts=[];await page.route('**/api/ops/meetings',r=>json(r,f.index));await page.route('**/api/ops/meetings/'+mid,r=>json(r,f.detail));await page.route('**/api/ops/meetings/review',async r=>{const p=r.request().postDataJSON();attempts.push(p);if(attempts.length===1)return json(r,{error:{code:'unavailable',message:'Synthetic interrupted save. Entry retained.'}},503);Object.assign(f.detail.candidates[0],{title:p.title,owner_text:p.owner,due_on:p.dueOn||null,state:p.state,review_note:p.note,version:2});f.index.meetings[0].pending=0;f.index.meetings[0].reviewed=1;return json(r,f.detail.candidates[0]);});
 await page.goto('/ops/meetings');await page.getByRole('button',{name:'Review',exact:true}).click();const form=page.getByRole('form',{name:'Review meeting action'});await form.getByLabel('Action',{exact:true}).fill('Inspect the confirmed synthetic stockpile');await form.getByLabel('Review status').selectOption('reviewed');await form.getByRole('button',{name:'Save review'}).click();await expect(form.getByRole('alert')).toContainText('Entry retained');await expect(form.getByLabel('Action',{exact:true})).toHaveValue('Inspect the confirmed synthetic stockpile');await form.getByRole('button',{name:'Save review'}).click();await expect(form).toHaveCount(0);await expect(page.getByRole('heading',{name:'Inspect the confirmed synthetic stockpile'})).toBeVisible();expect(attempts).toHaveLength(2);expect(attempts[0].requestId).toBe(attempts[1].requestId);expect(attempts[1].expectedActorId).toBe(actor);
});

test('failed detail reads do not loop and membership revocation clears private content',async({page})=>{
 const f=fixture();let calls=0,fail=true,revoked=false;await page.route('**/api/ops/meetings',r=>json(r,revoked?{...f.index,meetings:[],workspaces:[]}:f.index));await page.route('**/api/ops/meetings/'+mid,r=>{calls++;return fail?json(r,{error:{code:'unavailable',message:'Synthetic read failure'}},503):json(r,f.detail);});
 await page.goto('/ops/meetings');await expect(page.locator('.mt-main .mt-error')).toContainText('Synthetic read failure');await page.waitForTimeout(500);expect(calls).toBe(1);fail=false;await page.getByRole('button',{name:'Refresh meetings',exact:true}).click();await expect(page.getByRole('heading',{name:'Synthetic planning meeting'})).toBeVisible();revoked=true;await page.getByRole('button',{name:'Refresh meetings',exact:true}).click();await expect(page.getByRole('heading',{name:'No JV workspace assigned to this account'})).toBeVisible();await expect(page.getByRole('heading',{name:'Synthetic planning meeting'})).toHaveCount(0);await expect(page.locator('.mt-action')).toHaveCount(0);
});

test('sign-in email is requested only after the user submits the form',async({page})=>{
 let sent=0;await page.route('**/api/ops/meetings',r=>json(r,{error:{code:'unauthenticated',message:'Sign in'}},401));await page.route('**/api/ops/meetings/signin',r=>{sent++;expect(r.request().postDataJSON().email).toBe('synthetic@example.invalid');return json(r,{message:'Synthetic sign-in request accepted. No email was sent.'});});await page.goto('/ops/meetings');await expect(page.getByRole('heading',{name:'Sign in to view your meetings'})).toBeVisible();expect(sent).toBe(0);await page.getByLabel('Work email').fill('synthetic@example.invalid');await page.getByRole('button',{name:'Email me a secure sign-in link'}).click();await expect(page.getByRole('status')).toContainText('No email was sent');expect(sent).toBe(1);
});

test('notes export checks current access before creating a download',async({page})=>{
 const f=fixture();let revoke=false,downloads=0;page.on('download',()=>downloads++);await page.route('**/api/ops/meetings',r=>json(r,f.index));await page.route('**/api/ops/meetings/'+mid+'**',r=>revoke?json(r,{error:{code:'forbidden',message:'Access revoked'}},403):json(r,f.detail));await page.goto('/ops/meetings');await expect(page.getByRole('heading',{name:'Synthetic planning meeting'})).toBeVisible();await page.getByRole('button',{name:'Original notes'}).click();revoke=true;await page.getByRole('button',{name:'Download notes'}).click();await expect(page.getByRole('heading',{name:'Sign in to view your meetings'})).toBeVisible();await expect(page.locator('.mt-notes pre')).toHaveCount(0);expect(downloads).toBe(0);
});
