import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/tenant";

const riskClass = (risk?: string | null) => `risk risk-${String(risk ?? "none").toLowerCase()}`;
const statusLabel = (status?: string | null) => String(status ?? "UNKNOWN").replaceAll("_", " ");

export default async function CommandCenter({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { supabase } = await requireUser();
  const params = await searchParams;

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,ai_active,auto_send_active,autonomy_level")
    .order("created_at");

  if (!businesses?.length) redirect("/setup");

  const businessId = params.business && businesses.some((b) => b.id === params.business)
    ? params.business
    : businesses[0].id;
  const business = businesses.find((b) => b.id === businessId)!;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [messages, runs, approvals, threads, mailboxes, outreach] = await Promise.all([
    supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", since),
    supabase.from("agent_runs").select("id,status,risk", { count: "exact" }).eq("business_id", businessId).gte("created_at", since),
    supabase
      .from("approvals")
      .select("id,agent_run_id,risk,proposed_draft,created_at,agent_runs!inner(email_messages!inner(from_address,subject))")
      .eq("business_id", businessId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("email_threads")
      .select("id,subject,status,risk,last_activity_at,mailboxes!inner(email_address),contacts(email,first_name,last_name)")
      .eq("business_id", businessId)
      .order("last_activity_at", { ascending: false })
      .limit(12),
    supabase
      .from("mailboxes")
      .select("id,email_address,provider,ai_active,auto_send_active,watch_expires_at")
      .eq("business_id", businessId),
    supabase
      .from("outreach_contacts")
      .select("id,status,outlet_type,organization,contact_name,next_followup_at,last_sent_at")
      .eq("business_id", businessId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const runRows = runs.data ?? [];
  const aiHandled = runRows.filter((r: any) => ["COMPLETED", "AWAITING_APPROVAL", "DECIDED"].includes(r.status)).length;
  const handledRate = runRows.length ? Math.round((aiHandled / runRows.length) * 100) : 0;
  const highRisk = runRows.filter((r: any) => ["HIGH", "CRITICAL"].includes(r.risk)).length;
  const mailboxRows = mailboxes.data ?? [];
  const connectedMailboxes = mailboxRows.length;
  const healthyMailboxes = mailboxRows.filter((m: any) => m.ai_active).length;
  const outreachRows = outreach.data ?? [];
  const outreachSent = outreachRows.filter((r: any) => ["SENT", "FOLLOWUP_DUE", "REPLIED", "INTERESTED", "BOOKED", "NOT_INTERESTED", "CLOSED"].includes(r.status)).length;
  const outreachReplies = outreachRows.filter((r: any) => ["REPLIED", "INTERESTED", "BOOKED", "NOT_INTERESTED", "CLOSED"].includes(r.status)).length;
  const outreachBooked = outreachRows.filter((r: any) => r.status === "BOOKED").length;
  const replyRate = outreachSent ? Math.round((outreachReplies / outreachSent) * 100) : 0;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero-bar">
        <div>
          <div className="eyebrow"><span className="pulse-dot" /> LIVE COMMAND CENTER</div>
          <h1>AI Email OS</h1>
          <p className="hero-copy">A single view of inbox operations, approvals, outreach, and AI performance.</p>
        </div>
        <div className="hero-actions">
          <a className="btn btn-ghost" href={`/settings?business=${businessId}`}>Settings</a>
          <a className="btn btn-secondary" href={`/api/integrations/gmail/connect?businessId=${businessId}`}>Connect Gmail</a>
          <a className="btn btn-primary" href={`/api/integrations/ghl/connect?businessId=${businessId}`}>Connect GHL</a>
        </div>
      </header>

      <section className="business-strip glass-panel">
        <div>
          <div className="micro-label">ACTIVE BUSINESS</div>
          <div className="business-name">{business.name}</div>
        </div>
        <div className="business-tabs">
          {businesses.map((item) => (
            <a key={item.id} className={`business-tab ${item.id === businessId ? "active" : ""}`} href={`/?business=${item.id}`}>
              {item.name}
            </a>
          ))}
        </div>
        <div className="system-state">
          <span className={`state-pill ${business.ai_active ? "on" : "off"}`}>AI {business.ai_active ? "ON" : "OFF"}</span>
          <span className={`state-pill ${business.auto_send_active ? "on" : "off"}`}>AUTO {business.auto_send_active ? "ON" : "OFF"}</span>
          <span className="state-pill neutral">LEVEL {business.autonomy_level}</span>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card metric-card-featured">
          <div className="metric-top"><span>AI handled today</span><span className="metric-icon">✦</span></div>
          <div className="metric-value">{handledRate}%</div>
          <div className="metric-foot">{aiHandled} of {runs.count ?? 0} AI runs handled</div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${handledRate}%` }} /></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Messages today</span><span className="metric-icon soft">↗</span></div>
          <div className="metric-value">{messages.count ?? 0}</div>
          <div className="metric-foot">Across {connectedMailboxes} connected inbox{connectedMailboxes === 1 ? "" : "es"}</div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Needs review</span><span className="metric-icon warn">!</span></div>
          <div className="metric-value">{approvals.data?.length ?? 0}</div>
          <div className="metric-foot">{highRisk} high or critical risk runs today</div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Speaker outreach</span><span className="metric-icon soft">◎</span></div>
          <div className="metric-value">{replyRate}%</div>
          <div className="metric-foot">Reply rate with {outreachBooked} booked</div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel span-7">
          <div className="panel-head">
            <div><div className="micro-label">HUMAN REVIEW</div><h2>Approval queue</h2></div>
            <span className="count-badge">{approvals.data?.length ?? 0} pending</span>
          </div>
          <div className="approval-stack">
            {(approvals.data ?? []).length === 0 ? (
              <div className="empty-state"><div className="empty-orb">✓</div><strong>Inbox is clear</strong><span>No drafts need human approval right now.</span></div>
            ) : (approvals.data ?? []).map((a: any) => {
              const msg = a.agent_runs?.email_messages;
              const draft = String(a.proposed_draft?.bodyText ?? "");
              return (
                <div className="approval-card" key={a.id}>
                  <div className="avatar">{String(msg?.from_address ?? "?").slice(0, 1).toUpperCase()}</div>
                  <div className="approval-main">
                    <div className="approval-line"><strong>{msg?.subject || "No subject"}</strong><span className={riskClass(a.risk)}>{a.risk}</span></div>
                    <div className="approval-from">{msg?.from_address ?? "Unknown sender"}</div>
                    <p className="draft-preview">{draft.slice(0, 260) || "No draft body generated."}</p>
                  </div>
                  <div className="approval-actions">
                    <form action={`/api/approvals/${a.id}/approve`} method="post"><button className="btn btn-primary btn-small">Approve & Send</button></form>
                    <form action={`/api/approvals/${a.id}/reject`} method="post"><button className="btn btn-ghost btn-small">Reject</button></form>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel span-5 outreach-panel">
          <div className="panel-head">
            <div><div className="micro-label">SPEAKER OUTREACH</div><h2>Pipeline pulse</h2></div>
            <span className="count-badge">VA review mode</span>
          </div>
          <div className="outreach-hero">
            <div className="ring" style={{ "--value": `${replyRate * 3.6}deg` } as React.CSSProperties}>
              <div><strong>{replyRate}%</strong><span>reply rate</span></div>
            </div>
            <div className="outreach-stats">
              <div><span>Prepared</span><strong>{outreachRows.length}</strong></div>
              <div><span>Sent</span><strong>{outreachSent}</strong></div>
              <div><span>Replies</span><strong>{outreachReplies}</strong></div>
              <div><span>Booked</span><strong>{outreachBooked}</strong></div>
            </div>
          </div>
          <div className="pipeline-bars">
            {["READY_TO_SEND", "SENT", "FOLLOWUP_DUE", "REPLIED", "BOOKED"].map((status) => {
              const count = outreachRows.filter((r: any) => r.status === status).length;
              const pct = outreachRows.length ? Math.max(5, Math.round((count / outreachRows.length) * 100)) : 0;
              return <div className="pipeline-row" key={status}><span>{statusLabel(status)}</span><div className="mini-track"><div className="mini-fill" style={{ width: `${pct}%` }} /></div><strong>{count}</strong></div>;
            })}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel span-5">
          <div className="panel-head"><div><div className="micro-label">SYSTEM HEALTH</div><h2>Mailboxes</h2></div><span className="count-badge">{healthyMailboxes}/{connectedMailboxes} AI on</span></div>
          <div className="mailbox-list">
            {mailboxRows.length === 0 ? <div className="empty-state compact"><strong>No mailbox connected</strong><span>Connect Gmail to start receiving live email activity.</span></div> : mailboxRows.map((m: any) => (
              <div className="mailbox-row" key={m.id}>
                <div className="mailbox-icon">@</div>
                <div className="mailbox-copy"><strong>{m.email_address}</strong><span>{m.provider} · Auto-send {m.auto_send_active ? "on" : "off"}</span></div>
                <span className={`health-dot ${m.ai_active ? "healthy" : "paused"}`} title={m.ai_active ? "AI active" : "AI paused"} />
              </div>
            ))}
          </div>
        </article>

        <article className="panel span-7">
          <div className="panel-head"><div><div className="micro-label">RECENT ACTIVITY</div><h2>Unified inbox</h2></div><span className="count-badge">Latest 12</span></div>
          <div className="inbox-list">
            {(threads.data ?? []).length === 0 ? <div className="empty-state compact"><strong>No recent threads</strong><span>New conversations will appear here once Gmail is connected.</span></div> : (threads.data ?? []).map((t: any) => {
              const contact = t.contacts ? `${t.contacts.first_name ?? ""} ${t.contacts.last_name ?? ""}`.trim() || t.contacts.email : "Unmatched contact";
              return (
                <div className="inbox-row" key={t.id}>
                  <div className="inbox-main"><strong>{t.subject || "No subject"}</strong><span>{contact} · {t.mailboxes?.email_address}</span></div>
                  <span className={riskClass(t.risk)}>{t.risk ?? "UNRATED"}</span>
                  <span className="status-text">{statusLabel(t.status)}</span>
                  <span className="time-text">{new Date(t.last_activity_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <footer className="dashboard-footer"><span>AI Email OS</span><span>Designed for safe, high-trust email operations</span></footer>
    </main>
  );
}
