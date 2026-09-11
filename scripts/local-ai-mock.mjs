#!/usr/bin/env node

/**
 * DEVELOPMENT/TEST ONLY.
 *
 * Deterministic loopback substitute for the OpenAI Responses endpoint used by
 * MineralX Intelligence. It deliberately treats attachment URLs as opaque and
 * never downloads, opens, or otherwise dereferences them.
 */

import {createHash, timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4010;
const RESPONSES_PATH = '/v1/responses';
const HEALTH_PATH = '/healthz';
const MAX_REQUEST_BYTES = 512 * 1024;
const AUTHORIZATION = 'Bearer local-mock-only';
const MODEL = 'mineralx-local-deterministic-mock-v1';
const CONFIDENCE = 0.9;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const DOCUMENT_CATEGORIES = ['procedure', 'plan', 'handover', 'certificate', 'decision', 'other'];
const SUPPORTED_OUTCOMES = new Set(['classify', 'organize', 'extract', 'clean']);

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reject(status, code, message) {
  throw new RequestError(status, code, message);
}

function portFromEnvironment() {
  const raw = process.env.MINERALX_LOCAL_AI_MOCK_PORT || String(DEFAULT_PORT);
  if (!/^[0-9]{1,5}$/.test(raw)) throw new Error('MINERALX_LOCAL_AI_MOCK_PORT must be an integer from 1 to 65535.');
  const port = Number(raw);
  if (port < 1 || port > 65_535) throw new Error('MINERALX_LOCAL_AI_MOCK_PORT must be an integer from 1 to 65535.');
  return port;
}

function isAuthorized(request) {
  const supplied = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
  const expectedBytes = Buffer.from(AUTHORIZATION);
  const suppliedBytes = Buffer.from(supplied);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function sendJson(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length),
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}

function announcedLength(request) {
  const raw = request.headers['content-length'];
  if (raw === undefined) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    request.resume();
    reject(400, 'invalid_content_length', 'Content-Length must be a non-negative decimal integer.');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    request.resume();
    reject(400, 'invalid_content_length', 'Content-Length is invalid.');
  }
  return value;
}

function readBoundedBody(request) {
  const declared = announcedLength(request);
  if (declared !== null && declared > MAX_REQUEST_BYTES) {
    request.resume();
    reject(413, 'request_too_large', `Request bodies are limited to ${MAX_REQUEST_BYTES} bytes.`);
  }

  return new Promise((resolve, rejectPromise) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('aborted', onAborted);
      request.off('error', onError);
    };
    const finish = (callback, value, drain = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (drain) request.resume();
      callback(value);
    };
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_REQUEST_BYTES) {
        finish(rejectPromise, new RequestError(413, 'request_too_large', `Request bodies are limited to ${MAX_REQUEST_BYTES} bytes.`), true);
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = () => finish(resolve, Buffer.concat(chunks, size));
    const onAborted = () => finish(rejectPromise, new RequestError(400, 'request_aborted', 'The request ended before its body was complete.'));
    const onError = () => finish(rejectPromise, new RequestError(400, 'request_error', 'The request body could not be read.'));

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('aborted', onAborted);
    request.once('error', onError);
  });
}

async function readJson(request) {
  const mediaType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    request.resume();
    reject(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  const contentEncoding = String(request.headers['content-encoding'] || 'identity').trim().toLowerCase();
  if (contentEncoding !== 'identity') {
    request.resume();
    reject(415, 'unsupported_content_encoding', 'Compressed request bodies are not accepted.');
  }

  const bytes = await readBoundedBody(request);
  if (bytes.length === 0) reject(400, 'empty_request', 'A JSON request body is required.');
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    reject(400, 'invalid_encoding', 'The request body must be valid UTF-8.');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    reject(400, 'invalid_json', 'The request body must contain valid JSON.');
  }
  if (!isRecord(value)) reject(400, 'invalid_request', 'The request body must be a JSON object.');
  return value;
}

