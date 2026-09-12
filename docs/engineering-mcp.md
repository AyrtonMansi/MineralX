# MineralX Engineering MCP

The Engineering MCP turns ChatGPT into a proposal and design interface over the MineralX processing-plant model. MineralX remains authoritative; ChatGPT can inspect the semantic plant, calculate bounded geometry changes, model equipment parametrically, validate changes, and open the result in the real 3D Engineering workspace.

The interaction model is intentionally similar to working with a coding agent: read the current authoritative state, apply a small typed delta, preview immediately, inspect the result, iterate, and only then store a governed proposal. A preview is not an as-built claim and does not operate physical plant.

## Composer workflow

1. `mineralx_context` resolves the authorised processing-facility scope.
2. `get_mineralx_suite_capabilities` exposes the available MineralX surfaces and interaction paths for the connected account. `open_mineralx_surface` resolves exact authorised links for Engineering, Exploration, Processing, Gold, Programs, Work, Files, Reports, Intelligence and other suite surfaces without guessing routes.
3. `get_mineralx_plant_model` returns the current P5 revision, concurrency fingerprint, stable equipment IDs, local metre coordinates, planning envelopes, process routes, holds, traces and the deterministic 3D render profile for each item of equipment.
4. For conversational iteration, ChatGPT calls `preview_mineralx_plant_design`. Typical requests are “move the jig 2 m east”, “model the Russell J3 as a two-cell jig 2.4 m high”, “increase the Knudsen allowance to 3 × 3 m”, “rotate the screen 12 degrees”, or “reroute S14 around the service lane”. The tool validates typed operations and returns an unsaved Engineering URL that opens the actual Three.js surface with the changes applied.
5. The Engineering surface presents the current ChatGPT design delta, affected equipment/routes, model warnings, semantic equipment identity and a parametric inspector. This makes each conversational change inspectable rather than silently replacing the plant model.
6. When the user wants to retain a design, `propose_mineralx_plant_design` stores the same validated operations as an idempotent `engineering_design_changeset` and returns a durable Engineering preview URL.
7. `list_mineralx_plant_designs` and `get_mineralx_plant_design` recover proposal lineage for later review.

Supported design operations are deliberately small and composable: `move_equipment`, `translate_equipment`, `resize_equipment`, `configure_equipment`, `reroute_stream`, and `add_equipment`. Equipment and route IDs must come from the current semantic model. Moving equipment also moves attached route endpoints so process topology remains connected. Every proposal is checked for yard bounds, equipment collisions, route bounds and missing topology references before it can be stored.

## Parametric equipment modelling

The 3D plant is no longer rendered as a field of generic boxes. MineralX assigns or infers an engineering archetype and builds a deterministic equipment assembly from that semantic identity and its controlled planning envelope. Current archetypes cover ROM stockpiles, hoppers/bins, hammer crushers, VSI crushers, vibrating screens, Russell-style jigs, Knudsen/centrifugal bowls, sluices, shaker tables, spiral concentrators, cyclones, tanks, pumps, conveyor drives, generators, solar arrays, containers, platforms and a conservative generic fallback.

Each item can carry `overall_height_m`, rotation, archetype-specific dimensions, and a structured engineering specification. A `configure_equipment` operation lets ChatGPT change those parameters without rewriting arbitrary Three.js code. The renderer then rebuilds the equipment assembly deterministically, so the same engineering state produces the same visual result.

Model authority is explicit:

- `inferred` — expert-reasoned geometry derived from the equipment identity and controlled planning envelope. Useful for layout, access and process-flow iteration, but not a measured or OEM claim.
- `specified` — dimensions/specification intentionally adopted into the engineering basis.
- `vendor_reference` — dimensions tied to a verified vendor/OEM source.
- `as_built` — dimensions tied to surveyed or otherwise verified installed geometry.

ChatGPT must keep expert-reasoned dimensions as `inferred` until verified evidence supports a stronger status. This prevents a visually convincing model from silently becoming false engineering authority.

## Full MineralX interaction

Engineering is one specialised surface on the same governed MCP boundary. The base MineralX server already provides permission-scoped context, search, list and exact record retrieval plus the governed source → intake → analysis → proposal → approval → apply workflow. Suite capability tools now make those surfaces and routes explicit to ChatGPT, so a conversation can move from a plant design to its program, tasks, evidence, processing records, gold records, reports or Exploration context without inventing links or bypassing permissions.

The intended end state is one conversational control plane over MineralX: read authoritative records, manipulate reversible design/planning state in real time, preview spatial consequences, then route accountable record changes through the same permission/evidence/audit system. Direct motor, pump, valve, PLC or process-setpoint operation remains outside this boundary.

## Control boundary

These tools do not publish an as-built revision, operate pumps/motors/valves, change process setpoints, or write arbitrary database state. Instant previews write nothing. Durable designs require `plant.capture`, are recorded as `proposed`, and are intentionally separate from the existing human Engineering change-control register. A later release can add an MFA-backed review/publish action that promotes a reviewed changeset into an authoritative model version; that promotion is not implied by creating or viewing a ChatGPT proposal.

P5 X/Y coordinates and planning footprints remain the current controlled source geometry unless superseded through governed change control. Detailed Three.js equipment assemblies use stored engineering parameters when available and otherwise remain explicitly inferred.

## Database commissioning

`supabase/migrations/20260912050000_engineering_design_changesets.sql` adds the durable proposal store and three fixed MCP gateway operations. It versions the existing closed MCP gateway rather than broadening it to arbitrary RPC/SQL execution. The rest of Operations remains on schema v10 because the design store is an additive capability; instant ChatGPT previews work without the durable-store migration, while durable proposals require that migration to be applied to the production Supabase project.
