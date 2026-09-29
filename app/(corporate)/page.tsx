import { Hero } from "@/components/Hero";
import { PartnerCTA, TextLink } from "@/components/Corporate";
import { Photo, PhotoCaption } from "@/components/Photo";
import { themes, principles, photos } from "@/lib/content";

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Hero />
      <section id="overview" className="border-b border-line py-20 md:py-28">
        <div className="container-site grid gap-10 lg:grid-cols-12">
          <p className="eyebrow lg:col-span-4">The company</p>
          <div className="lg:col-span-8">
            <h2 className="display max-w-3xl text-2xl md:text-[28px]">
              Resources at our core. A wider view ahead.
            </h2>
            <p className="body-copy mt-7 max-w-2xl">
              MineralX brings a long-term perspective to Australian resources.
              Our direction connects mining opportunities with mineral
              processing, applied research and the development of industrial
              capability.
            </p>
            <p className="body-copy mt-5 max-w-2xl">
              We pursue progress through focused execution, considered
              investment and relationships that bring complementary expertise
              together.
            </p>
            <div className="mt-7">
              <TextLink href="/company">About MineralX</TextLink>
            </div>
          </div>
        </div>
      </section>
      <section
        id="focus"
        className="relative isolate overflow-hidden border-b border-line"
      >
        <div className="absolute inset-0 -z-10 bg-black">
          <Photo
            photo={photos.landscape}
            decorative
            className="object-[center_78%]"
          />
          <div className="absolute inset-0 bg-black/25" />
          <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-black via-black/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/80 to-transparent" />
        </div>
        <div className="container-site pb-10 pt-24 md:pb-16 md:pt-32">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow text-white/70">Our direction</p>
              <h2 className="display mt-5 max-w-3xl text-2xl md:text-[36px]">
                One connected ambition.
              </h2>
            </div>
            <PhotoCaption>{photos.landscape.caption}</PhotoCaption>
          </div>
          <div className="mt-40 grid border-t border-white/15 md:mt-64 md:grid-cols-3">
            {themes.map((t, i) => (
              <article
                key={t.id}
                className={`border-b border-white/10 py-9 md:border-b-0 md:px-9 md:first:pl-0 ${i > 0 ? "md:border-l md:border-white/15" : ""}`}
              >
                <p className="eyebrow text-white/60">{t.index}</p>
                <h3 className="mt-6 text-lg font-medium md:text-xl">
                  {t.title}
                </h3>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
                  {t.body}
                </p>
                <div className="mt-6">
                  <TextLink href={`/direction#${t.id}`}>
                    Explore{" "}
                    {t.id === "resources"
                      ? "resources"
                      : t.id === "research"
                        ? "research"
                        : "industry"}
                  </TextLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="approach" className="border-b border-line bg-ink-900">
        <div className="grid lg:grid-cols-2">
          {/* Diagonal right edge echoes the angled photo crops of the brand's print work. */}
          <figure className="relative min-h-[360px] overflow-hidden md:min-h-[480px] lg:[clip-path:polygon(0_0,100%_0,84%_100%,0_100%)]">
            <Photo
              photo={photos.operations}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="absolute inset-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/25" />
            <figcaption className="absolute bottom-7 left-6 md:left-10">
              <PhotoCaption>{photos.operations.caption}</PhotoCaption>
            </figcaption>
          </figure>
          <div className="px-6 py-20 md:px-10 md:py-28 lg:pl-6 lg:pr-[max(2.5rem,calc((100vw_-_80rem)/2_+_2.5rem))]">
            <p className="eyebrow">Our approach</p>
            <h2 className="display mt-5 max-w-lg text-2xl md:text-[28px]">
              Ambition, backed by discipline.
            </h2>
            <div className="mt-12 divide-y divide-line">
              {principles.map((p, i) => (
                <div key={p.title} className="flex gap-6 py-6 first:pt-0">
                  <span className="eyebrow pt-1">0{i + 1}</span>
                  <div>
                    <h3 className="text-lg font-medium">{p.title}</h3>
                    <p className="body-copy mt-3">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section id="investors" className="py-20 md:py-28">
        <div className="container-site">
          <p className="eyebrow">Investors & partnerships</p>
          <h2 className="display mt-5 max-w-3xl text-2xl md:text-[28px]">
            Shared direction. Lasting value.
          </h2>
          <p className="body-copy mt-7 max-w-2xl">
            We welcome conversations with investors, industry partners and
            organisations aligned with the responsible development of Australian
            resources and industrial capability.
          </p>
          <div className="mt-7">
            <TextLink href="/partnerships">Partner with MineralX</TextLink>
          </div>
        </div>
      </section>
      <div id="contact">
        <PartnerCTA photo={photos.ranges} />
      </div>
    </main>
  );
}
