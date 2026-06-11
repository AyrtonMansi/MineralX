import { Preloader } from "@/components/Preloader";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Overview } from "@/components/Overview";
import { MissionStatement } from "@/components/MissionStatement";
import { OperatingFocus } from "@/components/OperatingFocus";
import { Commodities } from "@/components/Commodities";
import { Approach } from "@/components/Approach";
import { Operate } from "@/components/Operate";
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
        <MissionStatement />
        <OperatingFocus />
        <Commodities />
        <Approach />
        <Operate />
        <Investors />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
