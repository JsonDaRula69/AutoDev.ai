# console — Source Structure
**npm name:** (no top-level package.json)
**private:** yes (sub-workspace)

The **OpenCode Console** — a multi-package web admin/management application for OpenCode teams, billing, accounts, referrals, support, and mail. **Not a single package**: it is a directory containing six sub-packages, each with its own `package.json`. The console is a separate surface from the OpenCode runtime and from the stats site; it is the operator-facing control plane (accounts, billing, subscriptions, referrals, brand assets, support). Built primarily with SolidStart across the sub-apps.

## Key directories (sub-packages)
- `app/` — SolidStart frontend for the console (operator UI): `package.json`, `vite.config.ts`, `tsconfig.json`, `src/` (`app.tsx`, `entry-client.tsx`, `entry-server.tsx`, `routes/` including `[…404]`, `auth/`, `bench/`, `black/`, `brand/`, `changelog/`, `data/`, `api/`; `component/` — dropdown, email-signup, faq, footer, header, icon, language-picker, go-referral; `context/` — auth, auth.session, auth.withActor, i18n, language; `i18n/` — ar, br, da, de, en, es, fr, it, ja, ko, no, ...; `lib/` — changelog, form-error, format-reset-time, github, language, referral-invite, salesforce, stats-proxy; `style/` — base, index, reset, component/, token/; `middleware.ts`, `config.ts`, `global.d.ts`; plus `public/`, `script/`, `test/`)
- `core/` — Domain + data layer: `drizzle.config.ts`, `migrations/`, `src/` (`account.ts`, `actor.ts`, `aws.ts`, `billing.ts`, `black.ts`, `context.ts`, `identifier.ts`, `key.ts`, `lite.ts`, `model.ts`, `provider.ts`, `referral.ts`, `subscription.ts`, `user.ts`, `workspace.ts`, `drizzle/`, `schema/`, `util/`); `script/`, `test/`, `tsconfig.json`, `sst-env.d.ts`
- `function/` — Lambda/serverless handlers: `src/` (`auth.ts`, `log-processor.ts`, `stat.ts`), `package.json`, `tsconfig.json`, `sst-env.d.ts`
- `mail/` — Transactional email: `emails/` (`components.tsx`, `styles.ts`, `templates/`), `package.json`, `sst-env.d.ts`
- `resource/` — SST resource definitions: `resource.cloudflare.ts`, `resource.node.ts`, `package.json`, `bun.lock`, `tsconfig.json`, `sst-env.d.ts`
- `support/` — Support/feedback SolidStart app: `src/` (`app.tsx`, `entry-client.tsx`, `entry-server.tsx`, `routes/`, `component/`, `lib/`, `app.css`, `global.d.ts`), `package.json`, `vite.config.ts`, `tsconfig.json`, `sst-env.d.ts`

## Key files (per sub-package)
Each sub-package has its own `package.json`. There is **no root `package.json`** for `console/`. The sub-packages are wired together via SST resources (`resource/`) and share the `core/` domain layer.

## Notes
- `core/` is the domain + database heart (accounts, billing, subscriptions, referrals, providers, workspaces) — Drizzle ORM + migrations.
- `app/` is the primary operator console UI (auth, bench, black, brand, changelog, data, api routes; i18n in many locales; salesforce + github integrations in `lib/`).
- `function/` holds the serverless entrypoints (`auth`, `log-processor`, `stat`).
- `mail/` holds email templates rendered via Solid.
- `resource/` declares SST infrastructure for both Cloudflare and Node targets.
- `support/` is a smaller SolidStart app for the support/feedback surface.