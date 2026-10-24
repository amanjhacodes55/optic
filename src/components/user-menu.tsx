"use client";

import { LayoutGrid, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ClientUser } from "./auth-form";
import { useApi } from "./dashboard/state";

export function useSession() {
  const { data, loading } = useApi<{ user: ClientUser | null; signupAllowed: boolean }>("/api/auth/me");
  return { user: data?.user ?? null, signupAllowed: data?.signupAllowed ?? true, loading: loading || !data };
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  // A full page load drops every cached report and the cached session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenu() {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (loading) return <span className="inline-block h-8 w-8 rounded-full bg-surface-2" aria-hidden />;
  if (!user) {
    const next = encodeURIComponent(pathname);
    return (
      <div className="flex items-center gap-2">
        <Link href={`/login?next=${next}`} className="btn">
          Sign in
        </Link>
        <Link href="/signup" className="btn btn-primary">
          Create account
        </Link>
      </div>
    );
  }
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-plane"
      >
        {initials(user.name) || <UserRound size={15} />}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-line bg-surface p-1 shadow-xl">
          <div className="border-b border-line px-3 py-2">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <Link href="/dashboard" className="mt-1 flex h-9 items-center gap-2 rounded-md px-3 text-sm hover:bg-surface-2">
            <LayoutGrid size={15} /> Your sites
          </Link>
          <Link href="/account" className="flex h-9 items-center gap-2 rounded-md px-3 text-sm hover:bg-surface-2">
            <UserRound size={15} /> Account
          </Link>
          <button onClick={signOut} className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm hover:bg-surface-2">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
