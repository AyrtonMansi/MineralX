import { Hero } from "@/components/Hero";
import { PartnerCTA, TextLink } from "@/components/Corporate";
import { themes, principles } from "@/lib/content";

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
      <section id="focus" className="py-20 md:py-28">
        <div className="container-site">
          <p className="eyebrow">Our direction</p>
          <h2 className="display mt-5 max-w-3xl text-2xl md:text-[28px]">
            One connected ambition.
          </h2>
          <div className="mt-12 grid border-t border-line md:grid-cols-3">
            {themes.map((t) => (
              <article key={t.id} className="border-b border-line py-9 md:pr-9">
                <p className="eyebrow">{t.index}</p>
                <h3 className="mt-8 text-lg font-medium md:text-xl">
                  {t.title}
                </h3>
                <p className="body-copy mt-4 max-w-sm">{t.body}</p>
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
      <section
        id="approach"
        className="border-y border-line bg-ink-900 py-20 md:py-28"
      >
        <div className="container-site grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Our approach</p>
            <h2 className="display mt-5 max-w-lg text-2xl md:text-[28px]">
              Ambition, backed by discipline.
            </h2>
          </div>
          <div className="divide-y divide-line">
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
        <PartnerCTA />
      </div>
    </main>
  );
}
