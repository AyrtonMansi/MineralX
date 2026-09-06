# Plant workspace

`/plant` is a private, data-driven SVG general arrangement workspace, separate from the GIC production register. It uses the existing Supabase session and operation membership. The corporate layout and analytics do not wrap this page.

The workspace includes pan/zoom, circuit tracing, selectable equipment and connections, drawing layers, a searchable equipment register, design holds and source references. SVG exports reflect the current drawing view and layers. KML exports contain all equipment envelopes and routes plus the source lease and yard boundary. Neither export implies construction approval or hydraulic design.

## Activation

1. Apply `supabase/migrations/202609060003_plant_layouts.sql` after the GIC migrations. This change requires approval from the production database administrator.
2. Import the reviewed private JSON into `plant_layouts` for the verified existing operation UUID, with its revision. Validate the JSON with `plantSchema` before import. Use a parameterized query or properly quoted private SQL; never put operational data in the public repository.
3. Verify a member of that operation can open `/plant`, an unrelated account cannot read its row, and anonymous users are redirected to sign in.

The app grants no write capability for plant layouts. Owners, editors and viewers can read the plan only for their assigned operation; reviewed layout revisions are imported by the database administrator. Existing GIC account activation and membership assignment remain required. No service-role credential is used by the application.

## Validation

`node --import tsx --test tests/plant/*.test.ts tests/gic/*.test.ts`

`npm run build`

The database test exercises membership isolation, anonymous denial and rejected direct writes. The model test checks KML escaping and coordinate preservation. Test fixtures contain only synthetic data. Private imports should also verify every circuit trace references an existing route and compare key process routing to the original flowsheet.

No operational dataset, source email, lease coordinates or private review HTML should be committed or placed under `public/`.
