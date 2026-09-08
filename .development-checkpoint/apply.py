from pathlib import Path
import hashlib,json,lzma
root=Path.cwd().resolve()
raw=lzma.decompress(b''.join((root/f'.development-checkpoint/part-{i}.xzpart').read_bytes() for i in range(1,4)))
assert hashlib.sha256(raw).hexdigest()=='246454e25a47e031541c8cadb3317537f230eac70c7e75c5e14d57da395deed0'
changes=json.loads(raw);assert len(changes)==25
blob=lambda b:hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
prepared=[];seen=set()
for row in changes:
 path=Path(row['path']);assert not path.is_absolute() and '..' not in path.parts and str(path) not in seen
 assert path.parts[0] in ['app','components','lib','scripts','tests','e2e','docs','public'] or str(path) in ['.gitignore','middleware.ts','package.json','package-lock.json','playwright.release.config.js']
 target=root/path;assert target.resolve().is_relative_to(root) and not target.is_symlink();seen.add(str(path))
 old=target.read_bytes() if target.exists() else b''
 assert (blob(old)==row['base']) if row['base'] else not target.exists(),f'Unexpected base: {path}'
 lines=old.decode().splitlines(keepends=True)
 for start,end,replace in reversed(row['edits']):
  assert 0<=start<=end<=len(lines) and all(isinstance(v,str) for v in replace)
  lines[start:end]=replace
 new=''.join(lines).encode();assert blob(new)==row['result'],f'Unexpected result: {path}'
 prepared.append((target,new))
for target,new in prepared:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(new);print('Verified source',target.relative_to(root))
