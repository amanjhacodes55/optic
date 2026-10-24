import type { User } from "./auth";
import { getSite, type Site } from "./sites";

// Who can do what with a site: its owner can view and change it; anyone, signed in or not, can
// view a public site (the bundled demo) but not change it.

export class AccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function canEdit(site: Site, user: User | null): boolean {
  return !!user && site.owner_id === user.id;
}

export async function viewableSite(siteId: string, user: User | null): Promise<Site> {
  const site = await getSite(siteId);
  if (!site || (!site.public && !canEdit(site, user))) {
    // Same answer for "missing" and "not yours", so site ids cannot be probed.
    throw new AccessError(user ? "Site not found" : "Sign in to view this site", user ? 404 : 401);
  }
  return site;
}

export async function editableSite(siteId: string, user: User | null): Promise<Site> {
  const site = await viewableSite(siteId, user);
  if (!canEdit(site, user)) throw new AccessError(user ? "This is a read-only demo. Add your own site to change settings." : "Sign in to make changes", user ? 403 : 401);
  return site;
}

/** What a client may see of a site: the API key only goes to its owner. */
export function publicView(site: Site, user: User | null) {
  const editable = canEdit(site, user);
  return { ...site, api_key: editable ? site.api_key : null, can_edit: editable };
}
