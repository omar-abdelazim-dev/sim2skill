// Notifications, follows, private-lab codes, plans and checkout, organizations, and the admin page.
import { useEffect, useRef, useState } from 'react';
import { api, money } from './api.js';

const when = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function useLoad(path, revision = 0) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { let live = true; setError(''); api(path).then(v => live && setData(v)).catch(e => live && setError(e.message)); return () => { live = false; }; }, [path, revision]);
  return { data, error, setData };
}
const Err = ({ error }) => error ? <div className="platform-error" role="alert">{error}</div> : null;

// ---------- Notifications bell (polls every 30 s) ----------
export function NotificationBell({ user }) {
  const [state, setState] = useState({ items: [], unread: 0 }), [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const load = () => api('notifications').then(v => live && setState(v)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, [user?.id]);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!user) return null;
  const readAll = () => api('notifications/read', 'POST', { all: true }).then(v => setState(s => ({ items: s.items.map(i => ({ ...i, read: true })), unread: v.unread }))).catch(() => {});
  const label = n => n.type === 'new_lab' ? <><b>{n.payload.authorName}</b> published <b>{n.payload.title}</b></>
    : n.type === 'lab_taken_down' ? <>Your lab <b>{n.payload.title}</b> was taken down: {n.payload.reason}</> : n.type;
  const href = n => n.type === 'new_lab' ? '#details/' + n.payload.labId : '#studio';
  return <div className="bell" ref={box}>
    <button type="button" className="bell-button" aria-expanded={open} aria-label={`Notifications, ${state.unread} unread`} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      {state.unread > 0 && <span className="bell-count">{state.unread > 9 ? '9+' : state.unread}</span>}
    </button>
    {open && <div className="bell-panel" role="dialog" aria-label="Notifications">
      <div className="bell-head"><b>Notifications</b>{state.unread > 0 && <button type="button" className="platform-text" onClick={readAll}>Mark all read</button>}</div>
      {state.items.length ? <ul>{state.items.map(n => <li key={n.id} className={n.read ? '' : 'unread'}>
        <a href={href(n)} onClick={() => { setOpen(false); if (!n.read) api('notifications/read', 'POST', { ids: [n.id] }).then(v => setState(s => ({ items: s.items.map(i => i.id === n.id ? { ...i, read: true } : i), unread: v.unread }))).catch(() => {}); }}>
          <span>{label(n)}</span><small>{when(n.createdAt)}</small></a></li>)}</ul>
        : <p className="bell-empty">Follow creators to hear when they publish a new lab.</p>}
    </div>}
  </div>;
}

