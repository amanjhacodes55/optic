# Security policy

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting
(**Security → Report a vulnerability** on the repository). You will get a reply within a few days.

Include the version or commit, steps to reproduce, and the impact you expect.

## Hardening checklist for self-hosters

- Create your account, then set `OPTIC_ALLOW_SIGNUP=false` unless you want others to sign up.
- Passwords are hashed with scrypt; session cookies hold a random token whose SHA-256 is the only thing stored.
- Serve Optic over HTTPS; the session cookie is marked `Secure` whenever the request arrives over HTTPS.
- Put Optic behind a proxy that sets `X-Forwarded-For`, and restrict who can reach the dashboard if you can.
- Treat site API keys as secrets; rotate one in Settings if it leaks.
- Keep backups of the database file (see [self-hosting](docs/self-hosting.md#backups)).

## Scope notes

- `/api/collect`, `/api/replay` and `/api/config` are public by design: anyone who knows a site id can send events for
  it, as with every client-side analytics tool. Bots are filtered and each IP is rate limited.
- Session recordings mask input values by default. Pages that show sensitive data should mark it with
  `class="optic-block"`.
