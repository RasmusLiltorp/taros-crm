# Taros Simple CRM

A minimal, self-hostable CRM. Contacts in a clean table, LinkedIn CSV import, duplicate detection, and team sharing. No funnels, no dashboards, no integrations you'll never use.

**Stack:** Next.js 16 · PocketBase · Tailwind CSS · Docker

> Built with AI assistance (vibecoded).

---

## Requirements

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Node.js 20+ (local development only)

---

## Quick start

```bash
cp .env.example .env
# Fill in the required values in .env (see Configuration below)

docker compose up
```

The app will be available at `http://localhost:3000`.  
The PocketBase admin UI is at `http://localhost:8090/_/`.

---

## Configuration

Copy `.env.example` to `.env` and set the following variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_POCKETBASE_URL` | URL the **browser** uses to reach PocketBase. Use `http://localhost:8090` for local dev. |
| `NEXT_PUBLIC_APP_URL` | Public URL of the Next.js app — used in verification and password-reset emails. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. Leave blank to skip CAPTCHA in local dev. |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret key. |
| `PB_SMTP_HOST` | SMTP server hostname (e.g. `email-smtp.eu-west-1.amazonaws.com` for AWS SES). |
| `PB_SMTP_USER` | SMTP username / access key. |
| `PB_SMTP_PASS` | SMTP password / secret. |
| `PB_SENDER_EMAIL` | From address for outgoing emails (e.g. `noreply@yourdomain.com`). |
| `PB_ADMIN_EMAIL` | Email address for the PocketBase superuser account. |
| `PB_ADMIN_PASSWORD` | Password for the PocketBase superuser account. **Required — no default.** |

Email sending (verification, password reset, OTP) requires `PB_SMTP_*` and `PB_SENDER_EMAIL` to be set. Without them the app still works but users will not receive emails.

---

## Local development (without Docker)

Start PocketBase separately (or keep it running via Docker):

```bash
docker compose up pocketbase
```

Then run the Next.js dev server:

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090` in your `.env.local`.

---

## Project structure

```
pb_hooks/          PocketBase JS hooks (runs on the PocketBase server)
pb_migrations/     PocketBase schema migrations (auto-applied on startup)
src/
  app/             Next.js App Router pages
    (app)/         Authenticated app routes (dashboard, settings)
    (auth)/        Auth routes (login, register, verify, invite)
    (marketing)/   Public landing page
    api/           Next.js API routes
  components/      React components
  hooks/           React hooks (useContacts, useTeam, useAuth)
  lib/             Shared utilities (PocketBase client, auth helpers, types)
```

---

## License

MIT
