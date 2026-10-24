"use client";

import { Eye, EyeOff, Flame, LineChart, PlayCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./dashboard/shell";

export type ClientUser = { id: string; email: string; name: string };

/** Only allow redirects to paths on this site. */
export function safeNext(next: string | null, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0d0d0d] p-10 text-[#f0efec] lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Logo size={26} inverted /> Optic
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">See what visitors do, without handing their data to anyone.</h2>
          <ul className="mt-8 space-y-4 text-sm text-[#c3c2b7]">
            {[
              { icon: LineChart, text: "GA4-style reports: traffic, funnels, retention, revenue" },
              { icon: Flame, text: "Click and scroll heatmaps over your live pages" },
              { icon: PlayCircle, text: "Session recordings with typed text masked" },
              { icon: ShieldCheck, text: "Cookieless by default, self-hosted, MIT licensed" },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <f.icon size={18} className="shrink-0 text-[#3987e5]" /> {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-[#898781]">Open source at github.com/amanjhacodes55/optic</p>
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full border-[40px] border-[#3987e5]/15" />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 font-semibold lg:hidden">
            <Logo /> Optic
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
  hint,
  autoFocus,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  autoComplete?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={isPassword && show ? "text" : type}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
          className={`input h-10 w-full ${isPassword ? "pr-10" : ""}`}
          style={error ? { borderColor: "var(--critical)" } : undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Errors = { form?: string; [field: string]: string | undefined };

async function submitAuth(url: string, body: unknown): Promise<{ ok: true } | { ok: false; errors: Errors }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return { ok: true };
    const b = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
    const msg = b.error ?? "Something went wrong. Try again.";
    return { ok: false, errors: b.field ? { [b.field]: msg } : { form: msg } };
  } catch {
    return { ok: false, errors: { form: "Can't reach the server. Check your connection." } };
  }
}

/** Send people who are already signed in straight on. */
function useRedirectIfSignedIn(next: string) {
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => b.user && window.location.replace(next))
      .catch(() => {});
  }, [next]);
}

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  useRedirectIfSignedIn(next);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const v: Errors = {};
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) v.email = "Enter a valid email address";
        if (!password) v.password = "Enter your password";
        setErrors(v);
        if (Object.keys(v).length) return;
        setBusy(true);
        const res = await submitAuth("/api/auth/login", { email, password });
        // A full page load, so the server sees the new session cookie on the very next request.
        if (res.ok) return window.location.assign(next);
        setBusy(false);
        setErrors(res.errors);
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">Sign in to your Optic account.</p>
      {errors.form && <Notice tone="error">{errors.form}</Notice>}
      <Field label="Email" name="email" type="email" autoComplete="email" autoFocus value={email} onChange={setEmail} error={errors.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
      <button className="btn btn-primary h-10 w-full justify-center" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-6 text-center text-sm text-ink-2">
        New to Optic?{" "}
        <Link className="font-medium text-accent-ink hover:underline" href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create an account
        </Link>
      </p>
      <Divider />
      <Link href="/dashboard/demo" className="btn h-10 w-full justify-center">
        Explore the demo without an account
      </Link>
    </form>
  );
}

export function SignupForm({ signupAllowed }: { signupAllowed: boolean | null }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/dashboard?new=1");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  useRedirectIfSignedIn(next);

  if (signupAllowed === false) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign-ups are closed</h1>
        <p className="mb-6 mt-2 text-sm text-ink-2">The owner of this Optic instance has turned off new accounts. Ask them to create one for you.</p>
        <Link href="/login" className="btn btn-primary h-10 w-full justify-center">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const v: Errors = {};
        if (!name.trim()) v.name = "Enter your name";
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) v.email = "Enter a valid email address";
        if (password.length < 8) v.password = "Use at least 8 characters";
        setErrors(v);
        if (Object.keys(v).length) return;
        setBusy(true);
        const res = await submitAuth("/api/auth/signup", { name, email, password });
        if (res.ok) return window.location.assign(next);
        setBusy(false);
        setErrors(res.errors);
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">Free and open source. Your data stays on this server.</p>
      {errors.form && <Notice tone="error">{errors.form}</Notice>}
      <Field label="Name" name="name" autoComplete="name" autoFocus value={name} onChange={setName} error={errors.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} hint="At least 8 characters." />
      <button className="btn btn-primary h-10 w-full justify-center" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="mt-6 text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link className="font-medium text-accent-ink hover:underline" href={`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>
          Sign in
        </Link>
      </p>
      <Divider />
      <Link href="/dashboard/demo" className="btn h-10 w-full justify-center">
        Explore the demo first
      </Link>
    </form>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="mb-4 rounded-lg border px-3 py-2 text-sm"
      style={tone === "error" ? { borderColor: "var(--critical)", color: "var(--critical)" } : { borderColor: "var(--line)", background: "var(--surface-2)" }}
    >
      {children}
    </div>
  );
}
