import {protectedResourceMetadataOptions, protectedResourceMetadataResponse} from '@/lib/mcp/resource-metadata';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return protectedResourceMetadataResponse(request);
}

export async function HEAD(request: Request) {
  const response = protectedResourceMetadataResponse(request);
  return new Response(null, {status: response.status, headers: response.headers});
}

export const OPTIONS = protectedResourceMetadataOptions;
