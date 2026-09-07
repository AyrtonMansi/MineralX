from pathlib import Path

def change(path, before, after, count=1):
    p=Path(path); text=p.read_text(); actual=text.count(before)
    assert actual==count, f'{path}: expected {count} edit sites, found {actual}: {before[:90]}'
    p.write_text(text.replace(before,after))

p='e2e/spatial-workflows.spec.js'
change(p,"getByLabel('Basemap',{exact:true})", "getByRole('combobox',{name:'Basemap',exact:true})",2)
change(p,"getByLabel('Use as',{exact:true})", "getByRole('combobox',{name:'Use as',exact:true})")

p='components/mineralx/MineralXWorkspace.jsx'
change(p, '  const [activePanel, setActivePanel] = useState(null);', '''  const [activePanel, applyActivePanel] = useState(null);
  const navigationGuard = useRef(null);
  const registerNavigationGuard = useCallback(guard => { navigationGuard.current = guard; }, []);
  const setActivePanel = useCallback(panel => {
    if (navigationGuard.current?.() === false) return false;
    applyActivePanel(panel);
    return true;
  }, []);''')
change(p, '''    setManageTarget(null); setDataOpen(false); setActivePanel('spatial');
    setSpatialRequest({ projectId, files: Array.from(files), role, key: crypto.randomUUID() });
  }, []);''', '''    if (setActivePanel('spatial') === false) return false;
    setManageTarget(null); setDataOpen(false);
    setSpatialRequest({ projectId, files: Array.from(files), role, key: crypto.randomUUID() });
    return true;
  }, [setActivePanel]);''')
change(p, "onNavigate={() => { setActivePanel(null); setManageTarget(null); setDataOpen(false); }}", "onNavigate={() => { if (setActivePanel(null) === false) return false; setManageTarget(null); setDataOpen(false); return true; }}")
change(p, '''          setManageTarget(null); setDataOpen(false);
          if (name === 'spatial') { if(activeProject)openSpatialImport(activeProject.id); return; }
          if (name === 'targets' || name === 'holes') { setActivePanel(null); setDataTab(name); setDataOpen(true); }
          else setActivePanel(name);''', '''          if (name === 'spatial') return activeProject ? openSpatialImport(activeProject.id) : false;
          if (setActivePanel(name === 'targets' || name === 'holes' ? null : name) === false) return false;
          setManageTarget(null); setDataOpen(false);
          if (name === 'targets' || name === 'holes') { setDataTab(name); setDataOpen(true); }
          return true;''')
change(p, "<SpatialImportPanel key={spatialRequest.key}", "<SpatialImportPanel registerNavigationGuard={registerNavigationGuard} key={spatialRequest.key}")
change(p, "onManage={setManageTarget}", "onManage={target => { if (setActivePanel(null) !== false) { setDataOpen(false); setManageTarget(target); } }}")
for tab in ['chips','holes','targets']:
    old="onClick={() => { setManageTarget(null); if (dataOpen && dataTab === '"+tab+"')"
    new="onClick={() => { if (setActivePanel(null) === false) return; setManageTarget(null); if (dataOpen && dataTab === '"+tab+"')"
    change(p,old,new)
change(p, "onClick={() => { setProgramOpen(false); setManageTarget({ type: 'newProject' }); }}", "onClick={() => { if (setActivePanel(null) === false) return; setProgramOpen(false); setManageTarget({ type: 'newProject' }); }}")
change(p, "                    setStore(prev => ({ ...prev, activeProjectId: p.id }));", "                    if (setActivePanel(null) === false) return;\n                    setStore(prev => ({ ...prev, activeProjectId: p.id }));")
# Reference rasters belong below project vectors, regardless of activation order.
change(p, "map.addLayer({ id: layerRenderId, type: 'raster', source: sourceId, paint: { 'raster-opacity': opacity } });", "map.addLayer({ id: layerRenderId, type: 'raster', source: sourceId, paint: { 'raster-opacity': opacity } }, map.getStyle().layers.find(layer => layer.id.startsWith('mx-vector:'))?.id);")

p='components/mineralx/SpatialImportPanel.jsx'
change(p, "onClose, onSaved, locked })", "onClose, onSaved, locked, registerNavigationGuard })")
change(p, "  const close = () => { if (saving || busy) return; if (rows.length && !window.confirm('Close the import preview without saving the remaining files? Your original files and saved project are unchanged.')) return; onClose(); };", '''  useEffect(() => {
    const guard = () => {
      if (saving || busy) { setError('Wait for file validation or the storage transaction before leaving this import.'); return false; }
      return !rows.length || window.confirm('Leave this import preview without saving the remaining files? Your original files and saved project are unchanged.');
    };
    const warn = event => { if (rows.length || busy || saving) { event.preventDefault(); event.returnValue = ''; } };
    registerNavigationGuard?.(guard);
    window.addEventListener('beforeunload', warn);
    return () => { registerNavigationGuard?.(null); window.removeEventListener('beforeunload', warn); };
  }, [rows.length, busy, saving, registerNavigationGuard]);
  const close = () => { if (!saving && !busy) onClose(); };''')

p='components/mineralx/FieldWorkflowPanel.jsx'
change(p,"const choose=(name)=>{setStage(name);setCapture(null);setFailure('');setMessage('');onNavigate();};", "const choose=(name)=>{if(onNavigate()===false)return;setStage(name);setCapture(null);setFailure('');setMessage('');};")
change(p,"const openCapture=(options={})=>{onNavigate();setCapture(options);setFailure('');setMessage('');};", "const openCapture=(options={})=>{if(onNavigate()===false)return;setCapture(options);setFailure('');setMessage('');};")
change(p,"const tool=name=>{setCapture(null);setStage('Map');onTool(name);};", "const tool=name=>{if(onTool(name)===false)return;setCapture(null);setStage('Map');};")

p=Path('e2e/spatial-workflows.spec.js')
p.write_text(p.read_text()+'''

test('unsaved spatial preview cannot be discarded by workspace navigation without confirmation',async({page})=>{
 await start(page,'Navigation protection');await importFiles(page,[{name:'Uncommitted.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(collection([polygon])))}]);
 await expect(importer(page).getByText('Uncommitted.geojson',{exact:true})).toBeVisible();
 const dismiss=async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('without saving');await dialog.dismiss();};
 page.once('dialog',dismiss);await nav(page,'Samples');await expect(importer(page)).toBeVisible();await expect(page.getByRole('region',{name:'Samples workspace'})).toHaveCount(0);
 page.once('dialog',dismiss);await importer(page).getByRole('button',{name:'Back to map',exact:true}).click();await expect(importer(page)).toBeVisible();
 expect((await db(page)).data.projects[0].spatialLayers||[]).toHaveLength(0);
 await saveImport(page);await nav(page,'Samples');await expect(page.getByRole('region',{name:'Samples workspace'})).toBeVisible();expect((await db(page)).data.projects[0].spatialLayers).toHaveLength(1);
});
''')
