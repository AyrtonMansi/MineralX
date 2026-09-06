"""Expand a checksummed source checkpoint; never execute archived commands."""
from pathlib import Path
import hashlib, json, lzma
root = Path.cwd().resolve()
raw = b''.join((root / f'.release-checkpoint/source-{i}.xzpart').read_bytes() for i in range(1,4))
data = lzma.decompress(raw)
assert hashlib.sha256(data).hexdigest() == '2e32f8525539c274f2d6552851a418cf708a7e76a882f6ea89d83a4000f45f93', 'Checkpoint integrity failure'
changes = json.loads(data)
assert isinstance(changes, list) and len(changes) == 24
blob = lambda b: hashlib.sha1(f'blob {len(b)}\0'.encode() + b).hexdigest()
prepared = []
seen = set()
for item in changes:
    path = Path(item['path'])
    assert not path.is_absolute() and '..' not in path.parts and path.parts[0] in ('app','components','test','e2e')
    assert str(path) not in seen
    seen.add(str(path))
    target = root / path
    assert target.resolve().is_relative_to(root) and not target.is_symlink()
    old = target.read_bytes() if target.exists() else b''
    assert blob(old) == item['base'] if item['base'] else not target.exists(), f'Base mismatch: {path}'
    lines = old.decode('utf-8').splitlines(keepends=True)
    for start, end, replacement in reversed(item['edits']):
        assert 0 <= start <= end <= len(lines) and all(isinstance(v,str) for v in replacement)
        lines[start:end] = replacement
    new = ''.join(lines).encode('utf-8')
    assert blob(new) == item['result'], f'Result mismatch: {path}'
    prepared.append((target,new))
for target,new in prepared:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(new)
    print(f'Expanded and verified {target.relative_to(root)}')
workflow = root / '.github/workflows/geology-release.yml'
s = workflow.read_text()
assert 'branches: [main, codex/geology-release-20260906]' in s
workflow.write_text(s.replace('branches: [main, codex/geology-release-20260906]', 'branches: [main, codex/geology-release-20260906, codex/geology-consolidated-20260907]'))
verify = root / 'scripts/verify-geology-production.mjs'
s = verify.read_text()
assert "assert.equal(release.release,'2026.09.06.1');" in s
verify.write_text(s.replace("assert.equal(release.release,'2026.09.06.1');", "assert.equal(release.release,'2026.09.07.1');"))