// ---------- Follow / mute / block on a profile ----------
export function FollowControls({ profile, currentUser, onChange }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!currentUser || currentUser.id === profile.user.id) return null;
  const act = async (path, method) => { setBusy(true); setError(''); try { await api(`users/${profile.user.id}/${path}`, method, {}); onChange(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="follow-controls">
    <button type="button" className={profile.isFollowing ? 'home-outline' : 'home-primary'} disabled={busy || profile.isBlocked} aria-pressed={profile.isFollowing}
      onClick={() => act('follow', profile.isFollowing ? 'DELETE' : 'POST')}>{profile.isFollowing ? 'Following' : 'Follow'}</button>
    {profile.isFollowing && <button type="button" className="platform-text" disabled={busy} onClick={() => act('mute', profile.isMuted ? 'DELETE' : 'POST')}>{profile.isMuted ? 'Unmute notifications' : 'Mute notifications'}</button>}
    <button type="button" className="platform-text" disabled={busy} onClick={() => act('block', profile.isBlocked ? 'DELETE' : 'POST')}>{profile.isBlocked ? 'Unblock' : 'Block'}</button>
    <Err error={error} />
  </div>;
}

// ---------- Enter-code screen for a private lab link ----------
export function EnterCode({ id, lab, user, onUnlocked }) {
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!user) return <main className="platform-page platform-empty"><div className="section-kicker">PRIVATE LAB</div><h1>This lab is private.</h1>
    <p>Sign in, then enter the access code {lab?.author ? <>from <b>{lab.author.name}</b></> : 'from its creator'}.</p>
    <a className="home-primary" href={'#signin?next=' + encodeURIComponent('details/' + id)}>Sign in</a></main>;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { onUnlocked(await api(`labs/${id}/access`, 'POST', { code })); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="platform-page"><form className="platform-panel code-form" onSubmit={submit}>
    <div className="section-kicker">PRIVATE LAB</div><h1>Enter the access code</h1>
    <p>{lab?.author ? <><b>{lab.author.name}</b> shared this lab privately.</> : 'This lab is shared privately.'} Ask them for the code if you don’t have it.</p>
    <label>Access code<input value={code} onChange={e => setCode(e.target.value)} required maxLength={64} autoComplete="off" autoFocus /></label>
    <Err error={error} />
    <button className="home-primary" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Unlock lab'}</button>
  </form></main>;
}

// ---------- Report a lab ----------
export function ReportLab({ labId }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [msg, setMsg] = useState(''), [error, setError] = useState('');
  if (msg) return <p className="platform-help" role="status">{msg}</p>;
  if (!open) return <button type="button" className="platform-text report-link" onClick={() => setOpen(true)}>Report this lab</button>;
  return <form className="report-form" onSubmit={async e => { e.preventDefault(); setError(''); try { await api(`labs/${labId}/report`, 'POST', { reason }); setMsg('Thanks. A moderator will review this lab.'); } catch (err) { setError(err.message); } }}>
    <label>What is wrong with this lab?<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={500} required /></label>
    <Err error={error} />
    <div className="public-lab-actions"><button className="home-outline">Send report</button><button type="button" className="platform-text" onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}

// ---------- Private lab tools in the studio ----------
export function AccessTools({ lab }) {
  const [code, setCode] = useState(''), [grants, setGrants] = useState(null), [error, setError] = useState('');
  if (lab.visibility !== 'private') return null;
  const rotate = async revoke => { setError(''); try { setCode((await api(`labs/${lab.id}/access/rotate`, 'POST', { revokeGrants: revoke })).accessCode); } catch (e) { setError(e.message); } };
  const loadGrants = async () => { try { setGrants(await api(`labs/${lab.id}/grants`)); } catch (e) { setError(e.message); } };
  const revoke = async uid => { await api(`labs/${lab.id}/grants/${uid}`, 'DELETE', {}); loadGrants(); };
  return <div className="access-tools">
    <span className="platform-help">Private · {lab.grants || 0} {lab.grants === 1 ? 'person has' : 'people have'} access</span>
    {code && <p className="access-code small" role="status">New code: {code}</p>}
    <div className="public-lab-actions">
      <button type="button" className="platform-text" onClick={() => rotate(false)}>New code</button>
      <button type="button" className="platform-text" onClick={() => rotate(true)}>New code and remove access</button>
      <button type="button" className="platform-text" onClick={loadGrants}>Who has access</button>
    </div>
    {grants && (grants.length ? <ul className="grant-list">{grants.map(g => <li key={g.id}>{g.name}<button type="button" className="platform-text" onClick={() => revoke(g.id)}>Remove</button></li>)}</ul> : <p className="platform-help">Nobody has used the code yet.</p>)}
    <Err error={error} />
  </div>;
}

// ---------- Plans and checkout ----------
const PERIOD = { month: 'per month', semester: 'per semester (4 months)', year: 'per year' };
export function Plans({ user, onUser }) {
  const { data, error } = useLoad('billing/plans');
  const me = useLoad(user ? 'billing/me' : 'billing/plans');
  const [region, setRegion] = useState('global'), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [code, setCode] = useState(''), [orgName, setOrgName] = useState('');
  if (error) return <main className="platform-page"><Err error={error} /></main>;
  if (!data) return <main className="platform-page" role="status">Loading plans…</main>;
  const { plans, regions, provider } = data, factor = regions[region].factor;
  const current = user && me.data?.plan;
  async function checkout(period) {
    if (!user) { location.hash = 'signin?next=plans'; return; }
    setBusy(period); setMsg('');
    try { const c = await api('billing/checkout', 'POST', { plan: 'pro', period, region }); location.hash = c.url.slice(1); }
    catch (e) { setMsg(e.message); } finally { setBusy(''); }
  }
  async function redeem(e) {
    e.preventDefault(); setMsg('');
    try { await api('billing/redeem', 'POST', { code }); setMsg('Code accepted. Pro is active.'); onUser?.(); setCode(''); } catch (err) { setMsg(err.message); }
  }
  async function startOrg(e) {
    e.preventDefault(); setMsg('');
    try { await api('orgs', 'POST', { name: orgName }); location.hash = 'org'; } catch (err) { setMsg(err.message); }
  }
  const Row = ({ label, free, pro, org }) => <tr><th scope="row">{label}</th><td>{free}</td><td>{pro}</td><td>{org}</td></tr>;
  const lim = (p, k) => plans[p].limits[k] === null ? 'Unlimited' : plans[p].limits[k];
  return <main className="platform-page plans-page">
    <div className="platform-heading"><div><div className="section-kicker">PLANS</div><h1>Learn by doing. Pay for what you use.</h1>
      <p>Every built-in lab is free. Pro unlocks unlimited and private labs, all chemistry engines and more help from Nour. New accounts get {data.trialDays} days of Pro.</p></div>
      <label className="region-pick">Pricing region<select value={region} onChange={e => setRegion(e.target.value)}>{Object.entries(regions).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></label></div>
    {data.demo && <div className="platform-notice" role="status">Demo mode is on: every feature is unlocked without payment.</div>}
    {current && <div className="platform-notice" role="status">Your plan: <b>{current.plan === 'demo' ? 'Demo (everything unlocked)' : plans[current.plan]?.name || current.plan}</b>
      {current.source === 'trial' && <> · free trial until {when(current.endsAt)}</>}
      {current.source === 'subscription' && <> · until {when(current.endsAt)}</>}
      {current.org && <> · through {current.org.name}</>}</div>}
    {msg && <div className="platform-notice" role="status">{msg}</div>}
    <div className="plan-cards">
      <article className="platform-panel plan-card"><h2>Free</h2><p className="plan-price">$0</p><p>All built-in labs, community labs, and titration.</p></article>
      <article className="platform-panel plan-card featured"><h2>Pro</h2>
        {Object.entries(plans.pro.prices).map(([period, cents]) => <div className="plan-option" key={period}>
          <p className="plan-price">{money(Math.round(cents * factor))} <small>{PERIOD[period]}</small></p>
          <button type="button" className={period === 'year' ? 'home-primary' : 'home-outline'} disabled={!!busy || !provider.checkout} onClick={() => checkout(period)}>{busy === period ? 'Starting…' : 'Choose ' + period}</button>
        </div>)}
        {!provider.checkout && <p className="platform-help">Online payment is not switched on yet. Use an activation code below.</p>}
      </article>
      <article className="platform-panel plan-card"><h2>Organization</h2>
        {plans.org.seatTiers.map(t => <p key={t.from} className="plan-tier"><b>{money(t.centsPerSeatYear)}</b> per seat per year, {t.from}–{t.to} seats</p>)}
        <p className="plan-tier">Custom pricing from {plans.org.customAbove} seats · {plans.org.minSeats}-seat minimum · billed by invoice</p>
        {user ? <form onSubmit={startOrg}><label>Start a free {plans.org.pilot.days}-day pilot ({plans.org.pilot.seats} seats)<input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="School or university name" minLength={2} maxLength={120} required /></label><button className="home-outline">Start pilot</button></form>
          : <a className="home-outline" href="#signin?next=plans">Sign in to start a pilot</a>}
        <a className="platform-text" href="#org">Manage my organization</a>
      </article>
    </div>
    <table className="plan-table"><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pro</th><th scope="col">Organization</th></tr></thead><tbody>
      <Row label="Built-in labs" free="All" pro="All" org="All" />
      <Row label="Create public labs" free={lim('free', 'publicLabs')} pro={lim('pro', 'publicLabs')} org={lim('org', 'publicLabs')} />
      <Row label="Private labs with access codes" free="No" pro="Unlimited" org="Unlimited" />
      <Row label="Chemistry engines" free="Titration" pro="All" org="All" />
      <Row label="Nour questions per day" free={lim('free', 'nourPerDay')} pro={lim('pro', 'nourPerDay')} org={lim('org', 'nourPerDay') + ' per member'} />
      <Row label="Follow creators and notifications" free="Yes" pro="Yes" org="Yes" />
      <Row label="CSV export" free="No" pro="Yes" org="Yes" />
    </tbody></table>
    {user && <form className="platform-panel redeem-form" onSubmit={redeem}><h2>Have an activation code?</h2><label>Activation code<input value={code} onChange={e => setCode(e.target.value)} maxLength={32} required autoComplete="off" /></label><button className="home-outline">Redeem</button></form>}
  </main>;
}

export function Checkout({ id, onPaid }) {
  const { data, error } = useLoad('billing/checkout/' + id);
  const [state, setState] = useState(''), [msg, setMsg] = useState('');
  if (error) return <main className="platform-page"><Err error={error} /></main>;
  if (!data) return <main className="platform-page" role="status">Loading checkout…</main>;
  const pay = async outcome => {
    setState('paying'); setMsg('');
    try { const r = await api('billing/mock/pay', 'POST', { checkoutId: id, outcome }); setState(r.result.paid ? 'paid' : 'failed'); if (r.result.paid) onPaid?.(); }
    catch (e) { setMsg(e.message); setState(''); }
  };
  return <main className="platform-page"><section className="platform-panel checkout-panel">
    <div className="section-kicker">TEST CHECKOUT · NO REAL MONEY</div>
    <h1>Sim2Skill Pro, {data.period}</h1><p className="plan-price">{money(data.amountCents)} {data.currency}</p>
    <p className="platform-help">This is the test payment provider. A real gateway would show its own secure card page here; Sim2Skill never sees card numbers.</p>
    {state === 'paid' ? <><p role="status" className="platform-notice">Payment received. Pro is active.</p><a className="home-primary" href="#studio">Go to Lab studio</a></>
      : state === 'failed' ? <><p role="alert" className="platform-error">The test payment was declined.</p><button className="home-outline" onClick={() => setState('')}>Try again</button></>
      : <div className="public-lab-actions"><button className="home-primary" disabled={state === 'paying' || data.status !== 'pending'} onClick={() => pay('success')}>Pay with test card</button>
        <button className="platform-text" disabled={state === 'paying'} onClick={() => pay('fail')}>Simulate a declined card</button></div>}
    {data.status !== 'pending' && state === '' && <p className="platform-help">This checkout is {data.status}.</p>}
    <Err error={msg} />
  </section></main>;
}

// ---------- Organization admin ----------
export function OrgPage({ user }) {
  const [rev, setRev] = useState(0);
  const { data, error } = useLoad('orgs/mine', rev);
  const [emails, setEmails] = useState(''), [joinCode, setJoinCode] = useState(''), [msg, setMsg] = useState(''), [usage, setUsage] = useState(null), [invoice, setInvoice] = useState({ seats: 25, contact: '', notes: '' });
  if (!user) return <main className="platform-page platform-empty"><h1>Sign in to manage your organization.</h1><a className="home-primary" href="#signin?next=org">Sign in</a></main>;
  if (error) return <main className="platform-page"><Err error={error} /></main>;
  if (!data) return <main className="platform-page" role="status">Loading…</main>;
  const join = async e => { e.preventDefault(); setMsg(''); try { const o = await api('orgs/join', 'POST', { code: joinCode }); setMsg('You joined ' + o.name + '.'); setRev(x => x + 1); } catch (err) { setMsg(err.message); } };
  if (!data.length) return <main className="platform-page"><div className="section-kicker">ORGANIZATION</div><h1>Join or start an organization</h1>
    <form className="platform-panel" onSubmit={join}><label>Organization code<input value={joinCode} onChange={e => setJoinCode(e.target.value)} required maxLength={32} autoComplete="off" /></label><button className="home-primary">Join</button></form>
    {msg && <div className="platform-notice" role="status">{msg}</div>}<p><a href="#plans">Start a free pilot from the plans page</a></p></main>;
  return <main className="platform-page">{data.map(o => <section key={o.id} className="org-section">
    <div className="platform-heading"><div><div className="section-kicker">ORGANIZATION · {o.status.toUpperCase()}</div><h1>{o.name}</h1>
      <p>{o.seatsUsed} of {o.seatLimit} seats used · access until {when(o.endsAt)} · you are {o.role === 'admin' ? 'an admin' : 'a member'}</p></div></div>
    {msg && <div className="platform-notice" role="status">{msg}</div>}
    {o.role === 'admin' && <>
      <form className="platform-panel" onSubmit={async e => { e.preventDefault(); setMsg(''); try { const r = await api(`orgs/${o.id}/invites`, 'POST', { emails: emails.split(/[\s,;]+/).filter(Boolean) }); setMsg(`${r.added} added, ${r.invited} invited by email.`); setEmails(''); setRev(x => x + 1); } catch (err) { setMsg(err.message); } }}>
        <h2>Invite people</h2><label>Email addresses (one per line or separated by commas)<textarea value={emails} onChange={e => setEmails(e.target.value)} required /></label>
        <div className="public-lab-actions"><button className="home-primary">Invite</button>
          <button type="button" className="home-outline" onClick={async () => { const r = await api(`orgs/${o.id}/join-code`, 'POST', {}); setMsg('New organization code: ' + r.joinCode + ' (shown once; the old code stops working).'); }}>Create a join code</button></div>
      </form>
      <div className="platform-panel"><h2>Members</h2><table className="plan-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {o.members.map(m => <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{m.role}</td><td>{m.id !== user.id && <>
          <button className="platform-text" onClick={async () => { await api(`orgs/${o.id}/members/${m.id}`, 'PATCH', { role: m.role === 'admin' ? 'member' : 'admin' }); setRev(x => x + 1); }}>{m.role === 'admin' ? 'Make member' : 'Make admin'}</button>
          <button className="platform-text" onClick={async () => { await api(`orgs/${o.id}/members/${m.id}`, 'DELETE', {}); setRev(x => x + 1); }}>Remove</button></>}</td></tr>)}
        {o.invites.map(i => <tr key={i.email}><td><i>Invited</i></td><td>{i.email}</td><td>pending</td><td><button className="platform-text" onClick={async () => { await api(`orgs/${o.id}/invites/${encodeURIComponent(i.email)}`, 'DELETE', {}); setRev(x => x + 1); }}>Cancel</button></td></tr>)}
      </tbody></table></div>
      <div className="platform-panel"><h2>Usage, last 30 days</h2><button className="home-outline" onClick={async () => setUsage(await api(`orgs/${o.id}/usage`))}>Load usage</button>
        {usage && <table className="plan-table"><thead><tr><th scope="col">Member</th><th scope="col">Nour questions</th><th scope="col">Labs created</th><th scope="col">Labs solved</th></tr></thead><tbody>{usage.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.nour30d}</td><td>{u.labs}</td><td>{u.solved}</td></tr>)}</tbody></table>}</div>
      <form className="platform-panel" onSubmit={async e => { e.preventDefault(); setMsg(''); try { const r = await api(`orgs/${o.id}/invoice-request`, 'POST', { ...invoice, seats: Number(invoice.seats) }); setMsg(r.quote.custom ? 'Request sent. We will send a custom quote.' : `Request sent. Quote: ${r.quote.seats} seats × ${money(r.quote.centsPerSeatYear)} = ${money(r.quote.totalCents)} per year.`); } catch (err) { setMsg(err.message); } }}>
        <h2>Request an invoice</h2>
        <label>Seats<input type="number" min={25} max={100000} value={invoice.seats} onChange={e => setInvoice({ ...invoice, seats: e.target.value })} required /></label>
        <label>Billing contact<input value={invoice.contact} onChange={e => setInvoice({ ...invoice, contact: e.target.value })} required maxLength={200} /></label>
        <label>Notes<textarea value={invoice.notes} onChange={e => setInvoice({ ...invoice, notes: e.target.value })} maxLength={2000} /></label>
        <button className="home-outline">Send request</button></form>
    </>}
  </section>)}</main>;
}

