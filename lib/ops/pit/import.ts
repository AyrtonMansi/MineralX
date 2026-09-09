import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { BufferGeometry, Mesh } from 'three';
import { bounds, MAX_FILE_BYTES, MAX_TRIANGLES, MAX_VERTICES, validateSurface, type PitProject, type Surface, type Vec3 } from './model';

export async function importScan(bytes: ArrayBuffer, name: string, units: PitProject['source']['units'], up: PitProject['source']['up']): Promise<PitProject> {
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error('Choose a non-empty mesh smaller than 25 MB.');
  const extension = name.split('.').pop()?.toLowerCase(), geometries: BufferGeometry[] = [];
  try {
    if (extension === 'obj') {
      const text = new TextDecoder().decode(bytes);
      let faceTriangles=0;
      for(const line of text.split('\n'))if(/^f\s/.test(line))faceTriangles+=Math.max(0,line.trim().split(/\s+/).length-3);
      if ((text.match(/^v\s/gm)?.length || 0) > MAX_VERTICES || faceTriangles > MAX_TRIANGLES) throw new Error('Export a decimated mesh with fewer than 180,000 vertices and 240,000 triangles.');
      const object = new OBJLoader().parse(text);
      object.traverse(child => { if (child instanceof Mesh) geometries.push(child.geometry); });
      object.traverse(child => { if (child instanceof Mesh) (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => m.dispose()); });
    } else if (extension === 'ply') {
      const header=new TextDecoder().decode(bytes.slice(0,65536));
      if(!header.includes('end_header'))throw new Error('Invalid PLY header.');
      const vertexCount=Number(header.match(/element vertex (\d+)/)?.[1]),faceCount=Number(header.match(/element face (\d+)/)?.[1]);
      if(!vertexCount||!faceCount)throw new Error('This PLY contains points only. Export a triangulated mesh from the scanning app.');
      if(vertexCount>MAX_VERTICES||faceCount>MAX_TRIANGLES)throw new Error('Export a smaller PLY mesh.');
      geometries.push(new PLYLoader().parse(bytes));
    } else if (extension === 'stl') {
      const binaryCount=bytes.byteLength>=84?new DataView(bytes).getUint32(80,true):0;
      if(bytes.byteLength===84+binaryCount*50){if(binaryCount>MAX_TRIANGLES)throw new Error('Export a smaller STL mesh.');}
      else {const text=new TextDecoder().decode(bytes);if(!/^\s*solid\b/i.test(text)||(text.match(/facet\s+normal/g)?.length||0)>MAX_TRIANGLES)throw new Error('Invalid or oversized STL mesh.');}
      geometries.push(new STLLoader().parse(bytes));
    }
    else throw new Error('Import an OBJ, PLY or STL mesh. Video, photos, USDZ and point clouds must first be reconstructed/exported as a triangulated mesh in your scanning app.');
    const surface: Surface = {positions:[],indices:[]}, vertices = new Map<string,number>();
    let triangles = 0;
    const factor = units === 'mm' ? 0.001 : units === 'cm' ? 0.01 : 1;
    for (const geometry of geometries) {
      const p = geometry.getAttribute('position'); if (!p) continue;
      const indices = geometry.getIndex();
      if (extension === 'ply' && !indices) throw new Error('This PLY contains points only. Export a triangulated mesh from the scanning app.');
      const count = indices ? indices.count : p.count;
      triangles += count/3;
      if (count % 3 || triangles > MAX_TRIANGLES) throw new Error('Export a smaller mesh with at most 240,000 triangles.');
      for (let i = 0; i < count; i++) {
        const at = indices ? indices.getX(i) : i;
        const x = p.getX(at)*factor, y = p.getY(at)*factor, z = p.getZ(at)*factor;
        const point = up === 'z' ? [x,z,-y] : [x,y,z];
        if (!point.every(n => Number.isFinite(n) && Math.abs(n) <= 1e9)) throw new Error('The mesh contains invalid coordinates.');
        // Weld identical positions so shared walls remain connected when dragged.
        const key = point.join(','); let index = vertices.get(key);
        if (index === undefined) { index = surface.positions.length/3; vertices.set(key,index); surface.positions.push(...point); }
        if (vertices.size > MAX_VERTICES) throw new Error('Export a smaller mesh with at most 180,000 vertices.');
        surface.indices.push(index);
      }
    }
    validateSurface(surface);
    const origin = bounds(surface.positions).center;
    surface.positions = surface.positions.map((n,i) => n-origin[i%3]);
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const sha256 = Array.from(new Uint8Array(digest),n => n.toString(16).padStart(2,'0')).join('');
    return {format:'mineralx-pit',schema:1,id:crypto.randomUUID(),version:0,name:name.replace(/\.[^.]+$/,''),kind:'pit',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),original:surface,edited:surface.positions.slice(),source:{name,sha256,units,up,origin:origin as Vec3,bytes}};
  } finally { geometries.forEach(g => g.dispose()); }
}
