export default function OperationsEntry() {
  return <main className="ops-shell ops-entry ops-workspace-chooser" id="main-content">
    <p className="ops-eyebrow">MineralX / workspaces</p>
    <h1>Choose the workspace that holds this work.</h1>
    <p>Each workspace has its own access, storage and recovery rules. Select one deliberately so records do not cross an unintended boundary.</p>
    <div className="ops-workspace-choices">
      <section className="ops-card">
        <p className="ops-eyebrow">SHARED OPERATIONS</p>
        <h2>Company workspace</h2>
        <p>Use this when your staff account has been commissioned for shared programs, field records, processing and controlled reports.</p>
        <a className="ops-primary" href="/ops/login">Staff sign in</a>
      </section>
      <section className="ops-card">
        <p className="ops-eyebrow">PRIVATE JV ARCHIVE</p>
        <h2>Meetings</h2>
        <p>Verified email access to JV notes, source revisions and reviewed action candidates.</p>
        <a className="ops-primary" href="/ops/meetings">Open private meetings</a>
      </section>
      <section className="ops-card">
        <p className="ops-eyebrow">LOCAL DEVICE TOOLS</p>
        <h2>Pits, geology & planning</h2>
        <p>Browser-local planning tools for device use. Export a recovery copy before changing devices.</p>
        <a className="ops-primary" href="/ops?mode=development">Open device workspace</a>
      </section>
    </div>
  </main>;
}
