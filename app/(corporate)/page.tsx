import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Headline, SectionMark, TextLink, revealDelay } from "@/components/Corporate";
import { Photo, PhotoCaption } from "@/components/Photo";
import { ArrowRight } from "@/components/icons";
import { company, themes, principles, photos } from "@/lib/content";

const themeLink: Record<string, string> = {
  resources: "Explore resources",
  research: "Explore research",
  industry: "Explore industry",
};

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Hero />

      {/* 01 — Overview: asymmetric editorial statement over two reading columns. */}
      <section id="overview" className="border-b border-line py-28 md:py-40">
        <div className="container-site">
          <div data-reveal="">
            <SectionMark>The company</SectionMark>
            <Headline
              text="Resources at our core."
              accent="A wider view ahead."
              className="t-display-lg mt-10 max-w-5xl"
            />
          </div>
          <div className="mt-16 grid gap-10 md:mt-24 md:grid-cols-12">
            <p
              data-reveal=""
              className="t-lead md:col-span-5 md:col-start-5 lg:col-span-4 lg:col-start-5"
            >
              MineralX brings a long-term perspective to Australian resources.
              Our direction connects mining opportunities with mineral
              processing, applied research and the development of industrial
              capability.
            </p>
            <div
              data-reveal=""
              style={revealDelay(120)}
              className="md:col-span-3 lg:col-span-3 lg:col-start-10"
            >
              <p className="body-copy">
                We pursue progress through focused execution, considered
                investment and relationships that bring complementary expertise
                together.
              </p>
              <div className="mt-8">
                <TextLink href="/company">About MineralX</TextLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 02 — Direction: the field itself as backdrop, focus areas as a divided register. */}
      <section
        id="focus"
        className="relative isolate overflow-hidden border-b border-line"
      >
        <div data-reveal-media="" className="absolute inset-0 -z-10 bg-black">
          <Photo
            photo={photos.landscape}
            decorative
            className="object-[center_78%]"
          />
          <div className="absolute inset-0 bg-black/25" />
          <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-black via-black/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/85 to-transparent" />
        </div>
        <div className="container-site pb-12 pt-28 md:pb-16 md:pt-40">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div data-reveal="">
              <SectionMark>Our direction</SectionMark>
              <Headline
                text="One connected"
                accent="ambition."
                className="t-display-lg mt-10"
              />
            </div>
            <PhotoCaption>{photos.landscape.caption}</PhotoCaption>
          </div>
          <div className="mt-44 grid border-t border-white/20 md:mt-72 md:grid-cols-3">
            {themes.map((t, i) => (
              <article
                key={t.id}
                data-reveal=""
                style={revealDelay(i * 110)}
                className={`group flex flex-col border-b border-white/10 py-10 md:border-b-0 md:px-10 md:first:pl-0 md:last:pr-0 ${i > 0 ? "md:border-l md:border-white/15" : ""}`}
              >
                <h3 className="t-title text-[22px] md:text-[24px]">
                  {t.title}
                </h3>
                <p className="mt-5 max-w-sm flex-1 text-[15px] leading-[1.7] text-white/70">
                  {t.body}
                </p>
                <div className="mt-8">
                  <TextLink href={`/direction#${t.id}`}>
                    {themeLink[t.id]}
                  </TextLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 03 — Approach: diagonal photographic split. */}
      <section id="approach" className="border-b border-line bg-ink-900">
        <div className="grid lg:grid-cols-2">
          {/* Diagonal right edge echoes the angled photo crops of the brand's print work. */}
          <figure
            data-reveal-media=""
            className="relative min-h-[380px] overflow-hidden md:min-h-[520px] lg:[clip-path:polygon(0_0,100%_0,84%_100%,0_100%)]"
          >
            <Photo
              photo={photos.operations}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="absolute inset-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/25" />
            <figcaption className="absolute bottom-7 left-6 md:left-10 xl:left-16">
              <PhotoCaption>{photos.operations.caption}</PhotoCaption>
            </figcaption>
          </figure>
          <div className="pr-container px-6 py-24 md:px-10 md:py-32 lg:pl-8">
            <div data-reveal="">
              <SectionMark>Our approach</SectionMark>
              <Headline
                text="Ambition, backed by"
                accent="discipline."
                className="t-display-md mt-10 max-w-lg"
              />
            </div>
            <ol className="mt-14 border-t border-line">
              {principles.map((p, i) => (
                <li
                  key={p.title}
                  data-reveal=""
                  style={revealDelay(i * 100)}
                  className="border-b border-line py-8"
                >
                  <div>
                    <h3 className="t-title">{p.title}</h3>
                    <p className="body-copy mt-3 max-w-md">{p.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 04 — Investors & partnerships: the single closing invitation. */}
      <section
        id="investors"
        className="relative isolate overflow-hidden py-32 md:py-48"
      >
        <div data-reveal-media="" className="absolute inset-0 -z-10 bg-black">
          <Photo
            photo={photos.ranges}
            decorative
            className="object-[center_70%]"
          />
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-black/5" />
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black to-transparent" />
        </div>
        <div className="container-site grid gap-12 lg:grid-cols-12 lg:items-end">
          <div data-reveal="" className="lg:col-span-8">
            <SectionMark>Investors & partnerships</SectionMark>
            <Headline
              text="Shared direction."
              accent="Lasting value."
              className="t-display-lg mt-10"
            />
            <p className="t-lead mt-9 max-w-xl">
              We welcome conversations with investors, industry partners and
              organisations aligned with the responsible development of
              Australian resources and industrial capability.
            </p>
          </div>
          <div
            data-reveal=""
            style={revealDelay(120)}
            className="flex flex-col items-start gap-4 lg:col-span-4 lg:items-end"
          >
            <Link href="/partnerships" className="btn btn-primary w-full sm:w-64">
              Partner with MineralX <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="btn btn-ghost w-full sm:w-64">
              Contact MineralX
            </Link>
            <a
              href={`mailto:${company.email}`}
              className="link-draw mt-3 text-[13px] text-white/70 hover:text-white"
            >
              {company.email}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
