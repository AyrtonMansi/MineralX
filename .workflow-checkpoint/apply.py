"""Apply the bounded, checksum-verified corrections to the preserved normal source."""
from pathlib import Path
import hashlib,lzma,re,subprocess
patch=lzma.decompress(Path('.workflow-checkpoint/refinements.patch.xz').read_bytes())
assert hashlib.sha256(patch).hexdigest()=='7805d75d09024d32c492c938c9c0a56f97ab9d401d8a65ebde8d93041e311dff'
allowed={'app/ops/operations.css','components/ops/Home.tsx','components/ops/PlantWorkspace.tsx','e2e/workflow-upgrade.spec.js','lib/ops/workflow-model.ts','tests/ops/workflow-presentation.test.ts'}
paths=re.findall(r'^diff --git a/(\S+) b/(\S+)$',patch.decode(),re.M)
assert len(paths)==6 and all(a==b and a in allowed for a,b in paths)
subprocess.run(['git','apply','--check','-'],input=patch,check=True)
subprocess.run(['git','apply','-'],input=patch,check=True)
print('Applied verified calendar-date, draft-navigation, accessible-tabs and browser-navigation corrections.')
