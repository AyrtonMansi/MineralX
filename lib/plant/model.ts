import { z } from "zod";
const point = z.tuple([z.number().finite(), z.number().finite()]);
const points = z.array(point).min(2).max(2000);
const label = z.string().max(200);
export const plantSchema = z.object({
  revision: label,
  title: label,
  subtitle: label,
  status: label,
  width: z.number().positive(),
  height: z.number().positive(),
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
  const polygon = (name: string, p: number[][], style: string, note = "") =>
    `<Placemark><name>${xml(name)}</name><description>${xml(note)}</description><styleUrl>#${style}</styleUrl><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${coords(p)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(model.title)} — ${xml(model.revision)}</name><description>${xml(model.status)}. Footprints are planning envelopes; verify survey and OEM drawings.</description><Style id="boundary"><LineStyle><color>ff0088dd</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Style id="machine"><LineStyle><color>ff897f16</color></LineStyle><PolyStyle><color>bb897f16</color></PolyStyle></Style><Style id="route"><LineStyle><color>ff705030</color><width>2</width></LineStyle></Style>${polygon("Source lease boundary", model.lease, "boundary")}${polygon("Plant yard", model.yard_geographic, "boundary")}<Folder><name>Equipment envelopes</name>${model.equipment.map((e) => polygon(`${e.name} · ${e.id}`, e.geographic, "machine", `${e.w} × ${e.h} m. ${e.basis}. ${e.note}`)).join("")}</Folder><Folder><name>Conveyors and services</name>${model.streams.map((s) => `<Placemark><name>${xml(s.id)} · ${xml(s.source)} → ${xml(s.target)}</name><description>${xml(s.route_type + ". " + s.note)}</description><styleUrl>#route</styleUrl><LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${coords(s.geographic)}</coordinates></LineString></Placemark>`).join("")}</Folder></Document></kml>`;
}