function parseTask(requestBody) {
  if (requestBody.store !== false) reject(422, 'invalid_request', 'The local mock accepts only store=false requests.');
  const format = isRecord(requestBody.text) && isRecord(requestBody.text.format) ? requestBody.text.format : null;
  if (!format || format.type !== 'json_schema' || format.name !== 'mineralx_intake_proposal' || format.strict !== true || !isRecord(format.schema)) {
    reject(422, 'invalid_structured_output', 'The MineralX strict structured-output contract is required.');
  }
  if (!Array.isArray(requestBody.input) || requestBody.input.length === 0) reject(422, 'invalid_input', 'A Responses API input message is required.');

  const content = requestBody.input.flatMap((message) => isRecord(message) && Array.isArray(message.content) ? message.content : []);
  let envelope = null;
  for (const part of content) {
    if (!isRecord(part) || part.type !== 'input_text' || typeof part.text !== 'string') continue;
    try {
      const candidate = JSON.parse(part.text);
      if (isRecord(candidate) && isRecord(candidate.task) && isRecord(candidate.outputRules)) {
        envelope = candidate;
        break;
      }
    } catch {
      // Attachment labels are ordinary text. Only the JSON task envelope is parsed.
    }
  }
  if (!envelope) reject(422, 'missing_task', 'The MineralX task envelope is missing.');

  const rules = envelope.outputRules;
  if (rules.contractVersion !== 1 || rules.permittedAction !== 'document.publish'
    || !Array.isArray(rules.documentCategories)
    || DOCUMENT_CATEGORIES.some((category) => !rules.documentCategories.includes(category))) {
    reject(422, 'invalid_output_rules', 'The MineralX document proposal rules are missing or incompatible.');
  }

  const task = envelope.task;
  if (typeof task.id !== 'string' || !UUID.test(task.id) || typeof task.scopeId !== 'string' || !UUID.test(task.scopeId)) {
    reject(422, 'invalid_task_identity', 'The task and scope IDs must be UUIDs.');
  }
  if (!SUPPORTED_OUTCOMES.has(task.outcome)) reject(422, 'unsupported_outcome', 'This local mock supports classify, organize, extract, and clean outcomes only.');
  if (task.preserveOriginal !== true) reject(422, 'invalid_preservation_policy', 'The source-preservation flag must be true.');
  if (task.targetRecord !== undefined || (isRecord(task.destinationHint)
    && (task.destinationHint.resource !== 'document'
      || (task.destinationHint.action !== undefined && task.destinationHint.action !== 'document.publish')))) {
    reject(422, 'unsupported_target', 'This local mock only proposes new document records.');
  }
  if (!Array.isArray(task.files) || task.files.length < 1 || task.files.length > 8) {
    reject(422, 'invalid_files', 'Each local mock request must contain between one and eight files.');
  }

  const ids = new Set();
  const files = task.files.map((file, index) => {
    if (!isRecord(file)
      || typeof file.id !== 'string' || !UUID.test(file.id)
      || file.scopeId !== task.scopeId
      || !Number.isInteger(file.version) || file.version < 0
      || typeof file.name !== 'string' || file.name.trim().length === 0 || file.name.length > 255
      || file.name === '.' || file.name === '..' || /[\\/\u0000-\u001f\u007f]/.test(file.name)
      || typeof file.mediaType !== 'string' || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(file.mediaType)
      || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1
      || typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)
      || file.trust !== 'verified') {
      reject(422, 'invalid_file', `File ${index + 1} does not match the verified MineralX file contract.`);
    }
    if (ids.has(file.id)) reject(422, 'duplicate_file', 'A file may appear only once in a request.');
    ids.add(file.id);
    return {
      id: file.id,
      name: file.name,
      mediaType: file.mediaType,
      sha256: file.sha256,
    };
  });

  const attachmentCount = content.filter((part) => isRecord(part)
    && (part.type === 'input_file' || part.type === 'input_image')).length;
  if (attachmentCount !== files.length) reject(422, 'invalid_attachments', 'Exactly one opaque attachment reference is required for each file.');

  return {id: task.id, scopeId: task.scopeId, outcome: task.outcome, files};
}

