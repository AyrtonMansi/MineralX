export type Vec3 = [number, number, number];
export type Surface = { positions: number[]; indices: number[] };
export type PitProject = {
  format: 'mineralx-pit'; schema: 1; id: string; version: number; name: string;
  kind: 'pit' | 'stockpile'; createdAt: string; updatedAt: string;
  original: Surface; edited: number[];
  source: { name: string; sha256: string; units: 'm' | 'cm' | 'mm'; up: 'y' | 'z'; origin: Vec3; bytes: ArrayBuffer };
};
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_VERTICES = 180_000;
export const MAX_TRIANGLES = 240_000;

export function validateSurface(surface: Surface) {
  const { positions, indices } = surface;
  if (!Array.isArray(positions) || positions.length < 9 || positions.length % 3 || positions.length > MAX_VERTICES * 3 ||
      positions.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e9)) throw new Error('Invalid or oversized mesh vertices. Export a smaller mesh.');
  if (!Array.isArray(indices) || indices.length < 3 || indices.length % 3 || indices.length > MAX_TRIANGLES * 3 ||
      indices.some(n => !Number.isInteger(n) || n < 0 || n >= positions.length / 3)) throw new Error('A triangulated mesh is required. Export mesh faces, not only a point cloud.');
  const box = bounds(positions);
  if (box.span < 0.00001) throw new Error('The scan has no usable extent.');
}

export function bounds(p: number[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[i+a]); max[a] = Math.max(max[a], p[i+a]); }
  const center = min.map((n, a) => (n + max[a]) / 2) as Vec3;
  return { min, max, center, span: Math.max(...max.map((n, a) => n - min[a])) };
}

/** Displacement uses a smooth spherical influence. Always starts from the gesture snapshot. */
export function deform(positions: number[], center: Vec3, radius: number, delta: Vec3): number[] {
  if (!Number.isFinite(radius) || radius <= 0 || !delta.every(Number.isFinite) || !center.every(Number.isFinite)) throw new Error('Enter a positive radius and finite movement.');
  const result = positions.slice();
  for (let i = 0; i < result.length; i += 3) {
    const distance = Math.hypot(positions[i]-center[0], positions[i+1]-center[1], positions[i+2]-center[2]);
    const t = Math.max(0, 1 - distance / radius), weight = t * t * (3 - 2 * t);
    for (let a = 0; a < 3; a++) result[i+a] += delta[a] * weight;
  }
  return result;
}

export function changeSummary(original: number[], edited: number[]) {
  let moved = 0, max = 0;
  for (let i = 0; i < original.length; i += 3) {
    const d = Math.hypot(edited[i]-original[i], edited[i+1]-original[i+1], edited[i+2]-original[i+2]);
    if (d > 1e-6) moved++;
    max = Math.max(max, d);
  }
  return { moved, max };
}

export function surfaceArea(surface: Surface) {
  let sum = 0; const p = surface.positions;
  for (let i = 0; i < surface.indices.length; i += 3) {
    const a = surface.indices[i]*3, b = surface.indices[i+1]*3, c = surface.indices[i+2]*3;
    const u = [p[b]-p[a], p[b+1]-p[a+1], p[b+2]-p[a+2]], v = [p[c]-p[a], p[c+1]-p[a+1], p[c+2]-p[a+2]];
    sum += Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])/2;
  }
  return sum;
}

export function exportOBJ(surface: Surface) {
  validateSurface(surface);
  const lines = ['# MineralX planning surface. Local metres; Y up. Not a survey approval.'];
  for (let i = 0; i < surface.positions.length; i += 3) lines.push(`v ${surface.positions.slice(i, i+3).map(n => n.toFixed(6)).join(' ')}`);
  for (let i = 0; i < surface.indices.length; i += 3) lines.push(`f ${surface.indices.slice(i, i+3).map(n => n+1).join(' ')}`);
  return lines.join('\n');
}

/** Deliberately synthetic geometry, created only after the user chooses the practice surface. */
export function practiceProject(kind: PitProject['kind']): PitProject {
  const positions: number[] = [], indices: number[] = [], n = 40;
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const px = x-n/2, pz = z-n/2, r = Math.hypot(px/1.15, pz);
    const y = kind === 'pit' ? -Math.max(0, Math.min(7, (14-r)*0.8)) : Math.max(0, 9-r*0.8);
    positions.push(px, y, pz);
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { const a=z*(n+1)+x; indices.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2); }
  return {format:'mineralx-pit',schema:1,id:crypto.randomUUID(),version:0,name:`Practice ${kind} — synthetic`,kind,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),original:{positions,indices},edited:positions.slice(),source:{name:'synthetic-practice.obj',sha256:'',units:'m',up:'y',origin:[0,0,0],bytes:new TextEncoder().encode(exportOBJ({positions,indices})).buffer}};
}
