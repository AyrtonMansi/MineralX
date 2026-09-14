import {OpsError, type Scope} from './contracts';

export const REPORTING_SCHEMA = 1;

export const REPORT_IDS = [
  'RPT-01', 'RPT-02', 'RPT-03', 'RPT-04', 'RPT-05', 'RPT-06', 'RPT-07',
  'RPT-08', 'RPT-09', 'RPT-10', 'RPT-11', 'RPT-12', 'RPT-13', 'RPT-14',
] as const;
export type ReportId = typeof REPORT_IDS[number];
export type ReportAvailability = 'ready' | 'partial' | 'blocked';

export type ReportMetricDefinition = {
  id: string;
  label: string;
  unit: string;
};

export type ReportDefinition = {
  id: ReportId;
  version: number;
  name: string;
  category: 'technical' | 'compliance' | 'operations' | 'esg' | 'assurance';
  obligation: 'mandatory' | 'conditional' | 'recommended';
  audience: string;
  cadence: string;
  summary: string;
  requiredPermissions: string[];
  sourceRegisters: string[];
  metrics: ReportMetricDefinition[];
  availability: ReportAvailability;
  blockers: string[];
};

const measured = (id: string, label: string, unit = 'value'): ReportMetricDefinition => ({id, label, unit});

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'RPT-01', version: 1, name: 'JORC Resource & Reserve Statement', category: 'technical', obligation: 'conditional',
    audience: 'Board, investors, competent persons and regulators', cadence: 'On estimate change and annual review',
    summary: 'Governed public technical statement for Mineral Resources and Ore Reserves.',
    requiredPermissions: ['report.read', 'geo.read'], sourceRegisters: ['resource_estimates', 'reserve_estimates', 'competent_persons'],
    metrics: [measured('resource_tonnes', 'Mineral Resource tonnes', 't'), measured('resource_grade', 'Mineral Resource grade', 'grade'), measured('reserve_tonnes', 'Ore Reserve tonnes', 't')],
    availability: 'blocked', blockers: ['Resource, reserve, modifying-factor and competent-person registers are not configured.'],
  },
  {
    id: 'RPT-02', version: 1, name: 'Exploration Results & Technical Update', category: 'technical', obligation: 'conditional',
    audience: 'Board, investors, competent persons and regulators', cadence: 'On material result and quarterly review',
    summary: 'Exploration activity, results, interpretation and next-work programme with source-linked evidence.',
    requiredPermissions: ['report.read', 'geo.read'], sourceRegisters: ['programs', 'samples', 'assayBatches', 'interpretations'],
    metrics: [measured('programs', 'Exploration programmes', 'count'), measured('samples', 'Samples collected', 'count'), measured('assays', 'Accepted assay batches', 'count')],
    availability: 'blocked', blockers: ['Interpretation, significant-result review and disclosure controls are not configured as first-class registers.'],
  },
  {
    id: 'RPT-03', version: 1, name: 'Tenement / Licence Compliance Report', category: 'compliance', obligation: 'mandatory',
    audience: 'Tenement manager, regulators and board', cadence: 'Monthly and before each statutory lodgement',
    summary: 'Tenure status, conditions, expenditure, work commitments, lodgements and upcoming expiry dates.',
    requiredPermissions: ['report.read'], sourceRegisters: ['tenements', 'conditions', 'work_commitments', 'lodgements'],
    metrics: [measured('active_tenements', 'Active tenements', 'count'), measured('conditions_due', 'Conditions due', 'count'), measured('lodgements_due', 'Lodgements due', 'count')],
    availability: 'blocked', blockers: ['Tenement, condition, commitment and statutory-lodgement registers are not configured.'],
  },
  {
    id: 'RPT-04', version: 1, name: 'Exploration QA/QC & Assay Integrity Report', category: 'technical', obligation: 'mandatory',
    audience: 'Exploration manager, laboratory reviewer, competent person and auditor', cadence: 'Per assay batch and quarterly roll-up',
    summary: 'Chain of custody, blanks, standards, duplicates, failures, holds and assay release decisions.',
    requiredPermissions: ['report.read', 'geo.read'], sourceRegisters: ['samples', 'dispatches', 'assayBatches', 'qa_qc_controls'],
    metrics: [measured('samples', 'Samples in scope', 'count'), measured('holes', 'Drillholes in scope', 'count'), measured('receipt_exceptions', 'Receipt exceptions', 'count'), measured('qa_qc_failures', 'QA/QC failures', 'count')],
    availability: 'partial', blockers: ['QA/QC control results and laboratory failure dispositions are not yet configured; only exploration register completeness is available.'],
  },
  {
    id: 'RPT-05', version: 1, name: 'Annual Environment & Rehabilitation Report', category: 'compliance', obligation: 'mandatory',
    audience: 'Environment lead, regulators, board and communities', cadence: 'Annual and approval milestone',
    summary: 'Approval conditions, environmental monitoring, rehabilitation progress, incidents and commitments.',
    requiredPermissions: ['report.read'], sourceRegisters: ['approvals', 'environmental_monitoring', 'rehabilitation', 'incidents'],
    metrics: [measured('approval_conditions', 'Approval conditions', 'count'), measured('monitoring_points', 'Monitoring points', 'count'), measured('rehabilitated_area', 'Rehabilitated area', 'ha')],
    availability: 'blocked', blockers: ['EPBC/state approval, monitoring, rehabilitation and environmental incident registers are not configured.'],
  },
  {
    id: 'RPT-06', version: 1, name: 'Water, Waste, Biodiversity & Closure Report', category: 'esg', obligation: 'conditional',
    audience: 'Environment lead, regulators, lenders and communities', cadence: 'Monthly operational view and annual disclosure',
    summary: 'Water balance, waste streams, biodiversity impacts, closure liabilities and post-closure controls.',
    requiredPermissions: ['report.read'], sourceRegisters: ['water', 'waste', 'biodiversity', 'closure'],
    metrics: [measured('water_withdrawal', 'Water withdrawal', 'ML'), measured('waste', 'Waste generated', 't'), measured('closure_provision', 'Closure provision', 'AUD')],
    availability: 'blocked', blockers: ['Water, waste, biodiversity and closure source registers are not configured.'],
  },
  {
    id: 'RPT-07', version: 1, name: 'Production, Recovery & Reconciliation Report', category: 'operations', obligation: 'mandatory',
    audience: 'Operations manager, accountant, board and auditor', cadence: 'Daily operational view and monthly close',
    summary: 'Measured feed, production, physical output, basis completeness and preserved reconciliation status.',
    requiredPermissions: ['report.read'], sourceRegisters: ['runs', 'feed', 'lots', 'weights', 'assays', 'production', 'periods'],
    metrics: [measured('runs', 'Processing runs', 'count'), measured('dry_feed', 'Dry-basis feed', 't'), measured('fine_au', 'Recognised fine Au', 'g'), measured('basis_incomplete', 'Incomplete measurement bases', 'count'), measured('open_actions', 'Open actions', 'count')],
    availability: 'ready', blockers: [],
  },
  {
    id: 'RPT-08', version: 1, name: 'WHS / HSE Performance & Incident Report', category: 'compliance', obligation: 'mandatory',
    audience: 'Site senior manager, workers, regulator and board', cadence: 'Monthly and incident-triggered',
    summary: 'People, hazards, incidents, near misses, corrective actions, training and statutory notifications.',
    requiredPermissions: ['report.read'], sourceRegisters: ['people', 'hazards', 'incidents', 'actions', 'training'],
    metrics: [measured('recordable_incidents', 'Recordable incidents', 'count'), measured('near_misses', 'Near misses', 'count'), measured('open_corrective_actions', 'Open corrective actions', 'count')],
    availability: 'blocked', blockers: ['WHS/HSE people, hazard, incident, training and corrective-action registers are not configured.'],
  },
  {
    id: 'RPT-09', version: 1, name: 'Greenhouse Gas & Energy Report', category: 'esg', obligation: 'mandatory',
    audience: 'Sustainability lead, CER, board and investors', cadence: 'Monthly measurement and annual NGER disclosure',
    summary: 'Scope 1 and 2 emissions, energy use, emission factors, boundary and NGER evidence.',
    requiredPermissions: ['report.read'], sourceRegisters: ['fuel', 'energy', 'emissions_factors', 'facilities'],
    metrics: [measured('scope_1', 'Scope 1 emissions', 'tCO2e'), measured('scope_2', 'Scope 2 emissions', 'tCO2e'), measured('energy', 'Energy consumed', 'GJ')],
    availability: 'blocked', blockers: ['Emissions boundary, fuel/energy ledger and factor registers are not configured for report-grade accounting.'],
  },
  {
    id: 'RPT-10', version: 1, name: 'Community, Heritage & Stakeholder Report', category: 'esg', obligation: 'conditional',
    audience: 'Community lead, regulators, board and affected stakeholders', cadence: 'Monthly commitments view and annual disclosure',
    summary: 'Engagements, commitments, complaints, heritage controls, agreements and response status.',
    requiredPermissions: ['report.read'], sourceRegisters: ['stakeholders', 'engagements', 'commitments', 'heritage', 'complaints'],
    metrics: [measured('engagements', 'Engagements held', 'count'), measured('open_commitments', 'Open commitments', 'count'), measured('complaints', 'Complaints', 'count')],
    availability: 'blocked', blockers: ['Stakeholder, commitment, heritage and complaint registers are not configured.'],
  },
  {
    id: 'RPT-11', version: 1, name: 'Royalty, Tax & Expenditure Report', category: 'compliance', obligation: 'mandatory',
    audience: 'Finance lead, royalty authority, tax adviser and board', cadence: 'Monthly, quarterly and annual lodgement',
    summary: 'Production basis, eligible expenditure, royalties, tax inputs, invoices and statutory reconciliations.',
    requiredPermissions: ['report.read'], sourceRegisters: ['settlements', 'allocations', 'expenditure', 'royalties', 'tax'],
    metrics: [measured('eligible_expenditure', 'Eligible expenditure', 'AUD'), measured('royalty_basis', 'Royalty basis', 'AUD'), measured('royalty_payable', 'Royalty payable', 'AUD')],
    availability: 'blocked', blockers: ['Finance actuals, expenditure classification, royalty and tax registers are not configured.'],
  },
  {
    id: 'RPT-12', version: 1, name: 'Climate, Modern Slavery & ESG Report', category: 'esg', obligation: 'mandatory',
    audience: 'Board, investors, lenders and public stakeholders', cadence: 'Annual and material-risk triggered',
    summary: 'Climate risk, governance, modern slavery controls, supply chain risks and ESG commitments.',
    requiredPermissions: ['report.read'], sourceRegisters: ['climate_risks', 'suppliers', 'modern_slavery', 'esg_controls'],
    metrics: [measured('material_risks', 'Material ESG risks', 'count'), measured('suppliers_screened', 'Suppliers screened', 'count'), measured('open_controls', 'Open ESG controls', 'count')],
    availability: 'blocked', blockers: ['Climate-risk, supplier, modern-slavery and ESG-control registers are not configured.'],
  },
  {
    id: 'RPT-13', version: 1, name: 'Board / Investor Quarterly Operations Pack', category: 'operations', obligation: 'recommended',
    audience: 'Board, investors, lenders and senior management', cadence: 'Quarterly and material-event triggered',
    summary: 'Controlled operational snapshot with delivery, production, data quality, risks and next actions.',
    requiredPermissions: ['report.read'], sourceRegisters: ['runs', 'production', 'periods', 'work', 'geo'],
    metrics: [measured('fine_au', 'Recognised fine Au', 'g'), measured('dry_feed', 'Dry-basis feed', 't'), measured('open_actions', 'Open actions', 'count'), measured('basis_issues', 'Production basis issues', 'count')],
    availability: 'ready', blockers: [],
  },
  {
    id: 'RPT-14', version: 1, name: 'Independent Assurance & Audit Evidence Pack', category: 'assurance', obligation: 'recommended',
    audience: 'Internal audit, independent assurance provider, lender and regulator', cadence: 'Quarterly, annual and audit-triggered',
    summary: 'Revision-pinned metrics, evidence lineage, completeness gaps, approvals and unresolved actions.',
    requiredPermissions: ['report.read'], sourceRegisters: ['audit', 'files', 'work', 'report_runs'],
    metrics: [measured('source_revision', 'Shared source revision', 'revision'), measured('open_actions', 'Open actions', 'count'), measured('basis_issues', 'Production basis issues', 'count'), measured('report_as_of', 'Report as-of timestamp', 'timestamp')],
    availability: 'ready', blockers: [],
  },
];

