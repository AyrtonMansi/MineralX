import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcuts, developmentNavigationGroups, navigationGroups, scopeForOperationsPath, scopeLabel, scopeSwitchDestination, supportsOperationsPath } from '../../lib/ops/suite-navigation';
import type { Scope } from '../../lib/ops/contracts';

const project: Scope = { id: 'project-1', org_id: 'org-1', name: 'North project', code: 'NORTH', kind: 'project', timezone: 'Australia/Brisbane', permissions: ['geo.read', 'work.read'], version: 1, policy: {} };
const facility: Scope = { id: 'facility-1', org_id: 'org-1', name: 'Central plant', code: 'CENTRAL', kind: 'facility', timezone: 'Australia/Brisbane', permissions: ['plant.read', 'gold.read', 'work.read'], version: 1, policy: {} };

test('navigation only shows record surfaces compatible with the active workspace', () => {
  const projectItems = navigationGroups(project).flatMap((group) => group.items);
  const projectLabels = projectItems.map((item) => item.label);
  const facilityLabels = navigationGroups(facility).flatMap((group) => group.items.map((item) => item.label));
  assert.ok(projectLabels.includes('Geology Globe'));
  assert.ok(projectLabels.includes('Exploration'));
  assert.equal(projectItems.find((item) => item.label === 'Geology Globe')?.href, '/mineralx');
  assert.equal(projectLabels.indexOf('Exploration'), projectLabels.indexOf('Geology Globe') + 1);
  assert.ok(projectLabels.includes('Pits & stockpiles'));
  assert.ok(!projectLabels.includes('Plant'));
  assert.ok(!projectLabels.includes('Gold'));
  assert.ok(facilityLabels.includes('Plant'));
  assert.ok(facilityLabels.includes('Gold'));
  assert.ok(!facilityLabels.includes('Geology Globe'));
  assert.ok(!facilityLabels.includes('Exploration'));
});

test('development presents one minimal workspace while keeping geology and processing records separated internally', () => {
  const groups = developmentNavigationGroups([project, facility]);
  const labels = groups.flatMap((group) => group.items.map((item) => item.label));

  assert.deepEqual(groups.map((group) => group.label), ['Workspace', 'Operations']);
  assert.deepEqual(labels, ['Home', 'Work', 'Geology Globe', 'Exploration', 'Pits & stockpiles', 'Processing', 'Gold']);
  assert.equal(groups[1].items.find((item) => item.label === 'Geology Globe')?.href, '/mineralx');
  assert.equal(labels.indexOf('Exploration'), labels.indexOf('Geology Globe') + 1);
  for (const removed of ['Programs', 'Reports', 'Field preparation', 'People & workload', 'Files & procedures', 'Development settings', 'Legacy processing register', 'Local geology workspace', 'Plant layout reference']) {
    assert.equal(labels.includes(removed), false, `${removed} must not return as a device-workspace entry point`);
  }
  assert.equal(scopeLabel(project, true), 'Development workspace');
  assert.equal(scopeLabel(facility, true), 'Development workspace');
  assert.equal(scopeLabel(project), 'North project');
  assert.deepEqual(navigationGroups(project, { development: true, scopes: [project, facility] }), groups);
});

test('development route selection opens compatible records without exposing a workspace selector', () => {
  const scopes = [facility, project];
  assert.equal(scopeForOperationsPath(scopes, '/ops/geology', facility.id)?.id, project.id);
  assert.equal(scopeForOperationsPath(scopes, '/ops/pit', facility.id)?.id, project.id);
  assert.equal(scopeForOperationsPath(scopes, '/ops/plant', project.id)?.id, facility.id);
  assert.equal(scopeForOperationsPath(scopes, '/ops/gold', project.id)?.id, facility.id);
  assert.equal(scopeForOperationsPath(scopes, '/ops/work', project.id)?.id, project.id);
  assert.equal(scopeForOperationsPath(scopes, '/ops/work', facility.id)?.id, facility.id);
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
  assert.equal(supportsOperationsPath(readOnlyProject, '/ops/pit'), false);
  assert.equal(scopeSwitchDestination('/ops/gold', 'scope=facility-1&view=lots&item=lot-1', readOnlyFacility), '/ops?scope=facility-2');
  assert.equal(scopeSwitchDestination('/ops/geology', 'scope=project-1&view=samples&item=sample-1', readOnlyProject), '/ops?scope=project-2');
});

test('Create menu only surfaces task and program planning actions', () => {
  const projectWithReadOnlyGeology = { ...project, permissions: ['geo.read', 'work.read', 'work.write'] };
  const projectWithCaptureOnlyGeology = { ...project, permissions: ['geo.capture', 'work.read', 'work.write'] };
  const projectWithGeologyCapture = { ...project, permissions: ['geo.read', 'geo.capture', 'work.read', 'work.write'] };
  const facilityWithPlantOnly = { ...facility, permissions: ['plant.read', 'plant.capture', 'gold.read', 'work.read', 'work.write'] };
  const facilityWithGoldCaptureOnly = { ...facility, permissions: ['plant.read', 'plant.capture', 'gold.capture', 'work.read', 'work.write'] };
  const facilityWithBothCaptureFlows = { ...facility, permissions: ['plant.read', 'plant.capture', 'gold.read', 'gold.capture', 'work.read', 'work.write'] };
  const readOnly = { ...project, permissions: ['work.read'] };

  for (const planningScope of [projectWithReadOnlyGeology, projectWithCaptureOnlyGeology, projectWithGeologyCapture, facilityWithPlantOnly, facilityWithGoldCaptureOnly, facilityWithBothCaptureFlows]) {
    assert.deepEqual(createShortcuts(planningScope).map((item) => item.label), ['Task', 'Work program']);
  }
  assert.deepEqual(createShortcuts(readOnly), []);
});
