import 'server-only';

import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {OpsError,type Scope} from '@/lib/ops/contracts';
import {oauthToolMeta} from './contracts';
import type {McpPrincipal} from './auth';

const dataEnvelopeSchema=z.object({data:z.unknown()});
const surfaceSchema=z.enum(['home','exploration','engineering','processing','equipment','maintenance','energy','gold','programs','work','files','reports','intelligence','pit','meetings','account']);
type Surface=z.infer<typeof surfaceSchema>;

const requirements:Record<Surface,{permission?:string;kind?:Scope['kind'];path:string;view?:string}>={
 home:{path:'/ops'},
 exploration:{permission:'geo.read',kind:'project',path:'/ops/geology',view:'map'},
 engineering:{permission:'plant.read',kind:'facility',path:'/ops/plant',view:'engineering'},
 processing:{permission:'plant.read',kind:'facility',path:'/ops/plant',view:'runs'},
 equipment:{permission:'plant.read',kind:'facility',path:'/ops/plant',view:'assets'},
 maintenance:{permission:'plant.read',kind:'facility',path:'/ops/plant',view:'maintenance'},
 energy:{permission:'plant.read',kind:'facility',path:'/ops/plant',view:'energy'},
 gold:{permission:'gold.read',kind:'facility',path:'/ops/gold'},
 programs:{permission:'work.read',path:'/ops/programs'},
 work:{permission:'work.read',path:'/ops/work'},
 files:{permission:'work.read',path:'/ops/files'},
 reports:{permission:'report.read',path:'/ops/reports'},
 intelligence:{permission:'work.read',path:'/ops/intelligence'},
 pit:{permission:'geo.read',kind:'project',path:'/ops/pit'},
 meetings:{path:'/ops/meetings'},
 account:{path:'/ops/account'},
};

function result(data:unknown){return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{data}};}
function publicOrigin(){return (process.env.MINERALX_PUBLIC_ORIGIN||'https://mineral-x.com.au').replace(/\/$/,'');}
function assignedScope(principal:McpPrincipal,scopeId:string){const scope=principal.context.scopes.find(candidate=>candidate.id===scopeId);if(!scope)throw new OpsError('forbidden','This workspace is not assigned to the connected account.');return scope;}
function permitted(scope:Scope, surface:Surface){const requirement=requirements[surface];return (!requirement.kind||scope.kind===requirement.kind)&&(!requirement.permission||scope.permissions.includes(requirement.permission));}
function surfaceUrl(scope:Scope,surface:Surface,itemId?:string,extraView?:string){
 const requirement=requirements[surface],query=new URLSearchParams();query.set('scope',scope.id);if(requirement.view)query.set('view',requirement.view);if(extraView)query.set('view',extraView);if(itemId)query.set('item',itemId);
 return `${publicOrigin()}${requirement.path}${query.size?`?${query.toString()}`:''}`;
}
function capabilityFor(scope:Scope){
 const surfaces=(Object.keys(requirements) as Surface[]).filter(surface=>permitted(scope,surface)).map(surface=>({surface,url:surfaceUrl(scope,surface)}));
 return {
  scopeId:scope.id,name:scope.name,kind:scope.kind,permissions:scope.permissions,surfaces,
  interactions:{
   read:['search_mineralx','list_mineralx_records','get_mineralx_record'],
   evidence:scope.permissions.includes('work.write')?['stage_mineralx_source','create_mineralx_intake','analyze_mineralx_intake','approve_mineralx_intake','apply_mineralx_intake']:[],
   engineering:scope.kind==='facility'&&scope.permissions.includes('plant.read')?['get_mineralx_plant_model','get_mineralx_equipment_modeling_gaps','preview_mineralx_plant_design','list_mineralx_plant_designs','get_mineralx_plant_design',...(scope.permissions.includes('plant.capture')?['propose_mineralx_plant_design']:[])]:[],
  },
 };
}

export function registerSuiteMcpTools(server:McpServer,principal:McpPrincipal){
 server.registerTool('get_mineralx_suite_capabilities',{
  title:'Get MineralX suite capabilities',
  description:'Read the connected account’s complete MineralX workspace/surface map and the supported MCP interaction paths. Use this when the user asks ChatGPT to work across Engineering, Exploration, Processing, Gold, Programs, Work, Files, Reports or Intelligence.',
  inputSchema:z.object({}).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:oauthToolMeta(),
 },async()=>result({scopes:principal.context.scopes.map(capabilityFor),controlModel:'Read operations are direct. Engineering supports evidence-aware equipment modelling, live unsaved parametric previews and governed durable proposals. Other record mutations flow through explicit governed proposal/approval/apply paths; physical plant operation is never exposed.'}));

 server.registerTool('open_mineralx_surface',{
  title:'Open a MineralX suite surface',
  description:'Return the exact authorised MineralX URL for a suite surface or record context so ChatGPT can move the user between Engineering, Exploration, Processing and the rest of MineralX without guessing routes.',
  inputSchema:z.object({scopeId:z.string().uuid(),surface:surfaceSchema,itemId:z.string().uuid().optional(),view:z.string().trim().min(1).max(80).optional()}).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:oauthToolMeta(),
 },async({scopeId,surface,itemId,view})=>{
  try{const scope=assignedScope(principal,scopeId);if(!permitted(scope,surface))throw new OpsError('forbidden','That MineralX surface is not available in this workspace or role.');return result({scopeId,surface,url:surfaceUrl(scope,surface,itemId,view),workspace:scope.name});}
  catch(error){const known=error instanceof OpsError?error:new OpsError('unavailable','MineralX could not resolve that suite surface.');return {isError:true,content:[{type:'text' as const,text:`${known.code}: ${known.message}`}],structuredContent:{data:{error:{code:known.code,message:known.message}}}};}
 });
}
