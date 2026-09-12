export default function OperationsEntry() {
  return <main className="ops-shell ops-entry ops-workspace-chooser" id="main-content">
    <p className="ops-eyebrow">MineralX / Operations</p>
    <h1>Choose a workspace.</h1>
    <p>Use the shared staff workspace for company records, Meetings for private JV material, or the device workspace for local field and planning work.</p>
    <div className="ops-workspace-choices">
      <section className="ops-card">
        <p className="ops-eyebrow">STAFF</p>
        <h2>Operations</h2>
        <p>Programs, field records, processing, gold, plant and controlled reporting.</p>
        <a className="ops-primary" href="/ops/login">Sign in</a>
      </section>
      <section className="ops-card">
        <p className="ops-eyebrow">PRIVATE</p>
        <h2>JV meetings</h2>
        <p>Verified access to private meeting notes, revisions and actions.</p>
        <a className="ops-primary" href="/ops/meetings">Open meetings</a>
      </section>
      <section className="ops-card">
        <p className="ops-eyebrow">THIS DEVICE</p>
        <h2>Field workspace</h2>
        <p>Local geology, pit, exploration and planning tools stored on this browser.</p>
        <a className="ops-primary" href="/ops?mode=development">Open workspace</a>
      </section>
    </div>
  </main>;
}
