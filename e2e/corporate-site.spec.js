import {test,expect} from '@playwright/test';

test('header carries the MineralX Resources lockup and only live destinations',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('link',{name:'MineralX Resources home'})).toContainText(/MineralX\s*Resources/i);
 for(const [name,href] of [['Company','/company'],['Our direction','/direction'],['Partnerships','/partnerships'],['Contact','/contact']]){
  await expect(nav.getByRole('link',{name,exact:true})).toHaveAttribute('href',href);
 }
 // Staff sign-in is footer-only for now.
 await expect(nav.getByRole('link',{name:'Staff sign in'})).toHaveCount(0);
 // The GIC pages are retired and redirect into Operations; the header must not advertise them.
 await expect(page.locator('a[href^="/gic"]')).toHaveCount(0);
 await page.goto('/company',{waitUntil:'domcontentloaded'});
 await expect(nav.getByRole('link',{name:'Company',exact:true})).toHaveAttribute('aria-current','page');
});

test('footer states the legal entity, ABN and postal address',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const footer=page.locator('footer').last();
 await expect(footer.locator('address')).toContainText('MineralX Resources Pty Ltd');
 await expect(footer.locator('address')).toContainText('ABN 46 688 770 194');
 await expect(footer.locator('address')).toContainText('PO Box 6088');
 await expect(footer.locator('address')).toContainText('Cairns City');
 await expect(footer).toContainText(`© ${new Date().getFullYear()} MineralX Resources Pty Ltd`);
});

test('site photography loads on every page that uses it',async({page})=>{
 const failed=[];page.on('response',r=>{if(r.url().includes('/images/site/')&&r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
 for(const [path,expected] of [['/',2],['/company',2],['/direction',4],['/partnerships',1]]){
  await page.goto(path,{waitUntil:'domcontentloaded'});
  const photos=page.locator('img[src*="/images/site/"]');
  await expect(photos).toHaveCount(expected);
  for(const img of await photos.all()){
   // Intro photos drift continuously, so Playwright's stability wait never settles.
   await img.evaluate(el=>el.scrollIntoView({block:'center'}));
   await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0),{message:`${path} photo decoded`}).toBe(true);
  }
 }
 expect(failed).toEqual([]);
});
