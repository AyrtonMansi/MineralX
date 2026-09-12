import { z } from "zod";
const point = z.tuple([z.number().finite(), z.number().finite()]);
const points = z.array(point).min(2).max(2000);
const label = z.string().max(200);
export const equipmentArchetypeSchema = z.enum([
  'stockpile','hopper','hammer_crusher','vertical_impact_crusher','vibrating_screen','jig','knudsen_bowl','sluice','shaker_table','spiral_concentrator','cyclone','tank','pump','conveyor_drive','generator','solar_array','container','platform','generic',
]);
export const equipmentModelStatusSchema = z.enum(['inferred','specified','vendor_reference','as_built']);
const equipmentEngineeringSchema = z.object({
  archetype: equipmentArchetypeSchema,
  model_status: equipmentModelStatusSchema,
  overall_height_m: z.number().finite().positive().max(60).optional(),
  rotation_deg: z.number().finite().min(-360).max(360).optional(),
  dimensions: z.record(z.string().max(80),z.number().finite().nonnegative().max(2000)).optional(),
  specification: z.array(z.object({
    key: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(300),
    unit: z.string().trim().max(40).optional(),
    basis: z.string().trim().max(240).optional(),
  }).strict()).max(60).optional(),
}).strict();
export const plantSchema = z.object({
  revision: label,
  title: label,
  subtitle: label,
  status: label,
  width: z.number().positive(),
  height: z.number().positive(),
  georeference: z.object({ origin_WGS84: point, metres_per_longitude_degree: z.number(), metres_per_latitude_degree: z.number(), heading_degrees: z.number() }),
  annotations: z.array(z.object({ text: label, x: z.number(), y: z.number(), rotation: z.number() })),
  layout_reasoning: z.array(z.object({ title: label, detail: z.string() })),
  view_presets: z.record(z.string(),z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
  translation_from_P1_m: point,
  yard_centre_WGS84: point,
  equipment: z
    .array(
      z.object({
        id: label,
        name: label,
        x: z.number(),
        y: z.number(),
        w: z.number().positive(),
        h: z.number().positive(),
        group: label,
        basis: label,
        note: z.string().max(3000),
        symbol: z.array(z.object({ points, fill: z.boolean() })),
        label: z.tuple([label, z.number(), z.number()]).optional(),
        geographic: points,
        engineering: equipmentEngineeringSchema.optional(),
      }),
    )
    .max(1000),
  streams: z
    .array(
      z.object({
        id: label,
        source: label,
        target: label,
        kind: label,
        points,
        geographic: points,
        note: z.string().max(3000),
        route_type: label,
        horizontal_route_m: z.number().nonnegative(),
        label: z.tuple([label,z.number(),z.number()]).optional(),
      }),
    )
    .max(3000),
  roads: z.array(points),
  zones: z.array(z.object({ name: label, points })),
  lease: points,
  yard_geographic: points,
  traces: z.array(
    z.object({
      id: label,
      name: label,
      description: z.string().max(2000),
      streams: z.array(label),
    }),
  ),
  holds: z.array(z.object({ title: label, detail: z.string().max(3000) })),
  source_links: z.array(
    z.tuple([
      label,
      z
        .string()
        .url()
        .refine((u) => /^https?:\/\//.test(u)),
    ]),
  ),
});
export type PlantModel = z.infer<typeof plantSchema>;
export type Equipment = PlantModel["equipment"][number];
export type EquipmentArchetype = z.infer<typeof equipmentArchetypeSchema>;
export type EquipmentModelStatus = z.infer<typeof equipmentModelStatusSchema>;
export const palette: Record<string, string> = {
  feed: "#b76a24",
  wet: "#167f89",
  recirc: "#a64aa2",
  con: "#b18a12",
  tail: "#b74950",
  service: "#5075a5",
};
export const groupNames: Record<string, string> = {
  feed: "Feed & crushing",
  wet: "Wet processing",
  recirc: "VSI return",
  con: "Gold recovery",
  tail: "Tailings",
  service: "Utilities",
};
export function pointsText(points: number[][]) {
  return points
    .map((p) => p.map((n) => Number(n.toFixed(4))).join(","))
    .join(" ");
}
export function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (s) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[s]!,
  );
}
export function planKml(model: PlantModel) {
  const coords = (p: number[][]) => p.map((v) => `${v[0]},${v[1]},0`).join(" ");
  const geo = (p:number[]) => [model.georeference.origin_WGS84[0]+p[0]/model.georeference.metres_per_longitude_degree,model.georeference.origin_WGS84[1]+p[1]/model.georeference.metres_per_latitude_degree];
  const polygon = (p:number[][]) => `<Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${coords(p)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  const mark = (name:string,geometry:string,style:string,note='') => `<Placemark><name>${xml(name)}</name><description>${xml(note)}</description><styleUrl>#${style}</styleUrl>${geometry}</Placemark>`;
  const color = (hex:string) => 'ff'+hex.slice(5,7)+hex.slice(3,5)+hex.slice(1,3);
  const styles=Object.entries(palette).map(([id,value])=>`<Style id="${id}"><LineStyle><color>${color(value)}</color><width>2</width></LineStyle><PolyStyle><color>${color(value)}</color></PolyStyle></Style>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(model.title)} — ${xml(model.revision)}</name><description>${xml(model.status)}. One Russell jig, nominal 2 x 2 ft. All footprints are planning allowances unless identified as OEM references. Confirm survey and vendor drawings.</description>${styles}<Style id="boundary"><LineStyle><color>ff0088dd</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Style id="reservation"><LineStyle><color>ff819386</color><width>1</width></LineStyle><PolyStyle><color>339aaf9a</color></PolyStyle></Style><Style id="road"><LineStyle><color>ffadbfb5</color></LineStyle><PolyStyle><color>889cad9f</color></PolyStyle></Style>${mark('Source lease boundary',polygon(model.lease),'boundary')}${mark('Plant yard — 100 × 60 m',polygon(model.yard_geographic),'boundary')}<Folder><name>Solid equipment symbols</name>${model.equipment.map(e=>mark(`${e.name} · ${e.id}`,`<MultiGeometry>${e.symbol.filter(p=>p.fill).map(p=>polygon(p.points.map(geo))).join('')}</MultiGeometry>`,e.group,`${e.w} × ${e.h} m planning envelope. ${e.basis}. ${e.note}`)).join('')}</Folder><Folder><name>Machine envelope checks</name><visibility>0</visibility>${model.equipment.map(e=>mark(e.name,polygon(e.geographic),'reservation',e.note)).join('')}</Folder><Folder><name>Access lanes and service bays</name>${model.roads.map((r,i)=>mark(`Vehicle lane reservation ${i+1}`,polygon(r.map(geo)),'road')).join('')}${model.zones.map(z=>mark(z.name,polygon(z.points.map(geo)),'reservation')).join('')}</Folder><Folder><name>Conveyors and process connections</name>${model.streams.filter(s=>s.route_type!=='water').map(s=>mark(`${s.id} · ${s.source} → ${s.target}`,`<LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${coords(s.geographic)}</coordinates></LineString>`,s.kind,`${s.route_type}. ${s.horizontal_route_m.toFixed(2)} m horizontal route. ${s.note}`)).join('')}</Folder><Folder><name>Process water lines</name><visibility>0</visibility>${model.streams.filter(s=>s.route_type==='water').map(s=>mark(`${s.id} · ${s.source} → ${s.target}`,`<LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${coords(s.geographic)}</coordinates></LineString>`,'service',s.note)).join('')}</Folder></Document></kml>`;
}
