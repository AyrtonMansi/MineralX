import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcuts, navigationGroups, scopeSwitchDestination, supportsOperationsPath } from '../../lib/ops/suite-navigation';
import type { Scope } from '../../lib/ops/contracts';

const project: Scope = { id: 'project-1', org_id: 'org-1', name: 'North project', code: 'NORTH', kind: 'project', timezone: 'Australia/Brisbane', permissions: ['geo.read', 'work.read'], version: 1, policy: {} };
const facility: Scope = { id: 'facility-1', org_id: 'org-1', name: 'Central plant', code: 'CENTRAL', kind: 'facility', timezone: 'Australia/Brisbane', permissions: ['plant.read', 'gold.read', 'work.read'], version: 1, policy: {} };

test('navigation only shows record surfaces compatible with the active workspace', () => {
  const projectLabels = navigationGroups(project).flatMap((group) => group.items.map((item) => item.label));
  const facilityLabels = navigationGroups(facility).flatMap((group) => group.items.map((item) => item.label));
  assert.ok(projectLabels.includes('Geology'));
  assert.ok(projectLabels.includes('Pits & stockpiles'));
  assert.ok(!projectLabels.includes('Plant'));
  assert.ok(!projectLabels.includes('Gold'));
  assert.ok(facilityLabels.includes('Plant'));
  assert.ok(facilityLabels.includes('Gold'));
  assert.ok(!facilityLabels.includes('Geology'));
});

test('workspace switching keeps a compatible page but never carries a foreign record or action', () => {
  assert.equal(scopeSwitchDestination('/ops/geology', 'scope=project-1&view=samples&item=sample-1&action=sample', project), '/ops/geology?scope=project-1&view=samples');
  assert.equal(scopeSwitchDestination('/ops/geology', 'scope=project-1&view=samples&item=sample-1', facility), '/ops?scope=facility-1');
  assert.equal(scopeSwitchDestination('/ops/work', 'scope=project-1&view=people&item=task-1&program=program-1', facility), '/ops/work?scope=facility-1&view=people');
});

test('workspace switching falls back to Home when the destination lacks the current route permission', () => {
  const readOnlyFacility = { ...facility, id: 'facility-2', permissions: ['plant.read', 'work.read'] };
  const readOnlyProject = { ...project, id: 'project-2', permissions: ['work.read'] };
  assert.equal(supportsOperationsPath(readOnlyFacility, '/ops/gold'), false);
  assert.equal(supportsOperationsPath(readOnlyProject, '/ops/geology'), false);
  assert.equal(scopeSwitchDestination('/ops/gold', 'scope=facility-1&view=lots&item=lot-1', readOnlyFacility), '/ops?scope=facility-2');
  assert.equal(scopeSwitchDestination('/ops/geology', 'scope=project-1&view=samples&item=sample-1', readOnlyProject), '/ops?scope=project-2');
});

test('Create shortcuts require both the target register read and capture permission', () => {
  const projectWithReadOnlyGeology = { ...project, permissions: ['geo.read', 'work.read', 'work.write'] };
  const projectWithCaptureOnlyGeology = { ...project, permissions: ['geo.capture', 'work.read', 'work.write'] };
  const projectWithGeologyCapture = { ...project, permissions: ['geo.read', 'geo.capture', 'work.read', 'work.write'] };
  const facilityWithPlantOnly = { ...facility, permissions: ['plant.read', 'plant.capture', 'gold.read', 'work.read', 'work.write'] };
  const facilityWithGoldCaptureOnly = { ...facility, permissions: ['plant.read', 'plant.capture', 'gold.capture', 'work.read', 'work.write'] };
  const facilityWithBothCaptureFlows = { ...facility, permissions: ['plant.read', 'plant.capture', 'gold.read', 'gold.capture', 'work.read', 'work.write'] };

  assert.deepEqual(createShortcuts(projectWithReadOnlyGeology).map((item) => item.label), ['Work program / campaign', 'Task / to-do', 'Handover']);
  assert.deepEqual(createShortcuts(projectWithCaptureOnlyGeology).map((item) => item.label), ['Work program / campaign', 'Task / to-do', 'Handover']);
  assert.deepEqual(createShortcuts(projectWithGeologyCapture).map((item) => item.label), ['Work program / campaign', 'Task / to-do', 'Handover', 'Physical sample']);
  assert.deepEqual(createShortcuts(facilityWithPlantOnly).map((item) => item.label), ['Work program / campaign', 'Task / to-do', 'Handover', 'Processing run']);
  assert.deepEqual(createShortcuts(facilityWithGoldCaptureOnly).map((item) => item.label), ['Work program / campaign', 'Task / to-do', 'Handover', 'Processing run']);
  assert.deepEqual(createShortcuts(facilityWithBothCaptureFlows).map((item) => item.label), ['Work program / campaign', 'Task / to-do', 'Handover', 'Processing run', 'Clean-up / gold lot']);
});
