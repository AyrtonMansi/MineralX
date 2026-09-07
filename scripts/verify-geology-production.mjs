import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const origin='https://mineral-x.com.au';
const expected=process.env.EXPECTED_SHA;
assert.match(expected||'',/^[a-f0-9]{40}$/,'Expected the exact release commit');
await mkdir('test-results',{recursive:true});
let release;
const deadline=Date.now()+360000;
while(Date.now()<deadline){
  try{
    const res=await fetch(`${origin}/api/mineralx-release?verification=${expected}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(res.ok){const candidate=await res.json();if(candidate.commit===expected){release=candidate;break;}}
  }catch(error){console.log(`Deployment not observable yet: ${error.message}`);}
  await delay(10000);
}
assert.equal(release?.commit,expected,'Production did not serve the intended source revision');
assert.equal(release.release,'2026.09.07.2');
assert.equal(release.cloudSync,false);
const routes=[];
for(const path of ['/','/company','/contact','/clothing','/gic/login','/plant','/mineralx']){
  const res=await fetch(`${origin}${path}`,{signal:AbortSignal.timeout(20000)});
  assert.equal(res.status,200,`${path} failed on production`);routes.push({path,status:res.status});
}
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/mineralx`,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.mxf-status[data-state="saved"]').waitFor({timeout:30000});
  const names=await page.getByRole('navigation',{name:'Geology workspace'}).getByRole('button').allTextContents();
  assert.deepEqual(names,['Map','Programs','Samples','Drilling','Review']);
  // The footer fetches release metadata after hydration; wait for that real response.
  await expect(page.locator('.mxf-release')).toContainText(expected.slice(0,7),{timeout:30000});
  await page.screenshot({path:'test-results/geology-production-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/geology-production-mobile.png',fullPage:true});
  assert.deepEqual(errors,[],'Unexpected browser runtime errors');
  const report={observedAt:new Date().toISOString(),origin,release,routes,navigation:names,runtimeErrors:errors,scope:'Fresh browser context; no operational data or paid requests'};
  await writeFile('test-results/geology-production.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
