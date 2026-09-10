const OOXML_WORD='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OOXML_SHEET='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OOXML_SLIDES='application/vnd.openxmlformats-officedocument.presentationml.presentation';
const KML='application/vnd.google-earth.kml+xml';
const KMZ='application/vnd.google-earth.kmz';

const startsWith=(bytes:Buffer,signature:readonly number[])=>bytes.length>=signature.length
  &&signature.every((value,index)=>bytes[index]===value);
const includesAscii=(bytes:Buffer,value:string)=>bytes.includes(Buffer.from(value,'ascii'));

function extensionOf(name:string){
  const normalized=name.normalize('NFC').trim().toLowerCase();
  const index=normalized.lastIndexOf('.');
  return index<0?'':normalized.slice(index+1);
}

function textKind(extension:string){
  if(extension==='csv')return 'text/csv';
  if(extension==='txt'||extension==='md')return 'text/plain';
  if(extension==='json')return 'application/json';
  if(extension==='geojson')return 'application/geo+json';
  if(extension==='kml')return KML;
  return undefined;
}

/**
 * Performs a bounded local signature/type check before any source reaches the
 * configured scanner or an intelligence provider. It is not a malware scan;
 * it prevents declared MIME types and file names from bypassing the intended
 * parser boundary.
 */
export function evidenceContentViolation(
  bytes:Buffer,
  input:{name:string;mediaType:string},
):string|undefined{
  if(!bytes.length)return 'Empty files cannot enter intelligence processing.';
  const mediaType=input.mediaType.toLowerCase();
  const extension=extensionOf(input.name);
  const pdf=bytes.subarray(0,5).toString('ascii')==='%PDF-';
  const png=startsWith(bytes,[137,80,78,71,13,10,26,10]);
  const jpeg=startsWith(bytes,[0xff,0xd8,0xff]);
  const webp=bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'
    &&bytes.subarray(8,12).toString('ascii')==='WEBP';
  const zip=startsWith(bytes,[0x50,0x4b,0x03,0x04])||startsWith(bytes,[0x50,0x4b,0x05,0x06])
    ||startsWith(bytes,[0x50,0x4b,0x07,0x08]);
  const las=bytes.subarray(0,4).toString('ascii')==='LASF';

  if(pdf)return mediaType==='application/pdf'&&extension==='pdf'?undefined:'The file signature does not match its PDF name and media type.';
  if(png)return mediaType==='image/png'&&extension==='png'?undefined:'The file signature does not match its PNG name and media type.';
  if(jpeg)return mediaType==='image/jpeg'&&(extension==='jpg'||extension==='jpeg')?undefined:'The file signature does not match its JPEG name and media type.';
  if(webp)return mediaType==='image/webp'&&extension==='webp'?undefined:'The file signature does not match its WebP name and media type.';
  if(las){
    const expected=extension==='las'
      ?new Set(['application/octet-stream','application/vnd.las'])
      :extension==='laz'?new Set(['application/octet-stream','application/vnd.laszip']):new Set<string>();
    return expected.has(mediaType)?undefined:'The LAS/LAZ signature does not match its file name and media type.';
  }
  if(zip){
    const contentTypes=includesAscii(bytes,'[Content_Types].xml');
    if(extension==='docx'&&mediaType===OOXML_WORD&&contentTypes&&includesAscii(bytes,'word/'))return undefined;
    if(extension==='xlsx'&&mediaType===OOXML_SHEET&&contentTypes&&includesAscii(bytes,'xl/'))return undefined;
    if(extension==='pptx'&&mediaType===OOXML_SLIDES&&contentTypes&&includesAscii(bytes,'ppt/'))return undefined;
    if(extension==='kmz'&&mediaType===KMZ&&includesAscii(bytes,'.kml'))return undefined;
    return 'Generic or mismatched ZIP archives are not accepted. Upload the original supported document.';
  }

  const expectedTextType=textKind(extension);
  if(!expectedTextType||mediaType!==expectedTextType)return 'The file content does not match a supported name and media type.';
  if(bytes.subarray(0,Math.min(bytes.length,8192)).includes(0))return 'Text sources may not contain binary NUL bytes.';
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{return 'Text sources must use valid UTF-8 encoding.';}
  if(mediaType===KML&&!/<(?:[a-z][\w.-]*:)?kml(?:\s|>)/i.test(text.slice(0,65_536))){
    return 'The file does not contain a recognizable KML document.';
  }
  return undefined;
}