export type ReportReadiness = {
  status: ReportAvailability;
  canGenerate: boolean;
  missingPermissions: string[];
  blockers: string[];
  notes: string[];
};

export function getReportDefinition(reportId: string) {
  return REPORT_DEFINITIONS.find((definition) => definition.id === reportId);
}

export function readinessForScope(definition: ReportDefinition, scope: Pick<Scope, 'permissions'>): ReportReadiness {
  const permissions = definition.availability === 'blocked'
    ? definition.requiredPermissions
    : [...new Set([...definition.requiredPermissions, 'report.generate'])];
  const missingPermissions = permissions.filter((permission) => !scope.permissions.includes(permission));
  const blockers = [...definition.blockers];
  if (missingPermissions.length) blockers.unshift(`Requires permission: ${missingPermissions.join(', ')}.`);
  const status: ReportAvailability = missingPermissions.length ? 'blocked' : definition.availability;
  return {
    status,
    canGenerate: status !== 'blocked',
    missingPermissions,
    blockers,
    notes: status === 'partial'
      ? ['This output is explicitly partial. It must not be used as a complete statutory or public disclosure.']
      : [],
  };
}

export function reportCatalogForScope(scope: Pick<Scope, 'permissions'>) {
  return REPORT_DEFINITIONS.map((definition) => ({
    ...definition,
    readiness: readinessForScope(definition, scope),
  }));
}