// ---------- Admin ----------
export function AdminPage({ user }) {
  const [rev, setRev] = useState(0);
  const reports = useLoad(user?.isAdmin ? 'admin/reports' : 'billing/plans', rev);
  const [msg, setMsg] = useState(''), [codes, setCodes] = useState(null), [q, setQ] = useState(''), [users, setUsers] = useState(null);
  if (!user?.isAdmin) return <main className="platform-page platform-empty"><h1>Administrators only.</h1></main>;
  const takedown = async r => { const reason = prompt('Reason shown to the creator:'); if (!reason) return; try { await api(`admin/labs/${r.labId}/takedown`, 'POST', { reason }); setRev(x => x + 1); } catch (e) { setMsg(e.message); } };
  return <main className="platform-page"><div className="section-kicker">ADMIN</div><h1>Moderation and plans</h1>{msg && <div className="platform-notice" role="status">{msg}</div>}
    <div className="platform-panel"><h2>Reports</h2>{!Array.isArray(reports.data) ? <p>Loading…</p> : reports.data.length ? <table className="plan-table"><thead><tr><th scope="col">Lab</th><th scope="col">Reason</th><th scope="col">Reporter</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {reports.data.map(r => <tr key={r.id}><td><a href={'#details/' + r.labId}>{r.labTitle}</a> <small>by {r.authorName}</small></td><td>{r.reason}</td><td>{r.reporterName}</td><td>{r.takenDown ? 'taken down' : r.status}</td>
        <td>{r.takenDown ? <button className="platform-text" onClick={async () => { await api(`admin/labs/${r.labId}/restore`, 'POST', {}); setRev(x => x + 1); }}>Restore</button>
          : <><button className="platform-text" onClick={() => takedown(r)}>Take down</button>{r.status === 'open' && <button className="platform-text" onClick={async () => { await api(`admin/reports/${r.id}/resolve`, 'POST', {}); setRev(x => x + 1); }}>Dismiss</button>}</>}</td></tr>)}
    </tbody></table> : <p>No reports.</p>}</div>
    <div className="platform-panel"><h2>Activation codes</h2><button className="home-outline" onClick={async () => setCodes((await api('admin/redeem-codes', 'POST', { count: 5, days: 30 })).codes)}>Create 5 codes for 30 days of Pro</button>
      {codes && <><p className="platform-help">Shown once. Copy them now.</p><ul className="code-list">{codes.map(c => <li key={c}><code>{c}</code></li>)}</ul></>}</div>
    <form className="platform-panel" onSubmit={async e => { e.preventDefault(); setUsers(await api('admin/users?q=' + encodeURIComponent(q))); }}><h2>Grant Pro</h2><label>Find a user<input value={q} onChange={e => setQ(e.target.value)} /></label><button className="home-outline">Search</button>
      {users && <ul className="grant-list">{users.map(u => <li key={u.id}>{u.name} <small>{u.email}</small><button type="button" className="platform-text" onClick={async () => { await api(`admin/users/${u.id}/grant`, 'POST', { plan: 'pro', days: 30 }); setMsg('Granted 30 days of Pro to ' + u.name + '.'); }}>Grant 30 days</button></li>)}</ul>}</form>
  </main>;
}
