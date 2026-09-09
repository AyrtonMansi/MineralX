"""Expand a checksummed data-only source delta with original/result Git-blob checks."""
from pathlib import Path
import hashlib, json, lzma
root = Path.cwd().resolve()
raw = b''.join((root / f'.workflow-checkpoint/part-{i}.xzpart').read_bytes() for i in range(1,6))
data = lzma.decompress(raw)
assert hashlib.sha256(data).hexdigest() == 'a13c9b4c33644c69af1f0cbdf4d0aea255d4ba2280e7a4a9dc7446e72689d1b5', 'Source integrity mismatch'
changes = json.loads(data)
assert isinstance(changes,list) and len(changes)==45
blob = lambda b: hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
seen=set(); prepared=[]
for item in changes:
    path=Path(item['path'])
    assert not path.is_absolute() and '..' not in path.parts and str(path) not in seen
    assert path.parts[0] in ('app','components','lib','scripts','supabase','tests','e2e','docs') or str(path)=='playwright.release.config.js'
    seen.add(str(path)); target=root/path
    assert target.resolve().is_relative_to(root) and not target.is_symlink()
    if item['base']:
        assert target.is_file(), f'Missing original {path}'
        old=target.read_bytes(); assert blob(old)==item['base'], f'Original revision mismatch: {path}'
    else:
        assert not target.exists(), f'Unexpected existing file: {path}'
        old=b''
    lines=old.decode('utf-8').splitlines(keepends=True)
    prior_end=0
    for start,end,replacement in item['edits']:
        assert isinstance(start,int) and isinstance(end,int) and prior_end<=start<=end<=len(lines)
        assert isinstance(replacement,list) and all(isinstance(v,str) for v in replacement)
        prior_end=end
    for start,end,replacement in reversed(item['edits']):
        lines[start:end]=replacement
    new=''.join(lines).encode('utf-8')
    assert blob(new)==item['result'], f'Expanded revision mismatch: {path}'
    prepared.append((target,new))
for target,new in prepared:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(new)
    print(f'Verified source: {target.relative_to(root)}')