function titleFromFileName(fileName) {
  const extensionIndex = fileName.lastIndexOf('.');
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  let title = stem.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  title = title.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  if (title.length < 3) title = 'Local Test Document';
  title = title.slice(0, 240).replace(/[\uD800-\uDBFF]$/, '');
  return title;
}

function classificationFor(file) {
  const words = file.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/\b(?:assay|certificate|coa|laboratory|lab)\b/.test(words)) return {kind: 'assay_certificate', category: 'certificate'};
  if (/\b(?:procedure|sop)\b/.test(words)) return {kind: 'procedure_or_plan', category: 'procedure'};
  if (/\bplan(?:ning)?\b/.test(words)) return {kind: 'procedure_or_plan', category: 'plan'};
  if (/\b(?:handover|shift log|operations? log|daily log)\b/.test(words)) return {kind: 'operational_log', category: 'handover'};
  if (/\b(?:decision|resolution)\b/.test(words)) return {kind: 'meeting_notes', category: 'decision'};
  if (/\b(?:meeting|minutes)\b/.test(words)) return {kind: 'meeting_notes', category: 'other'};
  if (/\b(?:drill|collar|geology)\b/.test(words)) return {kind: 'drill_log', category: 'other'};
  if (/\b(?:dispatch|manifest)\b/.test(words)) return {kind: 'sample_dispatch', category: 'other'};
  if (file.mediaType.startsWith('image/')) return {kind: 'image', category: 'other'};
  if (file.mediaType === 'text/csv' || /\b(?:csv|xlsx|xls|ods)\b/.test(words)) return {kind: 'spreadsheet', category: 'other'};
  return {kind: 'report', category: 'other'};
}

function documentProposal(file, outcome) {
  const source = {fileId: file.id, sha256: file.sha256, locator: null};
  const classification = classificationFor(file);
  const proposal = {
    fileId: file.id,
    sourceSha256: file.sha256,
    classification: {
      kind: classification.kind,
      confidence: CONFIDENCE,
      rationale: 'Development mock classification derived from the filename only; attachment content was not fetched or inspected.',
      provenance: [source],
      warnings: [],
    },
    mapping: null,
    patches: [],
    confidence: CONFIDENCE,
    warnings: [],
  };
  if (outcome === 'classify') return proposal;

  const title = titleFromFileName(file.name);
  proposal.mapping = {
    target: {
      resource: 'document',
      operation: 'create',
      action: 'document.publish',
      record: null,
      schemaVersion: 1,
    },
    fields: [
      {source, targetPath: '/title', transform: 'trim', confidence: CONFIDENCE},
      {source, targetPath: '/category', transform: 'direct', confidence: CONFIDENCE},
    ],
    confidence: CONFIDENCE,
    warnings: [],
  };
  proposal.patches = [
    {
      op: 'set', path: '/title', value: title, confidence: CONFIDENCE,
      rationale: 'Development mock title derived deterministically from the source filename.', provenance: [source],
    },
    {
      op: 'set', path: '/category', value: classification.category, confidence: CONFIDENCE,
      rationale: 'Development mock category derived deterministically from the source filename and media type.', provenance: [source],
    },
  ];
  return proposal;
}

