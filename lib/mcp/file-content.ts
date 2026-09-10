import {OpsError} from '@/lib/ops/contracts';
import type {OpenAiFile} from './contracts';

const OOXML_WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OOXML_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OOXML_SLIDES = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const KML = 'application/vnd.google-earth.kml+xml';
const KMZ = 'application/vnd.google-earth.kmz';

const textMediaByExtension: Record<string, string> = {
  csv: 'text/csv', txt: 'text/plain', md: 'text/plain', json: 'application/json',
  geojson: 'application/geo+json', kml: KML,
};

const extensionByMedia: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'text/csv': 'csv', 'text/plain': 'txt', 'application/json': 'json',
  'application/geo+json': 'geojson', [KML]: 'kml', [KMZ]: 'kmz',
  [OOXML_WORD]: 'docx', [OOXML_SHEET]: 'xlsx', [OOXML_SLIDES]: 'pptx',
  'application/vnd.las': 'las', 'application/vnd.laszip': 'laz',
  'application/octet-stream': 'las',
};

function extensionOf(name: string | undefined) {
  const normalized = (name || '').normalize('NFC').trim().toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index < 0 ? '' : normalized.slice(index + 1);
}

function assertedSafeName(value: string) {
  const normalized = value.normalize('NFC').trim();
  if (!normalized || normalized.length > 240 || /[/\\\u0000-\u001f\u007f]/.test(normalized)
    || normalized === '.' || normalized === '..') {
    throw new OpsError('validation', 'An uploaded file has an unsafe name.');
  }
  return normalized;
}

function normalizedMediaType(value: string | undefined) {
  return (value || '').split(';', 1)[0].trim().toLowerCase();
}

function utf8Text(bytes: Buffer) {
  if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) {
    throw new OpsError('validation', 'The file type is not supported.');
  }
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { throw new OpsError('validation', 'Text sources must use valid UTF-8 encoding.'); }
}

function detectedMediaType(bytes: Buffer, source: Pick<OpenAiFile, 'file_name' | 'mime_type'>) {
  const extension = extensionOf(source.file_name);
  const prefix = bytes.subarray(0, 12);
  if (prefix.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image/jpeg';
  if (prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (prefix.subarray(0, 4).toString() === 'LASF') {
    const declared = normalizedMediaType(source.mime_type);
    return extension === 'laz' || !source.file_name && declared === 'application/vnd.laszip'
      ? 'application/vnd.laszip'
      : extension === 'las' || !source.file_name && declared === 'application/vnd.las'
        ? 'application/vnd.las'
        : 'application/octet-stream';
  }
  if (prefix[0] === 0x50 && prefix[1] === 0x4b) {
    const archiveNames = bytes.toString('latin1');
    const contentTypes = archiveNames.includes('[Content_Types].xml');
    const kmlEntry = /(?:^|[\x00-\x1f/\\])[^/\\\x00-\x1f]{1,240}\.kml(?:[\x00-\x1f]|$)/i.test(archiveNames);
    const candidates = [
      contentTypes && archiveNames.includes('word/document.xml') ? OOXML_WORD : null,
      contentTypes && archiveNames.includes('xl/workbook.xml') ? OOXML_SHEET : null,
      contentTypes && archiveNames.includes('ppt/presentation.xml') ? OOXML_SLIDES : null,
      kmlEntry ? KMZ : null,
    ].filter((value): value is string => Boolean(value));
    if (candidates.length === 1) return candidates[0];
    throw new OpsError('validation', 'Generic ZIP archives are not accepted. Upload the original documents instead.');
  }

  const text = utf8Text(bytes);
  if (source.file_name) {
    const mediaType = textMediaByExtension[extension];
    if (!mediaType) throw new OpsError('validation', 'The file type is not supported.');
    return mediaType;
  }
  const declared = normalizedMediaType(source.mime_type);
  if (declared === KML) {
    if (!/<(?:[a-z][\w.-]*:)?kml(?:\s|>)/i.test(text.slice(0, 65_536))) {
      throw new OpsError('validation', 'The file does not contain a recognizable KML document.');
    }
    return KML;
  }
  if (declared === 'text/csv' || declared === 'text/plain') return declared;
  if (declared === 'application/json' || declared === 'application/geo+json') {
    try { JSON.parse(text); }
    catch { throw new OpsError('validation', 'The uploaded JSON file is invalid.'); }
    return declared;
  }
  if (/<(?:[a-z][\w.-]*:)?kml(?:\s|>)/i.test(text.slice(0, 65_536))) return KML;
  try {
    const parsed = JSON.parse(text) as {type?: unknown};
    const geoJsonTypes = new Set(['Feature', 'FeatureCollection', 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);
    return typeof parsed === 'object' && parsed && typeof parsed.type === 'string' && geoJsonTypes.has(parsed.type)
      ? 'application/geo+json'
      : 'application/json';
  } catch {
    return 'text/plain';
  }
}

/** Derives complete, internally consistent metadata even though ChatGPT only
 * guarantees download_url and file_id on file parameters. */
export function validatedMcpFileMetadata(
  bytes: Buffer,
  source: Pick<OpenAiFile, 'file_id' | 'file_name' | 'mime_type'>,
) {
  const mediaType = detectedMediaType(bytes, source);
  const name = source.file_name
    ? assertedSafeName(source.file_name)
    : assertedSafeName(`chatgpt-${source.file_id.slice(0, 80)}.${extensionByMedia[mediaType] || 'bin'}`);
  return {name, mediaType};
}
