import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PageIntro } from "@/components/Corporate";
import { getArticles } from "@/lib/articles";

// Rendered outside the (corporate) layout, so it brings its own navigation:
// a visitor on a dead link should still be one click from anywhere.
export default function NotFound() {
  return (
    <>
      <Navbar hasUpdates={getArticles().length > 0} />
      <main id="main-content" tabIndex={-1}>
        <PageIntro
          label="404 · Page not found"
          title="Find your way"
          accent="forward."
          intro="This page is unavailable. Explore MineralX from the homepage or contact the team."
        />
        <div className="container-site flex flex-wrap gap-4 py-16 md:py-24">
          <Link href="/" className="btn btn-primary">
            MineralX home
          </Link>
          <Link href="/direction" className="btn btn-ghost">
            Our direction
          </Link>
          <Link href="/contact" className="btn btn-ghost">
            Contact
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
