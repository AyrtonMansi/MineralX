import {test,expect} from '@playwright/test';

const facility='de000000-0000-4000-8000-000000000003';

test('ChatGPT draft geometry opens directly in the real 3D Engineering surface without a database write',async({page})=>{
 const protectedCalls=[],documentUrls=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/ops/engineering-design')protectedCalls.push(request.url());if(request.isNavigationRequest())documentUrls.push(request.url());});
 const draft=JSON.stringify([{type:'move_equipment',equipmentId:'ROM',x:9,y:41}]);
 const query=new URLSearchParams({scope:facility,view:'engineering',surface:'cad',mode:'development'}),fragment=new URLSearchParams({draft});
 await page.goto(`/ops/plant?${query.toString()}#${fragment.toString()}`);
 await expect(page.getByText('ChatGPT design preview',{exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByText('Unsaved conversational geometry',{exact:true})).toBeVisible();
 await expect(page.locator('.cad-stage canvas')).toBeVisible({timeout:30000});
 await expect(page.getByRole('link',{name:'Return to P5 basis'})).toBeVisible();
 await expect(page.getByLabel('Equipment')).toContainText('ROM · ROM stockpile');
 expect(protectedCalls).toEqual([]);
 expect(documentUrls.every(url=>!url.includes('move_equipment')&&!url.includes('ROM%22'))).toBe(true);
});
