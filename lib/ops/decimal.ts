// Fixed decimal arithmetic for previews and exports. PostgreSQL NUMERIC is canonical.
// Decimal strings avoid converting an unmeasured value into zero or rounding at input.
const SCALE=BigInt(1000000);
export function decimal(value: string|number, {negative=false}:{negative?:boolean}={}) {
  const s=String(value).trim();if(!/^-?\d{1,12}(\.\d{1,6})?$/.test(s)||(!negative&&s.startsWith('-')))throw new Error('Enter a non-negative decimal with at most six decimal places.');
  const sign=s.startsWith('-')?-BigInt(1):BigInt(1),[whole,fraction='']=s.replace('-','').split('.');return sign*(BigInt(whole)*SCALE+BigInt(fraction.padEnd(6,'0')));
}
export function decimalText(value:bigint) {const sign=value<BigInt(0)?'-':'';const n=value<BigInt(0)?-value:value;return sign+String(n/SCALE)+(n%SCALE?'.'+String(n%SCALE).padStart(6,'0').replace(/0+$/,''):'');}
export function multiply(a:string|number,b:string|number) {return decimalText(decimal(a)*decimal(b)/SCALE);}
export function fineGold(net:string|number|null,percent:string|number|null) {
  if(net===null||percent===null)return null;
  const p=decimal(percent);if(p>BigInt(100)*SCALE)throw new Error('Gold percentage must not exceed 100.');
  return decimalText(decimal(net)*p/(BigInt(100)*SCALE));
}
export function dryTonnes(tonnes:string|number|null,basis:'dry'|'wet',wetMoisturePercent:string|number|null) {
  if(tonnes===null)return null;if(basis==='dry')return decimalText(decimal(tonnes));if(wetMoisturePercent===null)return null;
  const moisture=decimal(wetMoisturePercent);if(moisture>=BigInt(100)*SCALE)throw new Error('Wet-basis moisture must be below 100%.');
  return decimalText(decimal(tonnes)*(BigInt(100)*SCALE-moisture)/(BigInt(100)*SCALE));
}
export function balance(opening:string|null,input:string|null,output:string|null,closing:string|null) {
  if([opening,input,output,closing].some(x=>x===null))return null;
  return decimalText(decimal(opening!)+decimal(input!)-decimal(output!)-decimal(closing!));
}
