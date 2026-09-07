import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="shell"><div className="card" style={{maxWidth:460,margin:"80px auto"}}><h1>AI Agent Email OS</h1><p className="muted">Sign in to the operations command center.</p>{error ? <p>{error}</p> : null}<form action={signIn} className="form"><label className="field">Email<input name="email" type="email" required /></label><label className="field">Password<input name="password" type="password" required /></label><button className="btn primary" type="submit">Sign in</button></form></div></main>;
}
