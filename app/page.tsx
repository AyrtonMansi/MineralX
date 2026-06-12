import { Preloader } from "@/components/Preloader";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Overview } from "@/components/Overview";
import { OperatingFocus } from "@/components/OperatingFocus";
import { Commodities } from "@/components/Commodities";
import { SectionBreak } from "@/components/SectionBreak";
import { Approach } from "@/components/Approach";
import { Investors } from "@/components/Investors";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Preloader />
      <Navbar />
      <main>
        <Hero />
        <Overview />
        <OperatingFocus />
        <Commodities />
        <SectionBreak />
        <Approach />
        <Investors />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
