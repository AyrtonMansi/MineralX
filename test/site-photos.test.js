import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Site photos are drone survey stills; the originals embed the exact field
// location in EXIF GPS. Published files must carry pixels only.
const dir = new URL('../public/images/site/', import.meta.url);

test('every published site photo is a metadata-free WebP pair', () => {
  const files = readdirSync(dir).filter((f) => !f.startsWith('.'));
  assert.ok(files.length > 0);
  const bases = new Set();
  for (const f of files) {
    const m = /^(.+)-(1000|2000)\.webp$/.exec(f);
    assert.ok(m, `${f} must be <name>-1000.webp or <name>-2000.webp`);
    bases.add(m[1]);
    const bytes = readFileSync(new URL(f, dir));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF', f);
    assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP', f);
    for (let at = 12; at + 8 <= bytes.length; ) {
      const chunk = bytes.subarray(at, at + 4).toString('latin1');
      assert.ok(!['EXIF', 'XMP '].includes(chunk), `${f} contains a ${chunk.trim()} chunk`);
      const size = bytes.readUInt32LE(at + 4);
      at += 8 + size + (size % 2);
    }
  }
  for (const b of bases) {
    assert.ok(files.includes(`${b}-1000.webp`) && files.includes(`${b}-2000.webp`), `${b} needs both widths for srcset`);
  }
});