export function defaultReportPeriod(now = new Date()) {
  return {from: new Date(now.getTime() - 30 * 864e5).toISOString(), to: now.toISOString()};
}

export function normaliseReportPeriod(from?: string | null, to?: string | null) {
  const fallback = defaultReportPeriod();
  const fromValue = from || fallback.from;
  const toValue = to || fallback.to;
  const start = new Date(fromValue);
  const end = new Date(toValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new OpsError('validation', 'Choose a valid reporting period where the end follows the start.');
  }
  if (end.getTime() - start.getTime() > 10 * 365.25 * 864e5) {
    throw new OpsError('validation', 'Choose a reporting period of ten years or less.');
  }
  return {from: start.toISOString(), to: end.toISOString()};
}

export type ReportRpc = (name: string, args: Record<string, unknown>) => Promise<any>;

function metric(definition: ReportMetricDefinition, value: unknown, basis: string) {
  return {id: definition.id, label: definition.label, unit: definition.unit, value: value ?? null, basis};
}

function metricsFor(definition: ReportDefinition, dashboard: any, period: {from: string; to: string}) {
  const processing = dashboard?.processing || {};
  const gold = dashboard?.gold || {};
  const geology = dashboard?.geology || {};
  const common: Record<string, unknown> = {
    runs: processing.runs,
    dry_feed: processing.dry_t,
    fine_au: gold.confirmed_fine_au_g,
    open_actions: dashboard?.openActions,
    basis_incomplete: processing.basis_incomplete,
    basis_issues: dashboard?.productionBasisIssues,
    samples: geology.samples,
    holes: geology.holes,
    receipt_exceptions: geology.receiptExceptions,
    qa_qc_failures: null,
    source_revision: dashboard?.revision,
    report_as_of: dashboard?.asOf,
  };
  return definition.metrics.map((item) => metric(item, common[item.id], `MineralX shared revision ${dashboard?.revision ?? 'not available'}; ${period.from} to ${period.to}`));
}

