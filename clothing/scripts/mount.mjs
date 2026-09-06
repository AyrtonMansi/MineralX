import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The corporate build publishes a derived copy. clothing/dist remains standalone.
const clothingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(clothingRoot, '../public/clothing');
const prefix = '/clothing/';
await readFile(join(clothingRoot, 'dist/index.html')); // Fail before replacing output.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(join(clothingRoot, 'dist'), destination, { recursive: true });

for (const file of await readdir(destination)) {
  const path = join(destination, file);
  if (file.endsWith('.html')) {
    const html = await readFile(path, 'utf8');
    // Keep hash navigation relative to /clothing; a <base> would change its path.
    await writeFile(path, html.replace(/\b(src|href)="\.\//g, `$1="${prefix}`));
  } else if (file.endsWith('.js')) {
    const script = await readFile(path, 'utf8');
    // Browser-created image URLs are document-relative; module imports stay local.
    await writeFile(path, script.replaceAll('./assets/', `${prefix}assets/`));
  }
}
console.log('Clothing storefront staged at /clothing.');
