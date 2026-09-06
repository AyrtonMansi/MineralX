import {campaignHero,syncCampaignHeader} from './hero.js';
import {brand,categories,products,fits,selectProducts,validateEdit} from './catalog.js';

const main=document.querySelector('#main');
const dialog=document.querySelector('#overlay');
const panel=document.querySelector('#overlay-content');
const storageKey='mineralx-clothing-edit-v1';
const arrow='<span aria-hidden="true">↗</span>';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asset=name=>`./assets/${name}.webp`;
const link=(params={})=>'#/collection'+(Object.keys(params).length?'?'+new URLSearchParams(params):'');
let saved=[];
let overlayTrigger;
let toastTimer;
let storageAvailable=true;
let navigating=false;
try{saved=validateEdit(JSON.parse(localStorage.getItem(storageKey)||'[]'));}catch{}

function announce(message){
  const toast=document.querySelector('#announcement');
  clearTimeout(toastTimer);toast.textContent=message;toast.classList.add('visible');
  toastTimer=setTimeout(()=>toast.classList.remove('visible'),3500);
}
function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(saved));storageAvailable=true;}catch{storageAvailable=false;}
  syncEditBadge();
  return storageAvailable;
}
function syncEditBadge(){
  document.querySelector('#edit-count').textContent=saved.length;
  document.querySelector('.edit-toggle').setAttribute('aria-label',`Open your saved edit, ${saved.length} pieces`);
}
function card(p){return `<article class="product-card"><a class="product-image" href="#/product/${p.id}" aria-label="Explore ${p.name}"><img src="${asset(p.image)}" width="426" height="624" loading="lazy" alt="${esc(p.colour)} ${esc(p.name)} concept, styled on a model"><span class="product-number">${p.number}</span><span class="product-explore">Explore piece ${arrow}</span></a><div class="product-meta"><div><p class="eyebrow">${p.category}</p><h3><a href="#/product/${p.id}">${p.name}</a></h3><p class="product-fit">${p.fit} <span aria-hidden="true">·</span> ${p.colour}</p></div><span class="swatch" style="--swatch:${p.hex}" title="${p.colour}"><span class="sr-only">${p.colour}</span></span></div></article>`;}
function categoryCard(c){return `<a class="category-card" href="${link({category:c.name})}"><img src="${asset(c.image)}" alt="${c.name} clothing concepts in an everyday setting" width="1087" height="612" loading="lazy"><div><span class="eyebrow">${c.number} / ${c.name}</span><h3>${c.line}</h3><span class="category-arrow" aria-hidden="true">↗</span></div></a>`;}
function setTitle(title){document.title=`${title} — ${brand.name} | ${brand.endorsement}`;}
function home(){
 setTitle('Utility. Movement. Everyday.');
 return `${campaignHero()}
 <nav class="category-strip" aria-label="Shop by category">${categories.map(c=>`<a href="${link({category:c.name})}"><span>${c.number}</span>${c.name}${arrow}</a>`).join('')}</nav>
 <section id="collection-preview" class="section collection-section" tabindex="-1" aria-labelledby="collection-heading"><div class="section-heading"><div><p class="eyebrow">THE FIRST COLLECTION</p><h2 id="collection-heading">Meet your everyday rotation.</h2></div><a class="text-link" href="${link()}">View all pieces ${arrow}</a></div><div class="product-grid">${products.filter(p=>p.featured).map(card).join('')}</div></section>
 <section class="brand-statement"><p class="eyebrow">ONE SYSTEM. MANY SETTINGS.</p><h2>Early starts. Open roads.<br>Time well spent.</h2><div><p>A wardrobe shaped by work, movement and life outside. Refined fits. Mineral tones. Details with a reason to be there.</p><a class="text-link" href="#/world">The world of X ${arrow}</a></div></section>
 <section class="category-grid" aria-label="Explore the four categories">${categories.map(categoryCard).join('')}</section>
 <section class="fit-feature"><div class="fit-feature-images"><img src="${asset('essential-tee')}" alt="Chalk everyday tee with an easy silhouette" width="426" height="624" loading="lazy"><img src="${asset('training-tee')}" alt="Carbon training tee with a closer silhouette" width="426" height="624" loading="lazy"><span class="fit-label left">01 / OVERSIZED</span><span class="fit-label right">02 / FITTED</span></div><div class="fit-feature-copy"><p class="eyebrow">SAME OUTLOOK. YOUR FIT.</p><h2>Room to relax.<br>Form to move.</h2><p>A generous everyday tee. A closer training silhouette. Different proportions, the same considered approach.</p><a class="button button-dark" href="#/fits">Find your fit ${arrow}</a></div></section>
 <section class="craft-teaser section"><img src="./assets/tonal-detail.jpeg" width="1087" height="612" loading="lazy" alt="Close view of a tonal X mark on light fabric"><div><p class="eyebrow">QUIET BY DESIGN</p><h2>The difference<br>is in the detail.</h2><p>Considered pocketing. Restrained hardware. A tonal mark. Each detail starts with a purpose.</p><a class="text-link" href="#/detail">Take a closer look ${arrow}</a></div></section><section class="closing-note"><p class="eyebrow">MINERAL / 01</p><h2>Less noise. More possibility.</h2><a class="text-link" href="${link()}">Explore the collection ${arrow}</a></section>`;
}
function collection(params){
 const category=categories.some(c=>c.name===params.get('category'))?params.get('category'):'';
 const wearer=['Men','Women'].includes(params.get('wearer'))?params.get('wearer'):'';
 const fit=fits.some(f=>f.name===params.get('fit'))?params.get('fit'):'';
 const query=params.get('query')||'';
 const data=selectProducts({category,wearer,fit,query});
 const cat=categories.find(c=>c.name===category);
 const title=category|| (wearer?`${wearer}’s collection`:'The collection');
 setTitle(title);
 return `<section class="catalog-header section"><p class="eyebrow">MINERAL / 01 — COLLECTION PREVIEW</p><h1>${title}</h1><p>${cat?cat.description:'Utility, movement and everyday pieces. One considered wardrobe.'}</p></section>
 <section class="catalog-body section"><form id="filters" class="filters" role="search" aria-label="Filter collection"><div class="filter-fields"><label>Category<select name="category"><option value="">All pieces</option>${categories.map(c=>`<option ${c.name===category?'selected':''}>${c.name}</option>`).join('')}</select></label><label>Wearer<select name="wearer"><option value="">Everyone</option>${['Men','Women'].map(v=>`<option ${v===wearer?'selected':''}>${v}</option>`).join('')}</select></label><label>Fit<select name="fit"><option value="">All fits</option>${fits.map(f=>`<option ${f.name===fit?'selected':''}>${f.name}</option>`).join('')}</select></label><label class="filter-search">Search<input name="query" type="search" value="${esc(query)}" placeholder="A piece, a fit, a colour…" autocomplete="off"></label><button class="filter-apply" type="submit">Apply</button></div><div class="filter-summary"><span role="status">${data.length} ${data.length===1?'piece':'pieces'}</span>${category||wearer||fit||query?'<a href="#/collection">Clear filters</a>':'<span>First collection</span>'}</div></form>
 ${data.length?`<div class="product-grid catalog-grid">${data.map(card).join('')}</div>`:`<div class="empty-state"><p class="eyebrow">NOTHING HERE JUST YET</p><h2>Give your search a little room.</h2><p>Try another fit or explore the full collection.</p><a class="button button-dark" href="#/collection">Clear filters ${arrow}</a></div>`}
 <p class="catalog-note">A first look at the range. Final pieces, materials, sizing and pricing will be confirmed at release.</p></section>`;
}
function product(id){
 const p=products.find(p=>p.id===id);if(!p)return notFound();setTitle(p.name);
 const others=products.filter(q=>q.id!==p.id).sort((a,b)=>Number(b.category===p.category)-Number(a.category===p.category)).slice(0,4);
 return `<nav class="breadcrumbs section" aria-label="Breadcrumb"><a href="#/collection">Collection</a><span>/</span><a href="${link({category:p.category})}">${p.category}</a><span>/</span><span>${p.name}</span></nav>
 <section class="product-detail section"><div class="detail-gallery"><img src="${asset(p.image)}" width="426" height="624" alt="${p.colour} ${p.name} concept shown on a model"><p>Design concept. Other pieces shown are styling references.</p></div><div class="detail-content"><p class="eyebrow">${p.number} — ${p.category.toUpperCase()}</p><h1>${p.name}</h1><p class="detail-subtitle">${p.fit} fit</p><p class="detail-description">${p.description}</p><div class="colour-detail"><span class="swatch selected" style="--swatch:${p.hex}"></span><span>${p.colour}<small>Concept colour</small></span></div><form id="save-piece" data-product="${p.id}"><fieldset><legend>Preferred size <button type="button" class="text-link" data-action="size" data-id="${p.id}">Fit notes ${arrow}</button></legend><div class="size-options">${['XS','S','M','L','XL','XXL'].map(s=>`<label><input type="radio" name="size" value="${s}"><span>${s}</span></label>`).join('')}</div><label class="size-undecided"><input type="radio" name="size" value="Undecided" checked> Decide later</label></fieldset><button class="button button-dark save-button" type="submit">Save to your edit <span aria-hidden="true">+</span></button><p class="save-note">${storageAvailable?"Keep your favourite pieces together in this browser.":"Storage is unavailable. Saved pieces last for this visit only."}</p></form><div class="release-status"><span class="eyebrow">COLLECTION PREVIEW</span><p>In development. Pricing and availability will be announced at release.</p><a class="text-link product-enquiry" href="mailto:${brand.contact}?subject=${encodeURIComponent(`X clothing — ${p.name} enquiry`)}">Enquire about this piece ${arrow}</a></div><details open><summary>Design direction</summary><ul>${p.details.map(d=>`<li>${d}</li>`).join('')}</ul></details><details><summary>Fit & proportions</summary><p>${p.fitNote}</p><p>Size choices record your preference only. Final measurements and available sizes are not yet confirmed.</p></details><details><summary>Materials & care</summary><p>Fabric composition, performance and care instructions will be published after sampling and testing. This preview shows the intended design direction.</p></details><details><summary>Release & ordering</summary><p>This piece is not yet available to order. Saving it to your edit does not place an order or reserve stock.</p><a class="text-link" href="#/information/release">Release information ${arrow}</a></details></div></section>
 <section class="section related"><div class="section-heading"><div><p class="eyebrow">PART OF THE SAME WARDROBE</p><h2>Keep it connected.</h2></div><a class="text-link" href="#/collection">Explore all ${arrow}</a></div><div class="product-grid">${others.map(card).join('')}</div></section>`;
}
function world(){setTitle('The world of X');return `<section class="world-intro section"><p class="eyebrow">THE WORLD OF X</p><h1>Capable by nature.<br>Considered by design.</h1><p>X begins in the space between work, movement and everyday life. A wardrobe with the utility to do more, and the restraint to feel at home wherever you take it.</p></section><div class="world-image"><img src="${asset('weekend-campaign')}" alt="Understated clothing on an open coastal headland" width="1672" height="941"></div><section class="world-story section"><p class="eyebrow">BY MINERALX</p><div><h2>A different kind<br>of everyday.</h2><p>Born from the MineralX outlook: practical, curious and connected to the world outside. The clothing direction brings together the durability of workwear, the ease of activewear and the restraint of modern lifestyle clothing.</p><p>The connection lives in the details. Mineral colours. Quiet identification. A practical approach to how a garment should feel and function.</p></div></section><section class="principles section">${[{n:'01',t:'Quiet',p:'Recognition through proportion, material and detail. Branding stays considered.'},{n:'02',t:'Technical',p:'Every seam, pocket and closure should earn its place.'},{n:'03',t:'Natural',p:'A mineral palette, tactile surfaces and a connection to the landscape.'},{n:'04',t:'Capable',p:'One wardrobe, with room for the different parts of your day.'}].map(p=>`<article><span class="eyebrow">${p.n}</span><h3>${p.t}</h3><p>${p.p}</p></article>`).join('')}</section><section class="palette-section section"><div><p class="eyebrow">THE MINERAL PALETTE</p><h2>Grounded in colour.</h2><p>Chalk to obsidian. A tonal language that makes the whole wardrobe work together.</p></div><div class="palette">${[['Chalk','#e9e6df'],['Silica','#d4d0c7'],['Quartz','#b9b3a8'],['Shale','#777771'],['Graphite','#454744'],['Obsidian','#111211']].map(([n,h])=>`<div><span style="background:${h}"></span><p>${n}</p></div>`).join('')}</div></section><section class="closing-note"><p class="eyebrow">ONE SYSTEM. MANY SETTINGS.</p><h2>Meet the first collection.</h2><a class="button button-dark" href="#/collection">Explore MINERAL / 01 ${arrow}</a></section>`;}
function fitPage(){setTitle('Find your fit');return `<section class="catalog-header section"><p class="eyebrow">PROPORTION MAKES THE DIFFERENCE</p><h1>Same outlook. Your fit.</h1><p>Choose the silhouette that feels like you.</p></section><section class="fit-grid section">${fits.map(f=>{const p=products.find(p=>p.id===f.product);return `<article class="fit-card"><img src="${asset(p.image)}" alt="${f.name} fit concept" width="426" height="624" loading="lazy"><div><p class="eyebrow">${f.name}</p><h2>${f.title}</h2><p>${f.description}</p><a class="text-link" href="${link({fit:f.name})}">Explore ${f.name.toLowerCase()} ${arrow}</a></div></article>`;}).join('')}</section><section class="fit-information section"><h2>A note on sizing.</h2><p>These are intended silhouettes, shown through design concepts. Final garment measurements and size availability will be confirmed after sampling. You can save a preferred size to your edit now and decide once the final size guides are available.</p></section>`;}
function detailPage(){
 setTitle('In the detail');
 const details=[
  {number:'01',title:'Identity, kept quiet.',image:'tonal-detail',alt:'A tonal X mark integrated into light fabric',body:'A tonal mark should feel part of a garment. The X direction favours restrained placement and recognition through material, proportion and repetition.',note:'Tonal application · Design direction'},
  {number:'02',title:'A reason for every detail.',image:'hardware-detail',alt:'Close view of black hardware with a discreet X identifier',body:'Closures and adjustments are part of the way you use a piece. The design direction brings identification into the hardware itself, keeping the overall silhouette clean.',note:'Integrated hardware · Design direction'},
  {number:'03',title:'Utility in the everyday.',image:'pocket-detail',alt:'Low-profile pocketing in a light-toned utility garment',body:'A place for what you carry, without adding unnecessary bulk. Concealed and low-profile pockets connect the field wardrobe with travel and daily life.',note:'Considered pocketing · Design direction'}
 ];
 return `<section class="catalog-header section"><p class="eyebrow">QUIET BY DESIGN</p><h1>The difference<br>is in the detail.</h1><p>Built for everything between. A closer look at the proposed construction and identification language of X.</p></section><section class="craft-stories section" aria-label="Garment design details">${details.map(d=>`<article class="craft-story"><figure><img src="./assets/${d.image}.jpeg" width="1087" height="612" loading="lazy" alt="${d.alt}"><figcaption>${d.note}</figcaption></figure><div><p class="eyebrow">${d.number} / MINERAL / 01</p><h2>${d.title}</h2><p>${d.body}</p></div></article>`).join('')}</section><section class="fit-information section"><h2>From idea to evidence.</h2><div><p>These details come from the supplied X brand concepts. Final fabrics, construction and durability will be confirmed through sampling and testing.</p><a class="text-link" href="#/information/product">Product development ${arrow}</a></div></section><section class="closing-note"><p class="eyebrow">ONE SYSTEM. MANY SETTINGS.</p><h2>Find your everyday rotation.</h2><a class="button button-dark" href="#/collection">Explore the collection ${arrow}</a></section>`;
}
function information(topic){
 const pages={release:{title:'A first look.',eyebrow:'RELEASE INFORMATION',body:'<p>MINERAL / 01 is the first collection direction from X by MineralX. The range is currently in development.</p><h2>When can I order?</h2><p>Release timing, final products, pricing and available sizes have not yet been announced. Ordering is not open.</p><h2>What is “Your edit”?</h2><p>A place to save the pieces and preferred sizes you like, on this device. Your edit is a personal shortlist. It does not reserve a product, place an order or subscribe you to updates.</p><h2>What happens at release?</h2><p>Final product specifications, size guides, delivery information and returns terms will accompany the released collection.</p>'},product:{title:'From concept to collection.',eyebrow:'PRODUCT DEVELOPMENT',body:'<p>The imagery and product descriptions in this preview communicate a design direction. The supplied brand concepts and campaign imagery include AI-generated visualisations.</p><h2>The next stage</h2><p>Silhouettes, materials, construction, colours and sizing remain subject to sampling and approval. Product names in this preview are working names.</p><h2>Performance with evidence</h2><p>Material composition, durability, weather protection and other performance specifications will be published when they have been confirmed through product development and testing.</p><h2>Utility in everyday life</h2><p>These are lifestyle clothing concepts. No protective-workwear certification is represented by this preview.</p>'},privacy:{title:'Your edit stays with you.',eyebrow:'PRIVACY',body:'<p>This preview does not collect contact details, accept payments or include analytics or advertising trackers.</p><h2>Saved on your device</h2><p>When you save a piece, its product reference and your preferred size are stored in this browser’s local storage. They are not sent to MineralX and do not sync between devices.</p><h2>Removing your saved pieces</h2><p>You can remove individual pieces in Your edit, clear the edit there, or delete this site’s browser data. Clearing browser data will remove your saved edit.</p><h2>Access and hosting</h2><p>The hosting provider may process information needed to deliver the site and manage access. This page describes the clothing preview; it does not replace the hosting platform’s privacy terms.</p>'}};
 const p=pages[topic];if(!p)return notFound();setTitle(p.eyebrow.toLowerCase());return `<article class="information-page section"><p class="eyebrow">${p.eyebrow}</p><h1>${p.title}</h1><div>${p.body}</div><a class="text-link" href="#/collection">Explore the collection ${arrow}</a></article>`;
}
function notFound(){setTitle('Page not found');return `<section class="empty-state section"><p class="eyebrow">A SMALL DETOUR</p><h1>This page isn’t here.</h1><a class="button button-dark" href="#/collection">Back to the collection ${arrow}</a></section>`;}
function route({focus=true}={}){
 const hash=location.hash.slice(1)||'/';if(hash==='main'){main.focus();return;}
 const [path,query]=hash.split('?');const params=new URLSearchParams(query);
 if(dialog.open){navigating=true;closeOverlay();}
 main.innerHTML=path==='/'?home():path==='/collection'?collection(params):path.startsWith('/product/')?product(path.slice(9)):path==='/world'?world():path==='/fits'?fitPage():path==='/detail'?detailPage():path.startsWith('/information/')?information(path.slice(13)):notFound();
 syncCampaignHeader(path==='/');
 document.querySelectorAll('.desktop-nav a').forEach(a=>{const active=a.hash===location.hash;a.toggleAttribute('aria-current',active);if(active)a.setAttribute('aria-current','page');});
 window.scrollTo({top:0,behavior:'instant'});if(focus)main.focus({preventScroll:true});
}
function openOverlay(title,kind,content){
 overlayTrigger=document.activeElement;dialog.className=kind;document.querySelector('#overlay-title').textContent=title;panel.innerHTML=content;
 if(!dialog.open)dialog.showModal();document.body.classList.add('modal-open');
}
function closeOverlay(){dialog.close();}
dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');if(!navigating&&overlayTrigger?.isConnected)overlayTrigger.focus({preventScroll:true});navigating=false;});
dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeOverlay();}});
function editContents(){return saved.length?`<p class="panel-intro">The pieces you’re drawn to. ${storageAvailable?'Saved in this browser.':'Browser storage is unavailable; this selection lasts for this visit only.'}</p><div class="saved-list">${saved.map((item,i)=>{const p=products.find(p=>p.id===item.id);return `<article class="saved-item"><a href="#/product/${p.id}" data-action="navigate"><img src="${asset(p.image)}" width="426" height="624" alt="${p.name}"></a><div><p class="eyebrow">${p.category}</p><h3><a href="#/product/${p.id}" data-action="navigate">${p.name}</a></h3><p>${p.colour} · ${p.fit}</p><label>Preferred size<select data-edit-index="${i}">${['Undecided','XS','S','M','L','XL','XXL'].map(s=>`<option ${s===item.size?'selected':''}>${s}</option>`).join('')}</select></label><button class="remove-item" data-action="remove" data-index="${i}">Remove</button></div></article>`;}).join('')}</div><div class="edit-bottom"><p class="eyebrow">${saved.length} ${saved.length===1?'PIECE':'PIECES'} IN YOUR EDIT</p><p>Collection in development. This edit is a shortlist, not an order.</p><button class="button button-dark" data-action="copy">Copy your edit ${arrow}</button><button class="text-link clear-edit" data-action="clear">Clear edit</button></div>`:`<div class="empty-state"><p class="eyebrow">MAKE IT YOURS</p><h3>Your edit starts here.</h3><p>Save your favourite pieces and build a wardrobe around the way you spend your days.</p><a class="button button-dark" href="#/collection" data-action="navigate">Explore the collection ${arrow}</a></div>`;}
function showEdit(){openOverlay('Your edit','edit-panel',editContents());}
function refreshEdit(){panel.innerHTML=editContents();panel.querySelector('a,button')?.focus();}
function showSearch(){openOverlay('Find your next everyday.','search-panel',`<form id="search-form"><label class="sr-only" for="search-input">Search collection</label><div class="search-field"><input id="search-input" type="search" name="query" placeholder="Search pieces, fits or colours" autocomplete="off"><button type="submit" aria-label="See all search results">${arrow}</button></div></form><div id="search-results" aria-live="polite"><p class="eyebrow">A GOOD PLACE TO START</p><div class="search-suggestions">${['Oversized','Fitted','Utility','Chalk'].map(s=>`<a href="${link({query:s})}" data-action="navigate">${s} ${arrow}</a>`).join('')}</div></div>`);document.querySelector('#search-input').focus();}
function menu(){openOverlay('Explore X','menu-panel',`<nav class="mobile-nav" aria-label="Mobile navigation"><a href="#/collection?wearer=Men" data-action="navigate">Men ${arrow}</a><a href="#/collection?wearer=Women" data-action="navigate">Women ${arrow}</a><a href="#/collection" data-action="navigate">The collection ${arrow}</a>${categories.map(c=>`<a class="mobile-category" href="${link({category:c.name})}" data-action="navigate">${c.name}</a>`).join('')}<a href="#/world" data-action="navigate">The world of X ${arrow}</a><a href="#/detail" data-action="navigate">In the detail ${arrow}</a><a href="#/fits" data-action="navigate">Find your fit ${arrow}</a></nav>`);}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el)return;
 const action=el.dataset.action;
 if(action==='close'||action==='navigate'){navigating=action==='navigate'&&el.hash!==location.hash;closeOverlay();}
 else if(action==='explore-below'){
  const collection=document.querySelector('#collection-preview');
  if(collection){collection.focus({preventScroll:true});collection.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
 }
 else if(action==='menu')menu();
 else if(action==='search')showSearch();
 else if(action==='edit')showEdit();
 else if(action==='size'){const p=products.find(p=>p.id===el.dataset.id);openOverlay('Fit notes','fit-panel',`<p class="eyebrow">${p.name} — ${p.fit}</p><p>${p.fitNote}</p><p>Final measurements are in development. Save a preferred size, or choose “Decide later”. Neither option reserves stock.</p><a class="text-link" href="#/fits" data-action="navigate">Explore all fits ${arrow}</a>`);}
 else if(action==='remove'){saved.splice(Number(el.dataset.index),1);persist();refreshEdit();announce('Piece removed from your edit.');}
 else if(action==='clear'){saved=[];persist();refreshEdit();announce('Your edit is cleared.');}
 else if(action==='copy'){
  const text=`X — By MineralX\nMINERAL / 01 — My edit\n\n${saved.map(i=>{const p=products.find(p=>p.id===i.id);return `${p.name} / ${p.colour} / ${p.fit} / Preferred size: ${i.size}`;}).join('\n')}\n\nCollection preview. Not an order or reservation.`;
  try{await navigator.clipboard.writeText(text);announce('Your edit is copied.');}catch{let area=panel.querySelector('#copy-fallback');if(!area){area=document.createElement('textarea');area.id='copy-fallback';area.readOnly=true;area.setAttribute('aria-label','Your edit — select and copy');panel.append(area);}area.value=text;area.focus();area.select();announce('Select and copy your edit below.');}
 }
});
document.addEventListener('submit',event=>{
 const form=event.target;
 if(form.id==='save-piece'){
  event.preventDefault();const data=new FormData(form);const item={id:form.dataset.product,size:data.get('size')||'Undecided'};
  if(saved.some(i=>i.id===item.id&&i.size===item.size)){announce('This piece is already in your edit.');return;}
  saved=validateEdit([...saved,item]);const ok=persist();announce(ok?'Saved to your edit.': 'Saved for this visit. Browser storage is unavailable.');
  form.querySelector('button[type="submit"]').textContent='Saved to your edit ✓';
 }else if(form.id==='filters'||form.id==='search-form'){
  event.preventDefault();const data=Object.fromEntries([...new FormData(form)].filter(([,v])=>v.trim()));
  const destination=link(data);if(dialog.open)closeOverlay();
  if(location.hash===destination)route();else location.hash=destination;
 }
});
document.addEventListener('change',event=>{
 if(event.target.closest('#filters') && event.target.tagName==='SELECT'){event.target.form.requestSubmit();}
 if(event.target.matches('[data-edit-index]')){const i=Number(event.target.dataset.editIndex);saved[i].size=event.target.value;saved=validateEdit(saved);persist();refreshEdit();announce('Size preference updated.');}
 if(event.target.closest('#save-piece'))event.target.form.querySelector('button[type="submit"]').innerHTML='Save to your edit <span aria-hidden="true">+</span>';
});
document.addEventListener('input',event=>{
 if(event.target.id!=='search-input')return;
 const query=event.target.value;const matches=selectProducts({query});
 document.querySelector('#search-results').innerHTML=query.trim()?`<p class="eyebrow">${matches.length} ${matches.length===1?'PIECE':'PIECES'} FOUND</p><div class="search-matches">${matches.length?matches.map(p=>`<a href="#/product/${p.id}" data-action="navigate"><img src="${asset(p.image)}" width="54" height="78" alt=""><span>${p.name}<small>${p.category} · ${p.fit}</small></span>${arrow}</a>`).join(''):'<p>Try a different piece, fit or colour.</p>'}</div>`:'<p class="panel-intro">Search for a piece, fit or mineral colour.</p>';
});
window.addEventListener('hashchange',()=>route());
window.addEventListener('storage',event=>{if(event.key===storageKey || event.key===null){try{saved=validateEdit(JSON.parse(event.newValue||'[]'));}catch{saved=[];}syncEditBadge();if(dialog.open&&dialog.classList.contains('edit-panel'))refreshEdit();}});
document.querySelector('#year').textContent=new Date().getFullYear();
persist();route({focus:false});