function sectionsFor(definition: ReportDefinition, dashboard: any, readiness: ReportReadiness) {
  return [
    {
      id: 'executive',
      title: 'Executive summary',
      items: [
        {label: 'Report status', value: readiness.status},
        {label: 'Open actions', value: dashboard?.openActions ?? null},
        {label: 'Data-quality exceptions', value: dashboard?.productionBasisIssues ?? null},
      ],
    },
    {id: 'metrics', title: 'Measured metrics', items: definition.metrics.map((item) => item.id)},
    {
      id: 'controls',
      title: 'Controls, gaps and use limitations',
      items: [...readiness.blockers, ...readiness.notes],
    },
  ];
}

export async function buildReportDocument({
  call,
  scope,
  reportId,
  from,
  to,
  now = new Date(),
}: {
  call: ReportRpc;
  scope: Scope;
  reportId: ReportId;
  from?: string | null;
  to?: string | null;
  now?: Date;
}) {
  const definition = getReportDefinition(reportId);
  if (!definition) throw new OpsError('not_found', 'That report is not in the governed MineralX catalogue.');
  const readiness = readinessForScope(definition, scope);
  if (!readiness.canGenerate) throw new OpsError('validation', `Report ${reportId} is blocked: ${readiness.blockers.join(' ')}`);
  const period = normaliseReportPeriod(from, to);
  const dashboard = await call('mx_ops_dashboard', {p_scope: scope.id, p_from: period.from, p_to: period.to});
  const generatedAt = now.toISOString();
  return {
    format: 'mineralx-report-v1',
    reportId: definition.id,
    reportVersion: definition.version,
    name: definition.name,
    status: readiness.status,
    scope: {id: scope.id, orgId: scope.org_id, code: scope.code, name: scope.name, kind: scope.kind, timezone: scope.timezone},
    period: {...period, timezone: scope.timezone},
    source: {revision: dashboard?.revision ?? null, asOf: dashboard?.asOf ?? generatedAt},
    readiness,
    metrics: metricsFor(definition, dashboard, period),
    sections: sectionsFor(definition, dashboard, readiness),
    sourceSnapshot: dashboard,
    generatedAt,
  };
}
