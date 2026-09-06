import test from "node:test";
import assert from "node:assert/strict";
import { xml, planKml, type PlantModel } from "../../lib/plant/model";
test("KML escapes document, equipment and route text without changing coordinates", () => {
  const p: [[number, number], [number, number], [number, number]] = [
    [140, -20],
    [140.001, -20],
    [140, -20],
  ];
  const m = {
    georeference:{origin_WGS84:[140,-20],metres_per_longitude_degree:100000,metres_per_latitude_degree:110000,heading_degrees:0},
    width:20,height:20,roads:[],zones:[],
    title: "Test <plan>",
    revision: "R&1",
    status: "Concept",
    lease: p,
    yard_geographic: p,
    equipment: [
      {
        group:"wet",symbol:[{points:[[0,0],[1,0],[1,1],[0,0]],fill:true}],
        name: "Pump <one>",
        id: "A&B",
        w: 2,
        h: 1,
        basis: "Allowance",
        note: 'Check "size"',
        geographic: p,
      },
    ],
    streams: [
      {
        kind:"wet",horizontal_route_m:3,
        id: "Line & 1",
        source: "A&B",
        target: "C",
        route_type: "slurry",
        note: "Check > duty",
        geographic: p,
      },
    ],
  } as unknown as PlantModel;
  const k = planKml(m);
  assert.ok(k.includes("Test &lt;plan&gt;"));
  assert.ok(k.includes("140.001,-20,0"));
  assert.ok(k.includes("Pump &lt;one&gt;"));
  assert.ok(!k.includes("<one>"));
  assert.ok(k.includes("Line &amp; 1"));
  assert.equal(xml("\"'&<>"), "&quot;&apos;&amp;&lt;&gt;");
});
