import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { BufferGeometry, Mesh } from 'three';
import { bounds, MAX_FILE_BYTES, MAX_TRIANGLES, MAX_VERTICES, validateSurface, type PitProject, type Surface, type Vec3 } from './model';

// Check variable-length PLY records before the loader can allocate from untrusted list counts.
function preflightPLY(bytes:ArrayBuffer){
  const prefix=new TextDecoder().decode(bytes.slice(0,65536));
  const end=prefix.indexOf('end_header');if(end<0)throw new Error('Invalid PLY header.');
  const header=prefix.slice(0,end),format=header.match(/format (\S+) 1\.0/)?.[1];
  if(!['ascii','binary_little_endian','binary_big_endian'].includes(format||''))throw new Error('Unsupported PLY encoding.');
  const types:Record<string,[number,string]>={char:[1,'getInt8'],int8:[1,'getInt8'],uchar:[1,'getUint8'],uint8:[1,'getUint8'],short:[2,'getInt16'],int16:[2,'getInt16'],ushort:[2,'getUint16'],uint16:[2,'getUint16'],int:[4,'getInt32'],int32:[4,'getInt32'],uint:[4,'getUint32'],uint32:[4,'getUint32'],float:[4,'getFloat32'],float32:[4,'getFloat32'],double:[8,'getFloat64'],float64:[8,'getFloat64']};
  type Element={name:string;count:number;properties:{type:string;listType?:string;name:string}[]};
  const elements:Element[]=[];
  for(const line of header.split(/\r?\n/)){const parts=line.trim().split(/\s+/);
    if(parts[0]==='element'){const count=Number(parts[2]);if(!['vertex','face'].includes(parts[1])||!Number.isSafeInteger(count)||count<0||count>(parts[1]==='vertex'?MAX_VERTICES:MAX_TRIANGLES))throw new Error('Export a smaller mesh-only PLY with vertex and face elements.');elements.push({name:parts[1],count,properties:[]});}
    if(parts[0]==='property'){const element=elements[elements.length-1];if(!element)throw new Error('Invalid PLY property.');const list=parts[1]==='list',type=parts[list?3:1],listType=list?parts[2]:undefined,name=parts[list?4:2];if(!types[type]||listType&&!types[listType]||!name)throw new Error('Unsupported PLY property.');element.properties.push({type,listType,name});}
  }
  if(elements.filter(e=>e.name==='vertex').length!==1||elements.filter(e=>e.name==='face').length!==1||!elements.find(e=>e.name==='face')?.count)throw new Error('This PLY contains points only. Export a triangulated mesh from the scanning app.');
  const raw=new Uint8Array(bytes);let offset=new TextEncoder().encode(prefix.slice(0,end+10)).length;
  if(raw[offset]===13)offset++;if(raw[offset]===10)offset++;else throw new Error('Invalid PLY header terminator.');
  const tokens=format==='ascii'?new TextDecoder().decode(bytes.slice(offset)).trim().split(/\s+/):null;
  const view=new DataView(bytes);let token=0;
  const read=(type:string)=>{const [size,method]=types[type];if(tokens){const value=Number(tokens[token++]);if(!Number.isFinite(value))throw new Error('Incomplete or invalid PLY data.');return value;}if(offset+size>bytes.byteLength)throw new Error('Incomplete PLY data.');const value=(view[method as keyof DataView] as Function).call(view,offset,format==='binary_little_endian') as number;offset+=size;if(!Number.isFinite(value))throw new Error('Invalid PLY numeric data.');return value;};
  let triangles=0;const vertexCount=elements.find(e=>e.name==='vertex')!.count;
  for(const element of elements)for(let i=0;i<element.count;i++)for(const property of element.properties){
    if(property.listType){const count=read(property.listType);if(element.name!=='face'||!['vertex_indices','vertex_index'].includes(property.name)||!Number.isInteger(count)||count<3||count>4)throw new Error('Export a triangulated PLY mesh with triangle or quad faces.');triangles+=count-2;if(triangles>MAX_TRIANGLES)throw new Error('Export a smaller PLY mesh.');for(let j=0;j<count;j++){const index=read(property.type);if(!Number.isInteger(index)||index<0||index>=vertexCount)throw new Error('Invalid PLY face index.');}}
    else read(property.type);
  }
}

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
      preflightPLY(bytes);
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
