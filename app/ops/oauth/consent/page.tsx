import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {database, configured} from '@/lib/gic/server';
import {Message} from '@/components/ops/primitives';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title: 'Authorize MineralX connection', robots: {index: false, follow: false}};

export default async function OAuthConsentPage({searchParams}: {searchParams: Promise<{authorization_id?: string}>}) {
  const authorizationId = (await searchParams).authorization_id;
  if (!authorizationId || authorizationId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(authorizationId)) {
    return <section className="ops-card"><h1>Connection cannot be verified</h1><Message error>The authorization request is missing or invalid. Return to ChatGPT and reconnect MineralX.</Message></section>;
  }
  if (!configured()) {
    return <section className="ops-card"><h1>MineralX identity is unavailable</h1><Message error>The connection cannot be authorized until the identity service is configured.</Message></section>;
  }

  const db = await database();
  const {data: {user}} = await db.auth.getUser();
  const next = `/ops/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  if (!user) redirect(`/ops/login?next=${encodeURIComponent(next)}`);

  const {data, error} = await db.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return <section className="ops-card"><h1>Connection cannot be verified</h1><Message error>This authorization request has expired or is no longer valid. Return to ChatGPT and reconnect MineralX.</Message></section>;
  }
  if (!('authorization_id' in data)) redirect(data.redirect_url);

  const scopes = data.scope.split(/\s+/).filter(Boolean);
  return <>
    <header className="ops-heading"><div><p className="ops-eyebrow">MineralX / secure connection</p><h1>Authorize {data.client.name}</h1><p>Connect your named MineralX account. The client receives no database credentials and every action remains subject to your workspace permissions.</p></div></header>
    <section className="ops-card">
      <h2>Requested access</h2>
      <dl className="ops-facts">
        <div><dt>Client</dt><dd>{data.client.name}</dd></div>
        <div><dt>Signed-in account</dt><dd>{data.user.email}</dd></div>
        <div><dt>Connection</dt><dd>OAuth 2.1 with PKCE</dd></div>
      </dl>
      <p>The connection can read only assigned workspaces. Creating intakes or changing records still requires the corresponding MineralX permission; accountable changes require a review and may require MFA.</p>
      {scopes.length > 0 && <details><summary>Identity scopes</summary><ul>{scopes.map((scope) => <li key={scope}>{scope}</li>)}</ul></details>}
      <form method="post" action="/api/ops/oauth/decision">
        <input type="hidden" name="authorization_id" value={data.authorization_id}/>
        <div className="ops-actions">
          <button className="ops-primary" type="submit" name="decision" value="approve">Authorize connection</button>
          <button type="submit" name="decision" value="deny">Deny</button>
        </div>
      </form>
    </section>
  </>;
}
