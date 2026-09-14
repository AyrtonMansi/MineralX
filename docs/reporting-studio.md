# MineralX Report Studio

The reporting foundation is an additive v11 Operations capability. Report definitions are code-owned in `lib/ops/reporting-core.ts`; generated runs are retained in `mx_ops.report_runs` with the source revision, period, metrics, data gaps and an audit entry.

## Current catalogue

The studio exposes the 14 fundamental report families:

- RPT-01 JORC Resource & Reserve Statement
- RPT-02 Exploration Results & Technical Update
- RPT-03 Tenement / Licence Compliance Report
- RPT-04 Exploration QA/QC & Assay Integrity Report
- RPT-05 Annual Environment & Rehabilitation Report
- RPT-06 Water, Waste, Biodiversity & Closure Report
- RPT-07 Production, Recovery & Reconciliation Report
- RPT-08 WHS / HSE Performance & Incident Report
- RPT-09 Greenhouse Gas & Energy Report
- RPT-10 Community, Heritage & Stakeholder Report
- RPT-11 Royalty, Tax & Expenditure Report
- RPT-12 Climate, Modern Slavery & ESG Report
- RPT-13 Board / Investor Quarterly Operations Pack
- RPT-14 Independent Assurance & Audit Evidence Pack

RPT-07, RPT-13 and RPT-14 are available from the existing Operations registers. RPT-04 is available as an explicitly partial exploration completeness report. The remaining families remain visible but blocked until their source registers are commissioned. A blocked report can never be generated with placeholder zeros.

## UI and MCP

The Operations Reports page provides period selection, readiness, one-click generation and JSON artefact download. The protected MCP surface provides:

- `get_mineralx_report_catalog`
- `check_mineralx_report_readiness`
- `generate_mineralx_report`
- `list_mineralx_reports`
- `get_mineralx_report`

MCP report generation requires `report.generate`, is idempotent through a caller-supplied key, and retains the same source-revision boundary used by the UI.

## Release sequence

1. Apply `20260914010816_operations_reporting_foundation.sql`.
2. Apply `20260914011746_operations_reporting_mcp_gateway.sql`.
3. Deploy the application after the database reports schema version 11.

The local Development workspace continues to use its isolated v9 sandbox. Its report output is marked `developmentOnly` and is never written to production or treated as staff sign-off.
