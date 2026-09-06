import { configured } from "@/lib/gic/server";
import { LoginForm } from "@/components/gic/LoginForm";
export default function LoginPage() {
  return (
    <main id="main-content" className="gic-login">
      <span className="gic-kicker">Processing records</span>
      <h1>Sign in to GIC</h1>
      <p className="gic-muted">
        Your runs, gold production and annual reporting in one place.
      </p>
      <LoginForm active={configured()} />
      <p className="gic-caption">
        Access is assigned by your MineralX administrator.
      </p>
    </main>
  );
}
