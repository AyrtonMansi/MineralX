import Link from "next/link";
export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="container-site min-h-[70vh] pb-24 pt-40"
    >
      <p className="eyebrow">404 / Page not found</p>
      <h1 className="display mt-6 max-w-2xl text-[28px] md:text-[36px]">
        Find your way forward.
      </h1>
      <p className="body-copy mt-6 max-w-lg">
        This page is unavailable. Explore MineralX from the homepage or contact
        the team.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link href="/" className="btn btn-ghost">
          MineralX home
        </Link>
        <Link href="/contact" className="btn btn-ghost">
          Contact
        </Link>
      </div>
    </main>
  );
}
