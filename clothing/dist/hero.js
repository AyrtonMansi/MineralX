// Self-contained campaign component, shared with the initial HTML at build verification.
export function campaignHero(){
  return `<section class="campaign-hero" aria-labelledby="campaign-title">
    <img class="campaign-image" src="./assets/hero-campaign-v2.webp" alt="Two people in carbon training wear and a chalk utility layer on a dramatic basalt coastline" width="1672" height="941" fetchpriority="high">
    <div class="campaign-copy">
      <p class="eyebrow campaign-kicker"><span aria-hidden="true"></span> UTILITY. MOVEMENT. EVERYDAY.</p>
      <h1 id="campaign-title">Built for <span>everything <span class="campaign-last-word">between.</span></span></h1>
      <p class="campaign-description">A considered wardrobe for life in motion.</p>
      <div class="campaign-actions"><a class="button campaign-cta" href="#/collection">Explore the collection <span aria-hidden="true">↗</span></a><a class="campaign-fit" href="#/fits">Find your fit <span aria-hidden="true">↗</span></a></div>
    </div>
    <div class="campaign-rail">
      <a class="campaign-edition" href="#/information/release"><span>MINERAL / 01</span><span>THE FIRST COLLECTION</span></a>
      <p class="campaign-settings">FIELD / TRAIN / EVERYDAY</p>
      <button class="campaign-scroll" data-action="explore-below"><span>Explore below</span><span class="campaign-scroll-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v16m-6-6 6 6 6-6"/></svg></span></button>
    </div>
  </section>`;
}

let heroObserver;
export function syncCampaignHeader(isHome){
  heroObserver?.disconnect();
  document.body.classList.toggle('home-view',isHome);
  document.body.classList.toggle('hero-in-view',isHome);
  if(!isHome)return;
  const hero=document.querySelector('.campaign-hero');
  if(!hero||!('IntersectionObserver' in window)){
    document.body.classList.remove('hero-in-view');
    return;
  }
  // Switch to a solid header before the next section reaches the navigation.
  heroObserver=new IntersectionObserver(([entry])=>{
    document.body.classList.toggle('hero-in-view',entry.isIntersecting);
  },{rootMargin:`-${document.querySelector('.header').offsetHeight}px 0px 0px 0px`});
  heroObserver.observe(hero);
}
