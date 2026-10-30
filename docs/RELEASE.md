# Mandapam release

Wedding planning with ceremonies, tasks, exact-paise finance, family access and owner-reviewed guest-count changes. AI suggestions are optional.

## Build

Use Node.js 24.x (at least 24.12) and npm 11.19.0. Install pinned dependencies with npm ci. Run npm run lint, npm run typecheck, npm test and npm run build. Vercel uses the default Next.js production build. No database migration runs during installation or build.

## Configuration

Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the intended project and APP_ORIGIN for the canonical application origin. Keep server credentials and optional GEMINI_API_KEY, AI_RECEIPT_SECRET and AI_NO_COST_CONFIRMED server-only. Never commit local environment files. Configure provider credentials and production redirect allowlists separately.

## Database

The canonical 15-migration catalog is included for history and reproducibility. It is not an instruction to replay migrations on an existing database. Review its actual ledger before any separately authorized database operation.

## Initial release limitation

Payment due-date entry, persistence, obligations display and reminders are deferred by the founder for this release. Do not infer vendor deadlines from task dates or cash dates. Existing financial commitments, payments and refunds remain separate records.
