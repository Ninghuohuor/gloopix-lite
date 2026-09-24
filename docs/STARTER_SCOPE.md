# Gloopix Lite scope

## Included

- One private site protected by one server-validated access password
- Authenticated password changes with server-side password hash storage and prior-session revocation
- Text-to-image generation
- One optional reference image
- GPT Image 2 as the default model
- OpenAI Images-compatible synchronous API configuration
- Standalone APIMart asynchronous image adapter with task polling and reference-image data URLs
- Browser-local API and multi-model settings, with deployment environment fallback
- Per-model size templates, safe automatic sizing, and advanced custom size parameters
- Browser-local site identity settings, including Blob-backed logo and favicon images
- In-browser result preview and direct download
- Browser-local generation history backed by IndexedDB Blob storage
- Cloudflare Workers deployment without a database for image history; password changes optionally use a KV binding

## Excluded

- Registration, user accounts, roles, forgotten-password recovery, and email
- Credits, payments, redemption codes, referrals, and affiliates
- Server-side generation history, announcements, prompt libraries, and admin panels
- Prisma, SQLite, queues, local image uploads, D1, R2, and Supabase
- Canvas, WeChat integrations, private operations scripts, and production data
- Dependency on the original Gloopix service, accounts, domains, or API keys
- Generic asynchronous provider protocols in V1

Prompts and generated results may be stored only in the current browser's IndexedDB. The application does not persist them on the server.
On Node.js, a changed access password is stored as a salted hash in a local file. On Cloudflare Workers, the password-change feature requires an `ACCESS_PASSWORD_KV` binding; no image data is stored there.
