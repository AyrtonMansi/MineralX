import {readFileSync,writeFileSync} from 'node:fs';
function change(path,from,to){const text=readFileSync(path,'utf8');if(!text.includes(from))throw new Error(`Expected source not found in ${path}`);writeFileSync(path,text.replaceAll(from,to));}
const test='e2e/release-workflows.spec.js';
// Query the actual accessible role/name. Label textContent can include option or textarea content.
change(test,"getByLabel('Program',{exact:true})","getByRole('combobox',{name:'Program',exact:true})");
change(test,"getByLabel('Field notes',{exact:true})","getByRole('textbox',{name:'Field notes',exact:true})");
// Next.js also exposes an empty route-announcer alert; target the workflow error boundary.
change(test,"expect(page.getByRole('alert')).toContainText('overlaps')","expect(page.locator('.mxf-panel').getByRole('alert')).toContainText('overlaps')");
// The inherited PNG had an invalid IDAT CRC and chunk length; strict browser decoders reject it.
const invalid='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const valid='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
change(test,invalid,valid);
change('app/api/basemap/[...tile]/route.js',invalid,valid);
