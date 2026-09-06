import { proxyPlantNotes } from '@/lib/plant/notes-proxy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(request:Request)=>proxyPlantNotes(request);
export const POST=(request:Request)=>proxyPlantNotes(request);
export const PATCH=(request:Request)=>proxyPlantNotes(request);
