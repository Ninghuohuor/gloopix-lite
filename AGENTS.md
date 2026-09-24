# Repository guidance

This repository is a public starter derived from a private production application.

## Product boundary

- Keep the project independently deployable.
- Do not add dependencies on the original Gloopix service, database, accounts, uploads, domains, or API keys.
- Do not restore the removed canvas, WeChat integrations, affiliate links, or private operations scripts unless the repository owner explicitly changes the Starter scope.
- Treat `.env.example` as the complete public configuration contract. Never commit real secrets or production values.

## Changes

- Prefer configuration over hard-coded site names, domains, providers, prices, and contact details.
- Update tests and public documentation whenever routes or environment variables change.
- Run `npm test`, `npm run lint`, and `npm run build` before claiming a change is ready.
- Verify both text-only and reference-image generation when changing provider or generation code.
