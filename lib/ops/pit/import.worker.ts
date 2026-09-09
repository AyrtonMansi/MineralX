import { importScan } from './import';
self.onmessage = async (event: MessageEvent) => {
  try { const {bytes,name,units,up} = event.data; const project = await importScan(bytes,name,units,up); self.postMessage({project}); }
  catch (e) { self.postMessage({error:e instanceof Error ? e.message : 'Unable to read this mesh.'}); }
};
