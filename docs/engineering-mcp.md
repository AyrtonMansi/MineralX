# MineralX Engineering MCP

The Engineering MCP turns ChatGPT into a proposal and design interface over the MineralX processing-plant model. MineralX remains authoritative; ChatGPT can inspect the semantic plant, calculate bounded geometry changes, validate them, and open the result in the real 3D Engineering workspace.

## Composer workflow

1. `mineralx_context` resolves the authorised processing-facility scope.
2. `get_mineralx_plant_model` returns the current P5 revision, concurrency fingerprint, stable equipment IDs, local metre coordinates, planning envelopes, routes, holds and process traces.
3. For conversational iteration, ChatGPT calls `preview_mineralx_plant_design`. Typical requests are “move the jig 2 m east”, “increase the Knudsen allowance to 3 x 3 m”, or “reroute S14 around the service lane”. The tool validates the typed operations and returns an unsaved Engineering URL that opens the actual Three.js CAD surface with those changes applied.
4. When the user wants to retain a design, `propose_mineralx_plant_design` stores the same validated operations as an idempotent `engineering_design_changeset` and returns a durable Engineering preview URL.
5. `list_mineralx_plant_designs` and `get_mineralx_plant_design` recover proposal lineage for later review.

Supported geometry operations are deliberately small and typed: `move_equipment`, `resize_equipment`, `reroute_stream`, and `add_equipment`. Equipment and route IDs must come from the current semantic model. Moving equipment also moves its attached route endpoint so the process topology remains connected. Every proposal is checked for yard bounds, equipment collisions, route bounds and missing topology references before it can be stored.

## Control boundary

These tools do not publish an as-built revision, operate pumps/motors/valves, change process setpoints, or write arbitrary database state. Instant previews write nothing. Durable designs require `plant.capture`, are recorded as `proposed`, and are intentionally separate from the existing human Engineering change-control register. A later release can add an MFA-backed review/publish action that promotes a reviewed changeset into an authoritative model version; that promotion is not implied by creating or viewing a ChatGPT proposal.

The P5 X/Y coordinates and planning footprints remain source geometry. The Three.js vertical solids remain concept massing until vendor/OEM Z geometry or surveyed as-built models are supplied.

## Database commissioning

`supabase/migrations/20260912050000_engineering_design_changesets.sql` adds the durable proposal store and three fixed MCP gateway operations. It versions the existing closed MCP gateway rather than broadening it to arbitrary RPC/SQL execution. The rest of Operations remains on schema v10 because the design store is an additive capability; instant ChatGPT previews work without the durable-store migration, while durable proposals require that migration to be applied to the production Supabase project.
