"""Expand a checksummed, path-limited source delta. No archived commands are executed."""
from pathlib import Path
import hashlib, json, lzma, runpy
root = Path.cwd().resolve()
raw = b''.join((root / f'.spatial-checkpoint/source-{i}.xzpart').read_bytes() for i in range(1,4))
data = lzma.decompress(raw)
assert hashlib.sha256(data).hexdigest() == '81c78e1dc316da715703a9e312f235ca24aee942a99ac945f536b852b6e84919'
changes = json.loads(data)
assert isinstance(changes,list) and len(changes)==19
blob = lambda b: hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
seen=set(); prepared=[]
for item in changes:
    path=Path(item['path'])
    assert not path.is_absolute() and '..' not in path.parts and str(path) not in seen
    assert path.parts[0] in ('app','components','test','e2e') or str(path) in ('playwright.release.config.js','scripts/verify-geology-production.mjs')
    seen.add(str(path)); target=root/path
    assert target.resolve().is_relative_to(root) and not target.is_symlink()
    old=target.read_bytes() if target.exists() else b''
    assert (blob(old)==item['base']) if item['base'] else not target.exists(), f'Unexpected base: {path}'
    lines=old.decode('utf-8').splitlines(keepends=True)
    for start,end,replacement in reversed(item['edits']):
        assert 0<=start<=end<=len(lines) and all(isinstance(v,str) for v in replacement)
        lines[start:end]=replacement
    new=''.join(lines).encode('utf-8')
    assert blob(new)==item['result'],f'Unexpected result: {path}'
    prepared.append((target,new))
for target,new in prepared:
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(new)
    print(f'Verified expanded source {target.relative_to(root)}')
runpy.run_path(root / '.spatial-checkpoint/refinements.py')