function responseFor(task) {
  const plan = {
    version: 1,
    intakeId: task.id,
    scopeId: task.scopeId,
    documents: task.files.map((file) => documentProposal(file, task.outcome)),
    confidence: CONFIDENCE,
    summary: `Development mock prepared ${task.files.length} deterministic document proposal${task.files.length === 1 ? '' : 's'} for human review; attachment content was not fetched.`,
    warnings: [],
  };
  const outputText = JSON.stringify(plan);
  const digest = createHash('sha256').update(outputText).digest('hex').slice(0, 24);
  return {
    id: `resp_local_${digest}`,
    object: 'response',
    created_at: 0,
    status: 'completed',
    error: null,
    incomplete_details: null,
    model: MODEL,
    output: [{
      id: `msg_local_${digest}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{type: 'output_text', text: outputText, annotations: [], logprobs: []}],
    }],
    output_text: outputText,
  };
}

if (process.env.NODE_ENV === 'production') {
  console.error('[DEV/TEST ONLY] Refusing to start the MineralX local AI mock with NODE_ENV=production.');
  process.exit(1);
}

let port;
try {
  port = portFromEnvironment();
} catch (error) {
  console.error(`[DEV/TEST ONLY] ${error instanceof Error ? error.message : 'Invalid local mock configuration.'}`);
  process.exit(1);
}

const server = createServer(async (request, response) => {
  try {
    if (!isAuthorized(request)) {
      request.resume();
      sendJson(response, 401, {
        error: {type: 'authentication_error', code: 'invalid_api_key', message: 'Bearer local-mock-only is required.'},
      }, {'WWW-Authenticate': 'Bearer realm="MineralX local mock"', Connection: 'close'});
      return;
    }

    const url = new URL(request.url || '/', `http://${HOST}`);
    if (url.pathname === HEALTH_PATH) {
      if (request.method !== 'GET') {
        request.resume();
        sendJson(response, 405, {error: {type: 'invalid_request_error', code: 'method_not_allowed', message: 'Use GET for this endpoint.'}}, {Allow: 'GET'});
        return;
      }
      sendJson(response, 200, {status: 'ok', service: MODEL, devTestOnly: true, fetchesAttachments: false});
      return;
    }
    if (url.pathname !== RESPONSES_PATH) {
      request.resume();
      sendJson(response, 404, {error: {type: 'invalid_request_error', code: 'not_found', message: 'Endpoint not found.'}});
      return;
    }
    if (request.method !== 'POST') {
      request.resume();
      sendJson(response, 405, {error: {type: 'invalid_request_error', code: 'method_not_allowed', message: 'Use POST for this endpoint.'}}, {Allow: 'POST'});
      return;
    }

    const requestBody = await readJson(request);
    const task = parseTask(requestBody);
    sendJson(response, 200, responseFor(task));
  } catch (error) {
    if (response.headersSent || response.destroyed) {
      response.destroy();
      return;
    }
    if (error instanceof RequestError) {
      sendJson(response, error.status, {
        error: {type: 'invalid_request_error', code: error.code, message: error.message},
      }, error.status === 413 ? {Connection: 'close'} : {});
      return;
    }
    console.error('[DEV/TEST ONLY] Unexpected local mock request failure.');
    sendJson(response, 500, {
      error: {type: 'server_error', code: 'local_mock_failure', message: 'The local mock could not prepare a response.'},
    });
  }
});

server.maxHeadersCount = 32;
server.headersTimeout = 5_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 1_000;
server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
server.on('error', (error) => {
  console.error(`[DEV/TEST ONLY] Local AI mock failed: ${error instanceof Error ? error.message : 'unknown server error'}`);
  process.exitCode = 1;
});

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.error(`[DEV/TEST ONLY] Stopping local AI mock after ${signal}.`);
  server.close((error) => {
    if (error) process.exitCode = 1;
  });
  setTimeout(() => server.closeAllConnections(), 1_000).unref();
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

server.listen(port, HOST, () => {
  console.error(`[DEV/TEST ONLY] MineralX deterministic AI mock listening on http://${HOST}:${port}${RESPONSES_PATH}`);
  console.error(`[DEV/TEST ONLY] Static local credential: ${AUTHORIZATION}. Attachment URLs are never fetched.`);
});
