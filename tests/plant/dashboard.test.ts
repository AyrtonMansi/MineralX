import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { PlantDashboard } from "../../components/plant/PlantDashboard";
import { plantSchema } from "../../lib/plant/model";
const pts = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
];
const model = plantSchema.parse({
  revision: "TEST",
  title: "Synthetic test plan",
  subtitle: "Test",
  status: "Concept",
  width: 20,
  height: 20,
  translation_from_P1_m: [0, 0],
  yard_centre_WGS84: [140, -20],
  roads: [],
  zones: [],
  lease: pts,
  yard_geographic: pts,
  source_links: [],
  holds: [],
  equipment: [
    {
      id: "TEST-A",
      name: "Test pump",
      x: 3,
      y: 3,
      w: 2,
      h: 2,
      group: "wet",
      basis: "Test",
      note: "Synthetic",
      symbol: [{ points: pts, fill: true }],
      geographic: pts,
      label: ["Test pump", 4, 6],
    },
  ],
  streams: [
    {
      id: "TEST-L",
      source: "TEST-A",
      target: "TEST-OUTLET",
      kind: "wet",
      points: pts,
      geographic: pts,
      note: "Test",
      route_type: "slurry",
      horizontal_route_m: 3,
    },
  ],
  traces: [
    {
      id: "test",
      name: "Test circuit",
      description: "Synthetic routing",
      streams: ["TEST-L"],
    },
  ],
});
test("Dashboard interactions select equipment, inspect connections, trace, zoom and locate from register", () => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(React.createElement(PlantDashboard, { model }));
  });
  const button = (label: string) =>
    r.root.findAllByType("button").find((b) => b.children.join("") === label)!;
  act(() =>
    r.root
      .findByProps({ "aria-label": "Test pump, 2 by 2 metres" })
      .props.onClick(),
  );
  assert.ok(
    r.root.findAllByType("h2").some((h) => h.children.includes("Test pump")),
  );
  const connection = r.root
    .findAllByType("button")
    .find((b) =>
      b
        .findAllByType("span")
        .some((s) => s.children.join("").includes("TEST-L")),
    )!;
  act(() => connection.props.onClick());
  assert.ok(
    r.root
      .findAllByType("span")
      .some((s) => s.children.includes("Connection details")),
  );
  act(() => button("Test circuit").props.onClick());
  assert.equal(button("Test circuit").props["aria-pressed"], true);
  assert.ok(
    r.root
      .findAllByType("input")
      .filter((i) => i.props.type === "checkbox")
      .some((i) => i.props.disabled),
  );
  const before = r.root.findByType("svg").props.viewBox;
  act(() => r.root.findByProps({ "aria-label": "Zoom in" }).props.onClick());
  assert.notEqual(r.root.findByType("svg").props.viewBox, before);
  act(() => button("Fit site").props.onClick());
  assert.equal(r.root.findByType("svg").props.viewBox, before);
  act(() => r.root.findByProps({ id: "tab-equipment" }).props.onClick());
  assert.equal(r.root.findAllByType("table").length, 1);
  act(() =>
    r.root.findByProps({ "aria-label": "Locate Test pump" }).props.onClick(),
  );
  assert.equal(
    r.root.findByProps({ id: "tab-plan" }).props["aria-selected"],
    true,
  );
  assert.ok(
    r.root.findAllByType("h2").some((h) => h.children.includes("Test pump")),
  );
  act(() => r.unmount());
});
