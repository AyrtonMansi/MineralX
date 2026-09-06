import { configured } from "@/lib/gic/server";
import { LoginForm } from "@/components/gic/LoginForm";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const plant = (await searchParams).next === "/plant";
  return (
    <main id="main-content" className="gic-login">
      <span className="gic-kicker">
        {plant ? "Plant workspace" : "Processing records"}
      </span>
      <h1>{plant ? "Sign in to MineralX" : "Sign in to GIC"}</h1>
      <p className="gic-muted">
        {plant
          ? "Open your processing plant plan and equipment register."
          : "Your runs, gold production and annual reporting in one place."}
      </p>
      <LoginForm active={configured()} next={plant ? "/plant" : "/gic"} />
      <p className="gic-caption">
        Access is assigned by your MineralX administrator.
      </p>
    </main>
  );
}
