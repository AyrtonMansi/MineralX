from pathlib import Path
import hashlib
expected={
 'components/mineralx/MineralXWorkspace.jsx':'22fc9e672cee3d880e4ac71525a126f910d75ac1',
 'components/mineralx/FieldWorkflowPanel.jsx':'579629345c405b3388d9779c7c61811800562855',
 'e2e/spatial-workflows.spec.js':'bac1586f560fc854263a27083252d480ab78b563',
}
for path,digest in expected.items():
 b=Path(path).read_bytes();assert hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==digest,path

def replace(path,old,new):
 p=Path(path);s=p.read_text();assert s.count(old)==1,(path,old);p.write_text(s.replace(old,new))
p='components/mineralx/MineralXWorkspace.jsx'
replace(p,'const { store, setStore, hydrated } = persistence;','const { store, setStore, hydrated, flush } = persistence;')
f=Path(p);f.write_text(f.read_text().replace('persistence.flush','flush'))
replace(p,'        persistence={persistence}\n        legacyOpen=', '        persistence={persistence}\n        layerPreferences={{layerOn, layerOpacity, layerExpanded, basemap, activeElement}}\n        legacyOpen=')
replace(p,'      const map = new maplibregl.Map({','      flownToProject.current = false;\n      const map = new maplibregl.Map({')
replace(p,'''    map.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: 13, duration: 2600, curve: 1.4 });
  }, [mapReady, hydrated, initialCenter]);''','''    const extent = activeProject?.boundary ? boundaryData(activeProject.boundary) : {type:'FeatureCollection',features:(activeProject?.spatialLayers||[]).filter(layer=>!layer.archivedAt).flatMap(layer=>layer.data.features)};
    const bounds = spatialBounds(extent);
    if (bounds) map.fitBounds(bounds, {padding:70, maxZoom:14, duration:1200});
    else map.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: 13, duration: 2600, curve: 1.4 });
  }, [mapReady, hydrated, initialCenter, activeProject]);''')
p='components/mineralx/FieldWorkflowPanel.jsx'
replace(p,'getMapCenter,legacyOpen}){','getMapCenter,legacyOpen,layerPreferences}){')
replace(p,'await makeBackup(store,{view:loadLayerUiState(),drafts})','await makeBackup(store,{view:layerPreferences||loadLayerUiState(),drafts})')
p=Path('e2e/spatial-workflows.spec.js')
s=p.read_text();old=" const row=layers(page).locator(`[data-layer-id=\"spatial:${project.id}:${sourceId}\"]`);"
assert s.count(old)==1
s=s.replace(old," await page.screenshot({path:'test-results/geology-spatial-overview-desktop.png',fullPage:true});\n"+old)
p.write_text(s+'''

test('a layer-preference quota error stays visible and the full backup retains the open view',async({page})=>{
 await start(page,'Preference recovery');await importFiles(page,[{name:'Reference.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(collection([polygon])))}]);await saveImport(page);
 const p=(await db(page)).data.projects[0],id=`spatial:${p.id}:${p.spatialLayers[0].recordId}`;
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='mx-layers-v1')throw new DOMException('Injected preference quota','QuotaExceededError');return original.call(this,key,value);};});
 await layers(page).getByRole('checkbox',{name:'Show Reference',exact:true}).uncheck();await expect(layers(page).getByRole('alert')).toContainText('preferences could not be saved');
 await nav(page,'Review');const backup=await downloadFile(page,page.getByRole('button',{name:'Download full backup',exact:true}));
 const payload=JSON.parse(JSON.parse(backup.bytes.toString()).payload);expect(payload.layerUi.view.layerOn[id]).toBe(false);expect(payload.store.projects[0].spatialLayers[0].source).toEqual(p.spatialLayers[0].source);
});
''')
