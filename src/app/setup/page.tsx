import { bootstrapBusiness } from "./actions";

export default function SetupPage() {
  return <main className="shell"><div className="card" style={{maxWidth:560}}><h1>Create your first business</h1><p className="muted">AI and auto-send start disabled. Connections are configured after the business exists.</p><form action={bootstrapBusiness} className="form"><label className="field">Organization<input name="organizationName" required /></label><label className="field">Business<input name="businessName" required /></label><label className="field">Slug<input name="slug" required /></label><button className="btn primary" type="submit">Create business</button></form></div></main>;
}
