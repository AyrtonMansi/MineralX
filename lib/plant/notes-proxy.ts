const backend='https://josephine-plant-review.mineralx.chatgpt.site/api/notes';
const cookieName='mx_plant_reviewer';
const reply=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});

/** Forward only this page's reviewer credential to its public notes service. */
export async function proxyPlantNotes(request:Request,transport:typeof fetch=fetch) {
  const url=new URL(request.url);
  if(!['GET','POST','PATCH'].includes(request.method))return reply('Method not allowed.',405);
  if(request.method!=='GET') {
    const origin=request.headers.get('origin');
    if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return reply('Open the plant page to save notes.',403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply('Use a JSON note.',415);
  }
  const target=new URL(backend);
  if(url.searchParams.has('after'))target.searchParams.set('after',url.searchParams.get('after')!);
  const headers=new Headers({Accept:'application/json',Origin:target.origin});
  const cookie=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));
  if(cookie&&new RegExp('^'+cookieName+'=[a-f0-9]{64}$').test(cookie))headers.set('Cookie',cookie);
  let body:string|undefined;
  if(request.method!=='GET') {
    body=await request.text();
    if(body.length>24000)return reply('This note is too long.',413);
    headers.set('Content-Type','application/json');
  }
  try {
    const response=await transport(target,{method:request.method,headers,body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.headers.get('content-type')?.includes('application/json'))return reply('Review notes are temporarily unavailable. Your draft is kept; please retry.',503);
    const output=new Headers({'Content-Type':'application/json','Cache-Control':'private, no-store','X-Robots-Tag':'noindex'});
    // Never forward another site's auth cookies or the caller's GIC/Supabase credentials.
    const cookies=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')||''];
    for(const value of cookies)if(value.startsWith(cookieName+'='))output.append('Set-Cookie',value);
    return new Response(response.body,{status:response.status,headers:output});
  }catch{
    return reply('Review notes are temporarily unavailable. Your draft is kept; please retry.',503);
  }
}
