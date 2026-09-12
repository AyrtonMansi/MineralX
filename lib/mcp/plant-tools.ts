import 'server-only';

import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import plan from '@/data/plant-p5.json';
import {plantSchema} from '@/lib/plant/model';
import {applyPlantDesignOperations,compactPlantModel,plantDesignOperationsSchema,plantModelFingerprint} from '@/lib/plant/design';
import {classifyDatabaseError,OpsError,type Scope} from '@/lib/ops/contracts';
import {intelligenceStableUuid} from '@/lib/intelligence/service';
import {oauthToolMeta} from './contracts';
import type {McpPrincipal} from './auth';

const baseModel=plantSchema.parse(plan);
const scopeIdSchema=z.string().uuid().describe('An assigned MineralX facility workspace ID returned by mineralx_context.');
const dataEnvelopeSchema=z.object({data:z.unknown()});

function result(data:unknown){return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{data}};}
function toolFailure(error:unknown){
 const known=error instanceof OpsError?error:error&&typeof error==='object'&&('code' in error||'message' in error)
  ?classifyDatabaseError(error as {code?:string;message?:string})
  :new OpsError('unavailable','MineralX could not complete this plant-design request.');
 return {isError:true,content:[{type:'text' as const,text:`${known.code}: ${known.message}`}],structuredContent:{data:{error:{code:known.code,message:known.message}}}};
}
function assignedFacility(principal:McpPrincipal,scopeId:string,permission:string):Scope{
 const scope=principal.context.scopes.find(candidate=>candidate.id===scopeId);
 if(!scope||scope.kind!=='facility'||!scope.permissions.includes(permission))throw new OpsError('forbidden','Select an assigned processing facility with the required plant permission.');
 return scope;
}
async function rpc(principal:McpPrincipal,name:string,args:Record<string,unknown>){const {data,error}=await principal.db.rpc(name,args);if(error)throw classifyDatabaseError(error);return data;}
function publicOrigin(){return (process.env.MINERALX_PUBLIC_ORIGIN||'https://mineral-x.com.au').replace(/\/$/,'');}
function previewUrl(scopeId:string,changesetId:string){
 const query=new URLSearchParams({scope:scopeId,view:'engineering',surface:'cad',changeset:changesetId});
 return `${publicOrigin()}/ops/plant?${query.toString()}`;
}
function instantPreviewUrl(scopeId:string,operations:unknown){
 const draft=JSON.stringify(operations);
 if(draft.length>7000)throw new OpsError('validation','This instant preview is too large for a safe browser fragment. Store it as a governed design proposal instead.');
 const query=new URLSearchParams({scope:scopeId,view:'engineering',surface:'cad'});
 const fragment=new URLSearchParams({draft});
 // Unsaved geometry stays after # so it is never sent to MineralX/Vercel in the HTTP request URL.
 return `${publicOrigin()}/ops/plant?${query.toString()}#${fragment.toString()}`;
}
function validateBasis(baseRevision:string,baseFingerprint:string){
 const currentFingerprint=plantModelFingerprint(baseModel);
 if(baseRevision!==baseModel.revision||baseFingerprint!==currentFingerprint)throw new OpsError('conflict','The plant basis changed. Read get_mineralx_plant_model again before proposing geometry.');
 return currentFingerprint;
}

