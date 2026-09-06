export const brand = Object.freeze({name:'X',endorsement:'By MineralX',collection:'MINERAL / 01',status:'preview'});
export const categories = [
  {name:'Utility',number:'01',line:'Quietly capable.',description:'Considered layers and practical details for time in the field and everything after.',image:'utility-story'},
  {name:'Move',number:'02',line:'In your element.',description:'Closer fits and easy layers for training, recovery and the way home.',image:'move-story'},
  {name:'Transit',number:'03',line:'Take the long way.',description:'A relaxed, refined approach to the days spent between places.',image:'transit-story'},
  {name:'Essentials',number:'04',line:'Always in rotation.',description:'The everyday pieces that bring the whole wardrobe together.',image:'essentials-story'}
];
export const products = [
  {id:'everyday-tee',name:'Everyday Tee',category:'Essentials',wearer:'Men',fit:'Oversized',colour:'Chalk',hex:'#e9e6df',image:'essential-tee',number:'E / 01',description:'An easy, generous tee with a clean neckline and a quiet presence. The starting point for a wardrobe that moves between plans.',details:['Dropped shoulder direction','Generous body and easy sleeve','Discreet tonal identification'],fitNote:'The intended fit is oversized: room through the chest, a dropped shoulder and an easy silhouette.',featured:true},
  {id:'form-training-tee',name:'Form Training Tee',category:'Move',wearer:'Men',fit:'Fitted',colour:'Carbon',hex:'#202220',image:'training-tee',number:'M / 01',description:'A closer silhouette for training days. Clean lines keep it just as considered outside the gym.',details:['Close-to-body silhouette','Uncomplicated crew neckline','Understated X detail'],fitNote:'The intended fit follows the chest and arms with less excess fabric. It is a fitted tee, not a compression garment.',featured:true},
  {id:'field-overshirt',name:'Field Overshirt',category:'Utility',wearer:'Men',fit:'Regular',colour:'Shale',hex:'#777771',image:'utility-overshirt',number:'U / 01',description:'A considered overshirt for the field, the road and the end of the day. Practical in spirit, restrained in appearance.',details:['Clean collar and front closure','Low-profile pocket direction','Layering silhouette'],fitNote:'A regular silhouette with space for a tee underneath. The final cut will be confirmed during sampling.',featured:true},
  {id:'transit-layer',name:'Transit Layer',category:'Transit',wearer:'Women',fit:'Relaxed',colour:'Quartz',hex:'#b9b3a8',image:'transit-layer',number:'T / 01',description:'An easy layer for early starts and changing plans. Soft proportions bring a little space to the everyday.',details:['Relaxed layering proportions','Minimal front closure','Coordinated tonal styling'],fitNote:'The intended fit is relaxed through the body, designed to sit comfortably over a light base layer.',featured:true},
  {id:'form-training-set',name:'Form Training Set',category:'Move',wearer:'Women',fit:'Fitted',colour:'Chalk',hex:'#e9e6df',image:'move-set',number:'M / 02',description:'A fitted top with easy training shorts. A simple, connected direction for movement and downtime.',details:['Fitted top and relaxed shorts','Clean, tonal treatment','Minimal visible branding'],fitNote:'A close-fitting top paired with a more relaxed short. Support level and final measurements are still in development.'},
  {id:'field-trouser',name:'Field Trouser',category:'Utility',wearer:'Women',fit:'Regular',colour:'Graphite',hex:'#454744',image:'field-trouser',number:'U / 02',description:'A clean utility trouser with practical pocketing. Made to anchor the wardrobe wherever the day takes you.',details:['Straight-leg direction','Integrated pocket placement','Restrained utility detailing'],fitNote:'A regular, straight-leg direction. Rise, inseam options and the graded size chart will follow sampling.'},
  {id:'utility-shell',name:'Utility Shell',category:'Utility',wearer:'Men',fit:'Regular',colour:'Obsidian',hex:'#111211',image:'utility-shell',number:'U / 03',description:'A protective outer-layer concept with a pared-back profile. Considered coverage for the days spent outside.',details:['Hooded outer-layer direction','Discreet closures','Space for light layering'],fitNote:'A regular layering silhouette. Weather protection and material performance will be specified only after testing.'},
  {id:'move-jacket',name:'Move Jacket',category:'Move',wearer:'Women',fit:'Fitted',colour:'Obsidian',hex:'#111211',image:'move-jacket',number:'M / 03',description:'A streamlined layer for the moments before and after movement. Close, clean and easy to combine.',details:['Shaped, close-to-body direction','Minimal zip front','Quiet tonal identity'],fitNote:'A fitted silhouette with shaped seams. Final stretch, support and measurements remain subject to development.'}
];
export const fits = [
  {name:'Oversized',title:'A little more room.',description:'A generous body, dropped shoulder and easy sleeve. A deliberate silhouette for everyday wear.',product:'everyday-tee'},
  {name:'Fitted',title:'Close. Clean. Considered.',description:'A shape that follows the body. For training and a more defined everyday silhouette.',product:'form-training-tee'},
  {name:'Regular',title:'Room to get on with it.',description:'Balanced proportions and space for a light layer. The centre of the utility wardrobe.',product:'field-overshirt'},
  {name:'Relaxed',title:'Ease, in proportion.',description:'A little room through the body, without the extra volume of an oversized fit.',product:'transit-layer'}
];
export function selectProducts({category='',wearer='',fit='',query=''}={}) {
  const term=query.trim().toLowerCase();
  return products.filter(p=>(!category||p.category===category)&&(!wearer||p.wearer===wearer)&&(!fit||p.fit===fit)&&(!term||`${p.name} ${p.category} ${p.wearer} ${p.fit} ${p.colour}`.toLowerCase().includes(term)));
}
export function validateEdit(value) {
  if(!Array.isArray(value)) return [];
  const seen=new Set();
  return value.filter(item=>{
    if(!item || !products.some(p=>p.id===item.id) || !['XS','S','M','L','XL','XXL','Undecided'].includes(item.size)) return false;
    const key=`${item.id}:${item.size}`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).map(({id,size})=>({id,size}));
}
