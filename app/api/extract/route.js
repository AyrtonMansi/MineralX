// Claude-powered extraction of structured geology data (samples, drill
// collars, downhole intervals, a tenement boundary) from pasted report
// text. Runs server-side so the Anthropic key never reaches the browser.
//
// Design constraints carried over from the rest of this app:
// - No invented geology: the model is instructed to extract only what the
//   document states and to leave fields empty otherwise, and this route
//   never fabricates a fallback response — if extraction isn't configured
//   or fails, the caller gets an honest error, not plausible-looking data.
// - Coordinate safety (CLAUDE.md hard rule 1): the model must report
//   coordinates verbatim, and any value with easting/northing magnitude
//   is REJECTED here into a `skipped` list — never silently reprojected.
//   Those rows go through the CSV import path where the ZonePicker makes
//   the user confirm the MGA zone.
//
// Structured outputs (`output_config.format`) guarantee the response
// parses against the schema below — no hand-rolled "is this JSON" checks.

import Anthropic from '@anthropic-ai/sdk';

// Extraction can take a while on long reports; Vercel's default function
// timeout is shorter than a hard document needs.
export const maxDuration = 60;

const MAX_TEXT_CHARS = 150_000;
const MAX_FEATURES = 500;

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

// `assays` is modelled as an array of {element, value, detectionLimit}
// triples rather than a map: structured-output schemas require
// additionalProperties: false on every object, which rules out dynamic
// element keys. Converted back to the app's `{ Au: 4.2 }` / sibling
// `detectionLimits` map shape in normalise() below.
//
// A below-detection result ("Au <0.01 g/t") is real, disclosed lab data
// — not "no grade" — so it gets its own field (value: null,
// detectionLimit: 0.01) instead of being dropped. An earlier version of
// this prompt told the model to just omit the pair for below-detection
// results, which silently lost exactly the kind of result a JORC
// disclosure most needs to state plainly.
const assaysSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['element', 'value', 'detectionLimit'],
    properties: {
      element: { type: 'string', description: 'Element symbol as printed, e.g. Au, Ag, Cu' },
      value: { ...nullableNumber, description: 'Numeric grade exactly as printed, or null if the result was below detection or not numeric.' },
      detectionLimit: { ...nullableNumber, description: 'If the document reports this result as below detection (e.g. "<0.01"), the numeric limit (0.01). Otherwise null.' },
    },
  },
};

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['samples', 'collars', 'intervals', 'boundary', 'confidence', 'sourceHighlights'],
  properties: {
    samples: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'lat', 'lng', 'assays', 'lith', 'notes'],
        properties: {
          id: { type: 'string', description: 'Sample ID exactly as written; empty string if the document gives none' },
          lat: { type: 'number', description: 'Latitude or northing EXACTLY as written in the document. Never convert between coordinate systems.' },
          lng: { type: 'number', description: 'Longitude or easting EXACTLY as written. Never convert.' },
          assays: assaysSchema,
          lith: { type: 'string', description: 'Lithology if stated, else empty string' },
          notes: { type: 'string', description: 'Brief context from the document, else empty string' },
        },
      },
    },
    collars: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'lat', 'lng', 'azimuth', 'dip', 'depth'],
        properties: {
          id: { type: 'string' },
          lat: { type: 'number', description: 'Verbatim from the document — never converted' },
          lng: { type: 'number', description: 'Verbatim from the document — never converted' },
          azimuth: nullableNumber,
          dip: nullableNumber,
          depth: nullableNumber,
        },
      },
    },
    intervals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['holeId', 'from', 'to', 'assays'],
        properties: {
          holeId: { type: 'string' },
          from: { type: 'number' },
          to: { type: 'number' },
          assays: assaysSchema,
        },
      },
    },
    boundary: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'coords'],
          properties: {
            name: { type: 'string' },
            coords: {
              type: 'array',
              description: 'Polygon vertices as [lat, lng] pairs, decimal degrees only',
              items: { type: 'array', items: { type: 'number' } },
            },
          },
        },
        { type: 'null' },
      ],
    },
    confidence: { type: 'number', description: 'Overall extraction confidence from 0 to 1' },
    sourceHighlights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'type'],
        properties: {
          text: { type: 'string', description: 'Short verbatim quote from the document supporting an extracted value' },
          type: { type: 'string', description: 'What the quote supports: assay, coordinate, collar, interval, boundary' },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a geologist extracting structured data from mineral exploration documents (assay reports, drill logs, field notes, announcements).

Rules:
- Extract ONLY what the document explicitly states. Never invent, estimate, or fill in sample IDs, coordinates, grades, depths, or names that are not present. Empty string / null / empty array are the correct outputs for absent data.
- Report coordinates VERBATIM as printed. If the document gives easting/northing (metre-scale values like 445000 / 7778000), output those numbers unchanged in lng/lat — do NOT convert them to latitude/longitude yourself; the application handles projection with human confirmation.
- Grades reported as below detection limit (e.g. "<0.01") are real, disclosed results — set value to null and detectionLimit to the numeric limit (0.01). Do not omit the pair.
- sourceHighlights: quote the exact sentence or table fragment each key extraction came from, so a geologist can verify against the source.
- confidence: your overall confidence that the extraction is faithful to the document (0-1). Be honest — degraded scans, ambiguous tables, or inferred structure should lower it.`;

const isProjected = (lat, lng) => Math.abs(lat) > 90 || Math.abs(lng) > 180;
const inRange = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  !Number.isNaN(lat) && !Number.isNaN(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// Mirrors the client-side readAssays()/parseAssayCell() contract in
// project-store.js: a below-detection result becomes a detectionLimits
// entry, never a dropped element.
function assaysToMaps(pairs) {
  const assays = {};
  const detectionLimits = {};
  (pairs || []).forEach(({ element, value, detectionLimit }) => {
    if (!element) return;
    const el = element.trim();
    if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
      assays[el] = value;
    } else if (typeof detectionLimit === 'number' && !Number.isNaN(detectionLimit) && detectionLimit >= 0) {
      detectionLimits[el] = detectionLimit;
    }
  });
  return { assays, detectionLimits };
}

// Applies the same coordinate-safety contract as the CSV parsers: rows
// with projected-magnitude coordinates are separated out with an
// explanation instead of being imported (or worse, guessed at).
function normalise(raw) {
  const skipped = [];

  const samples = [];
  (raw.samples || []).slice(0, MAX_FEATURES).forEach((s, i) => {
    if (isProjected(s.lat, s.lng)) {
      skipped.push({ kind: 'sample', id: s.id || `#${i + 1}`, reason: 'projected easting/northing — import via CSV so the MGA zone can be confirmed' });
      return;
    }
    if (!inRange(s.lat, s.lng)) {
      skipped.push({ kind: 'sample', id: s.id || `#${i + 1}`, reason: 'invalid coordinates' });
      return;
    }
    const { assays, detectionLimits } = assaysToMaps(s.assays);
    samples.push({
      id: (s.id || '').trim(), lat: s.lat, lng: s.lng, assays,
      ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}),
      lith: s.lith || '', notes: s.notes || '',
    });
  });

  const collars = [];
  (raw.collars || []).slice(0, MAX_FEATURES).forEach((c, i) => {
    if (isProjected(c.lat, c.lng)) {
      skipped.push({ kind: 'collar', id: c.id || `#${i + 1}`, reason: 'projected easting/northing — import via CSV so the MGA zone can be confirmed' });
      return;
    }
    if (!inRange(c.lat, c.lng)) {
      skipped.push({ kind: 'collar', id: c.id || `#${i + 1}`, reason: 'invalid coordinates' });
      return;
    }
    collars.push({ id: (c.id || '').trim(), lat: c.lat, lng: c.lng, azimuth: c.azimuth ?? null, dip: c.dip ?? null, depth: c.depth ?? null });
  });

  const intervals = [];
  (raw.intervals || []).slice(0, MAX_FEATURES).forEach((iv, i) => {
    if (!iv.holeId || typeof iv.from !== 'number' || typeof iv.to !== 'number' || iv.from > iv.to) {
      skipped.push({ kind: 'interval', id: iv.holeId || `#${i + 1}`, reason: 'invalid interval' });
      return;
    }
    const { assays, detectionLimits } = assaysToMaps(iv.assays);
    intervals.push({
      holeId: iv.holeId.trim(), from: iv.from, to: iv.to, assays,
      ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}),
    });
  });

  let boundary = null;
  if (raw.boundary?.coords?.length >= 3) {
    const coords = raw.boundary.coords.filter(pt => Array.isArray(pt) && pt.length >= 2 && inRange(pt[0], pt[1]));
    if (coords.length >= 3) boundary = { name: raw.boundary.name || 'Extracted boundary', coords: coords.map(pt => [pt[0], pt[1]]) };
    else skipped.push({ kind: 'boundary', id: raw.boundary.name || 'boundary', reason: 'coordinates not usable as decimal degrees' });
  }

  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0;
  const sourceHighlights = (raw.sourceHighlights || []).slice(0, 20);

  return { extracted: { samples, collars, intervals, boundary, confidence, sourceHighlights }, skipped };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  const { text, fileName } = body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return Response.json({ error: 'No text content provided for extraction.' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json(
      { error: `Document too long (${text.length.toLocaleString()} characters, limit ${MAX_TEXT_CHARS.toLocaleString()}). Split it and extract in parts.` },
      { status: 413 }
    );
  }

  // On Vercel there are no CLI auth profiles — an env credential is the
  // only way this route can authenticate, so fail fast and honestly
  // rather than letting the SDK produce a less actionable error.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      { error: 'AI extraction is not configured on this deployment. Set ANTHROPIC_API_KEY in the environment to enable it.', notConfigured: true },
      { status: 503 }
    );
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Extract all mineral exploration data from this document${fileName ? ` (${fileName})` : ''}:\n\n${text}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'The extraction model declined this document.' }, { status: 502 });
    }
    if (response.stop_reason === 'max_tokens') {
      return Response.json({ error: 'Document produced too much data for one pass — split it and extract in parts.' }, { status: 502 });
    }

    const textBlock = response.content.find(b => b.type === 'text');
    const raw = JSON.parse(textBlock.text); // schema-constrained by output_config
    const { extracted, skipped } = normalise(raw);

    return Response.json({ success: true, extracted, skipped, model: response.model, fileName: fileName || null });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: 'AI extraction credentials are invalid on this deployment.', notConfigured: true }, { status: 503 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: 'Extraction is rate-limited right now — try again in a minute.' }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Extraction service error (${error.status}).` }, { status: 502 });
    }
    console.error('Extraction error:', error);
    return Response.json({ error: 'Extraction failed.' }, { status: 500 });
  }
}
