"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Field, Notice } from "@/components/auth-form";
import { Logo, ThemeToggle } from "@/components/dashboard/shell";
import { Card, Loading } from "@/components/ui";
import { signOut, UserMenu, useSession } from "@/components/user-menu";

type Errors = { form?: string; [field: string]: string | undefined };

async function patch(body: unknown): Promise<Errors | null> {
  const r = await fetch("/api/auth/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return null;
  const b = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
  return b.field ? { [b.field]: b.error } : { form: b.error ?? "Could not save" };
}

export function AccountView() {
  const { user, loading } = useSession();
  return (
    <div className="w-full">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo /> Optic
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={14} /> Your sites
        </Link>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Account</h1>
        {loading || !user ? (
          <Loading />
        ) : (
          <div className="space-y-4">
            <ProfileForm initialName={user.name} email={user.email} />
            <PasswordForm />
            <Card title="Sign out">
              <p className="mb-3 text-sm text-ink-2">Ends your session in this browser.</p>
              <button className="btn" onClick={signOut}>
                Sign out
              </button>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const [name, setName] = useState(initialName);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  return (
    <Card title="Profile">
      <form
        className="max-w-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          const err = await patch({ name });
          setErrors(err ?? {});
          setSaved(!err);
        }}
      >
        {saved && <Notice>Saved.</Notice>}
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <Field label="Name" name="name" value={name} onChange={(v) => (setName(v), setSaved(false))} error={errors.name} autoComplete="name" />
        <div className="mb-4">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <p className="text-sm text-ink-2">{email}</p>
        </div>
        <button className="btn btn-primary">Save</button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  return (
    <Card title="Change password">
      <form
        className="max-w-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (newPassword.length < 8) return setErrors({ newPassword: "Use at least 8 characters" });
          const err = await patch({ currentPassword, newPassword });
          setErrors(err ? { ...err, ...(err.current ? { currentPassword: err.current } : {}) } : {});
          if (!err) {
            setDone(true);
            setCurrent("");
            setNext("");
          }
        }}
      >
        {done && <Notice>Password changed.</Notice>}
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <Field label="Current password" name="currentPassword" type="password" value={currentPassword} onChange={setCurrent} error={errors.currentPassword} autoComplete="current-password" />
        <Field label="New password" name="newPassword" type="password" value={newPassword} onChange={setNext} error={errors.newPassword} autoComplete="new-password" hint="At least 8 characters." />
        <button className="btn btn-primary">Change password</button>
      </form>
    </Card>
  );
}
