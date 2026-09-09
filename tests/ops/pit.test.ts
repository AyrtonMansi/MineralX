import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bounds,deform,exportOBJ,practiceProject,surfaceArea,validateSurface} from '../../lib/ops/pit/model';
import {importScan} from '../../lib/ops/pit/import';
import {projectJSON,restoreProject} from '../../lib/ops/pit/storage';
const encode=(s:string)=>new TextEncoder().encode(s).buffer;
const obj='v 0 0 0\nv 2 0 0\nv 0 0 2\nf 1 3 2\n';
test('LiDAR OBJ preserves source bytes, correct metric scale and original ground through edits',async()=>{
 const p=await importScan(encode(obj),'scan.obj','m','y');const original=p.original.positions.slice();
 assert.equal(new TextDecoder().decode(p.source.bytes),obj);assert.equal(p.source.sha256.length,64);assert.equal(surfaceArea(p.original),2);
 p.edited=deform(p.edited,[-1,0,-1],4,[0,-2,0]);assert.deepEqual(p.original.positions,original);assert.equal(p.edited[1],-2);
 const restored=await restoreProject(projectJSON(p));assert.deepEqual(restored.original,p.original);assert.deepEqual(restored.edited,p.edited);assert.notEqual(restored.id,p.id);assert.equal(restored.version,0);
});
test('centimetre Z-up imports become metre Y-up without changing source bytes',async()=>{
 const p=await importScan(encode('v 0 0 0\nv 200 0 0\nv 0 200 100\nf 1 2 3\n'),'survey.obj','cm','z');
 assert.deepEqual(p.source.origin,[1,.5,-1]);assert.equal(bounds(p.original.positions).span,2);
});
test('shared OBJ vertices are welded across faces so wall movement cannot split seams',async()=>{
 const p=await importScan(encode(obj+'v 2 0 2\nf 2 3 4\n'),'scan.obj','m','y');assert.equal(p.original.positions.length/3,4);assert.equal(p.original.indices.length,6);
});
test('deformation has smooth local falloff and leaves outside geometry untouched',()=>{
 const p=[0,0,0,1,0,0,2,0,0,4,0,0];assert.deepEqual(deform(p,[0,0,0],2,[0,-2,0]),[0,-2,0,1,-1,0,2,0,0,4,0,0]);assert.deepEqual(p,[0,0,0,1,0,0,2,0,0,4,0,0]);
 assert.throws(()=>deform(p,[0,0,0],0,[0,1,0]));assert.throws(()=>deform(p,[0,0,0],2,[NaN,1,0]));
});
test('PLY mesh imports while point-only and oversized PLY fail before allocation',async()=>{
 const header='ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\n';
 const p=await importScan(encode(header+'element face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n'),'scan.ply','m','y');assert.equal(p.original.indices.length,3);
 await assert.rejects(importScan(encode(header+'end_header\n0 0 0\n1 0 0\n0 1 0\n'),'cloud.ply','m','y'),/points only/);
 await assert.rejects(importScan(encode(header.replace('vertex 3','vertex 900000000')+'element face 1\nend_header\n'),'huge.ply','m','y'),/smaller/);
 await assert.rejects(importScan(encode(header+'element face 1\nproperty list int int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n1000000000 0 1 2\n'),'bad-list.ply','m','y'),/triangle or quad/);
});
test('binary PLY mesh and binary STL import real faces',async()=>{
 const header=encode('ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n');
 const bytes=new Uint8Array(header.byteLength+49);bytes.set(new Uint8Array(header));const view=new DataView(bytes.buffer,header.byteLength);[0,0,0,1,0,0,0,1,0].forEach((n,i)=>view.setFloat32(i*4,n,true));view.setUint8(36,3);[0,1,2].forEach((n,i)=>view.setInt32(37+i*4,n,true));
 assert.equal((await importScan(bytes.buffer,'binary.ply','m','y')).original.indices.length,3);
 const stl=new ArrayBuffer(134),sv=new DataView(stl);sv.setUint32(80,1,true);[0,0,0,1,0,0,0,1,0].forEach((n,i)=>sv.setFloat32(96+i*4,n,true));assert.equal((await importScan(stl,'binary.stl','m','y')).original.indices.length,3);
});
test('video, malformed meshes, invalid indices and corrupted backups are rejected',async()=>{
 await assert.rejects(importScan(encode('video'),'scan.mov','m','y'),/Video/);
 await assert.rejects(importScan(encode('v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'),'bad.obj','m','y'),/invalid coordinates/);
 assert.throws(()=>validateSurface({positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,9]}));
 const p=await importScan(encode(obj),'scan.obj','m','y'),raw=JSON.parse(projectJSON(p));raw.source.base64=btoa('corrupt');await assert.rejects(restoreProject(JSON.stringify(raw)),/integrity/);
});
test('edited export is a valid independent mesh and practice geometry stays explicitly synthetic',async()=>{
 const p=practiceProject('stockpile');assert.match(p.name,/synthetic/);assert.equal(p.source.sha256,'');
 const rebuilt=await importScan(encode(exportOBJ(p.original)),'export.obj','m','y');assert.equal(rebuilt.original.indices.length,p.original.indices.length);assert.ok(surfaceArea(rebuilt.original)>0);
});
