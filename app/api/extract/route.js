// Do not expose an unauthenticated paid extraction endpoint when promoting geology.
export async function POST() {
  return Response.json({ error: 'AI extraction is not enabled on this release. Use CSV import; authenticated extraction must be configured before activation.' }, { status: 503 });
}
