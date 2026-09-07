import type {Command,OpsContext,Scope} from './contracts';
export type QueuedCommand={command:Command;state:'queued'|'blocked';error?:string;createdAt:string};
export type FieldPack={version:1;userId:string;scope:Scope;context:OpsContext;preparedAt:string;leaseUntil:string;lastSyncedAt:string|null;geology:any;outbox:QueuedCommand[];drafts:Record<string,unknown>;receipts:Record<string,unknown>};
export type VaultEnvelope={version:1;userId:string;scopeId:string;revision:number;salt:number[];iv:number[];ciphertext:number[];savedAt:string};
const DATABASE='mineralx-operations-vault',STORE='vaults';
export const vaultId=(user:string,scope:string)=>`${user}:${scope}`;
export function acknowledge(pack:FieldPack,requestId:string,result:unknown):FieldPack {
 // Acknowledgement identifies a command, never "everything currently pending".
 return {...pack,lastSyncedAt:new Date().toISOString(),outbox:pack.outbox.filter(x=>x.command.requestId!==requestId),receipts:{...pack.receipts,[requestId]:result}};
}
export function enqueue(pack:FieldPack,command:Command,geology=pack.geology):FieldPack {
 if(command.scopeId!==pack.scope.id)throw new Error('The command belongs to another workspace.');
 const previous=pack.outbox.find(x=>x.command.requestId===command.requestId);
 if(previous){if(JSON.stringify(previous.command)!==JSON.stringify(command))throw new Error('A request ID cannot be reused with different content.');return pack;}
 return {...pack,geology,outbox:[...pack.outbox,{command,state:'queued',createdAt:new Date().toISOString()}]};
}
export async function deriveKey(passphrase:string,salt:Uint8Array):Promise<CryptoKey>{
 if(passphrase.length<12)throw new Error('Use a device passphrase of at least 12 characters. It is not sent to MineralX.');
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptPack(pack:FieldPack,key:CryptoKey,salt:number[],revision:number):Promise<VaultEnvelope>{
 const iv=crypto.getRandomValues(new Uint8Array(12));const additionalData=new TextEncoder().encode(`mx-ops-v1/${pack.userId}/${pack.scope.id}/${revision}`);
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,new TextEncoder().encode(JSON.stringify(pack)));
 return {version:1,userId:pack.userId,scopeId:pack.scope.id,revision,salt,iv:Array.from(iv),ciphertext:Array.from(new Uint8Array(ciphertext)),savedAt:new Date().toISOString()};
}
export async function decryptPack(envelope:VaultEnvelope,passphrase:string,expectedUser?:string){
 if(envelope.version!==1||expectedUser&&expectedUser!==envelope.userId)throw new Error('This device workspace belongs to a different account or format.');
 const key=await deriveKey(passphrase,new Uint8Array(envelope.salt));
 try{const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(envelope.iv),additionalData:new TextEncoder().encode(`mx-ops-v1/${envelope.userId}/${envelope.scopeId}/${envelope.revision}`)},key,new Uint8Array(envelope.ciphertext));
 const pack=JSON.parse(new TextDecoder().decode(bytes)) as FieldPack;
 if(pack.userId!==envelope.userId||pack.scope.id!==envelope.scopeId||pack.version!==1||!Array.isArray(pack.outbox))throw new Error('Invalid workspace');return {key,pack};
 }catch{throw new Error('The passphrase is incorrect or the encrypted recovery file is damaged. Nothing was overwritten.');}
}
async function openVault():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DATABASE,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close another tab that is holding the device database open.'));});}
export async function readVault(user:string,scope:string):Promise<VaultEnvelope|null>{const db=await openVault();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(vaultId(user,scope));let value:VaultEnvelope|null=null;r.onsuccess=()=>{value=r.result||null;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(tx.error||new Error('Device read was interrupted.'));};tx.onerror=()=>{db.close();reject(tx.error);};});}
export async function listVaults():Promise<{userId:string;scopeId:string;savedAt:string}[]>{const db=await openVault();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).getAll();let values:VaultEnvelope[]=[];r.onsuccess=()=>{values=r.result;};tx.oncomplete=()=>{db.close();resolve(values.map(v=>({userId:v.userId,scopeId:v.scopeId,savedAt:v.savedAt})));};tx.onabort=()=>{db.close();reject(tx.error||new Error('Device read was interrupted.'));};tx.onerror=()=>{db.close();reject(tx.error);};});}
export async function writeVault(envelope:VaultEnvelope,expectedRevision:number){const db=await openVault();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(vaultId(envelope.userId,envelope.scopeId));let issue:Error|null=null;
 r.onsuccess=()=>{const old=r.result as VaultEnvelope|undefined;if((old?.revision||0)!==expectedRevision){issue=new Error('Another tab changed this device workspace. Your entry is retained; unlock the latest revision before continuing.');tx.abort();return;}store.put(envelope,vaultId(envelope.userId,envelope.scopeId));};
 tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(issue||tx.error||new Error('Device save was aborted. Keep the draft and retry.'));};tx.onerror=()=>{issue=tx.error;};});}
export async function clearVault(user:string,scope:string,expectedRevision:number){const db=await openVault();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(vaultId(user,scope));let failed=false;r.onsuccess=()=>{if(r.result?.revision!==expectedRevision){failed=true;tx.abort();}else store.delete(vaultId(user,scope));};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(new Error(failed?'Device workspace changed; no data was erased.':'Device removal failed.'));};});}