export function registerPlantMcpTools(server:McpServer,principal:McpPrincipal){
 server.registerTool('get_mineralx_plant_model',{
  title:'Get MineralX processing plant model',
  description:'Read the current semantic P5 processing-plant model for design work: yard coordinates, stable equipment IDs, planning envelopes, deterministic 3D render archetypes, stored engineering parameters, process routes, design holds and a concurrency fingerprint. Read this before proposing geometry changes.',
  inputSchema:z.object({scopeId:scopeIdSchema}).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:oauthToolMeta(),
 },async({scopeId})=>{try{assignedFacility(principal,scopeId,'plant.read');return result({...compactPlantModel(baseModel),designBoundary:'Coordinates and P5 footprints are the current concept basis. Parametric equipment geometry is explicit about whether it is inferred, specified, vendor-referenced or as-built. A design proposal never operates physical equipment and never becomes as-built geometry merely because ChatGPT created it.'});}catch(error){return toolFailure(error);}});

 server.registerTool('preview_mineralx_plant_design',{
  title:'Preview a MineralX plant design',
  description:'Create an immediate unsaved 3D Engineering preview from typed plant geometry operations. Use this while iterating conversationally like code: move equipment, resize envelopes, reroute streams, add equipment or configure a parametric equipment archetype/height/orientation/dimensions. Mark expert-reasoned geometry as inferred unless verified source evidence supports a stronger model status. It validates geometry and returns a MineralX Engineering URL, writes nothing to the database and never controls physical plant.',
  inputSchema:z.object({
   scopeId:scopeIdSchema,
   baseRevision:z.string().trim().min(1).max(200),
   baseFingerprint:z.string().trim().min(4).max(200),
   operations:plantDesignOperationsSchema.max(12),
  }).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:oauthToolMeta(),
 },async({scopeId,baseRevision,baseFingerprint,operations})=>{
  try{
   assignedFacility(principal,scopeId,'plant.read');validateBasis(baseRevision,baseFingerprint);
   const applied=applyPlantDesignOperations(baseModel,operations);
   if(!applied.validation.ok)return result({previewCreated:false,validation:applied.validation,message:'The proposed geometry is blocked. Revise the move, envelope, equipment parameters or route before opening a preview.'});
   return result({previewCreated:true,previewUrl:instantPreviewUrl(scopeId,applied.operations),validation:applied.validation,affected:{equipment:applied.validation.affectedEquipment,streams:applied.validation.affectedStreams},saved:false});
  }catch(error){return toolFailure(error);}
 });

 server.registerTool('list_mineralx_plant_designs',{
  title:'List MineralX plant design proposals',
  description:'List recent ChatGPT or staff plant-layout proposals for one authorised processing facility. Proposals are non-operational engineering changesets.',
  inputSchema:z.object({scopeId:scopeIdSchema,limit:z.number().int().min(1).max(50).default(20)}).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:oauthToolMeta(),
 },async({scopeId,limit})=>{try{assignedFacility(principal,scopeId,'plant.read');return result(await rpc(principal,'mx_ops_plant_design_list',{p_scope:scopeId,p_limit:limit}));}catch(error){return toolFailure(error);}});

 server.registerTool('get_mineralx_plant_design',{
  title:'Get a MineralX plant design proposal',
  description:'Read one versioned plant-design changeset, including its operations, validation evidence and 3D Engineering preview URL.',
  inputSchema:z.object({scopeId:scopeIdSchema,changesetId:z.string().uuid()}).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:oauthToolMeta(),
 },async({scopeId,changesetId})=>{try{assignedFacility(principal,scopeId,'plant.read');const record=await rpc(principal,'mx_ops_plant_design_read',{p_scope:scopeId,p_id:changesetId});return result({record,previewUrl:previewUrl(scopeId,changesetId)});}catch(error){return toolFailure(error);}});

 server.registerTool('propose_mineralx_plant_design',{
  title:'Propose a MineralX plant design change',
  description:'Create a governed, durable and previewable Engineering changeset. Use exact stable equipment/stream IDs from get_mineralx_plant_model. Supports moving/resizing existing equipment, parametrically configuring realistic equipment assemblies, rerouting process streams and adding concept equipment. Expert-reasoned geometry must remain status=inferred until verified source evidence justifies specified, vendor_reference or as_built. This creates a proposal only: it does not publish an as-built revision, change operational records or control physical plant.',
  inputSchema:z.object({
   scopeId:scopeIdSchema,
   idempotencyKey:z.string().trim().min(8).max(200).describe('Stable key for this logical design proposal. Reuse exactly when retrying.'),
   baseRevision:z.string().trim().min(1).max(200).describe('Exact revision returned by get_mineralx_plant_model.'),
   baseFingerprint:z.string().trim().min(4).max(200).describe('Exact fingerprint returned by get_mineralx_plant_model.'),
   title:z.string().trim().min(3).max(240),
   rationale:z.string().trim().min(3).max(4000).describe('Engineering purpose, assumptions and requested outcome. Do not invent measured or OEM dimensions; record expert-reasoned geometry as inferred.'),
   operations:plantDesignOperationsSchema,
  }).strict(),outputSchema:dataEnvelopeSchema,
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:oauthToolMeta(),
 },async({scopeId,idempotencyKey,baseRevision,baseFingerprint,title,rationale,operations})=>{
  try{
   assignedFacility(principal,scopeId,'plant.capture');
   const currentFingerprint=validateBasis(baseRevision,baseFingerprint),applied=applyPlantDesignOperations(baseModel,operations);
   if(!applied.validation.ok)return result({proposalCreated:false,baseRevision,baseFingerprint,currentFingerprint,validation:applied.validation,message:'The geometry proposal was not stored because deterministic spatial validation found blocking issues. Revise the operations and retry.'});
   const identity=`${principal.authInfo.clientId}:${principal.user.id}:${scopeId}:${idempotencyKey}`;
   const changesetId=intelligenceStableUuid('mineralx-plant-design',identity),requestId=intelligenceStableUuid('mineralx-plant-design-request',identity);
   const record=await rpc(principal,'mx_ops_plant_design_create',{
    p_scope:scopeId,p_request:requestId,p_id:changesetId,p_base_revision:baseRevision,p_base_fingerprint:baseFingerprint,
    p_title:title,p_rationale:rationale,p_operations:applied.operations,p_validation:applied.validation,
   });
   return result({proposalCreated:true,record,previewUrl:previewUrl(scopeId,changesetId),validation:applied.validation,next:'Open the preview in Engineering. A separate human review/publish action is required before any proposal can become an authoritative engineering revision.'});
  }catch(error){return toolFailure(error);}
 });
}
