# Document to Excel

Next.js foundation for a document-to-spreadsheet product hosted exclusively on Netlify.

## Current functionality

- Responsive landing page and sample review workspace.
- Locally editable fictional sample descriptions; reset and review-flag controls.
- Fail-closed preview access on every route, plus checks in the root layout and status API.
- Netlify build configuration with the automatically supplied OpenNext adapter.
- CI for TypeScript, access controls, the production build, and production HTTP smoke checks.

**This is not yet a working converter.** Authentication, private uploads, OCR, review persistence, XLSX exports and subscriptions remain to be integrated. There is no fake conversion endpoint.

## Local setup

Use Node 22. Install dependencies with `npm install` (or `npm ci` after the lockfile is committed), copy `.env.example` to `.env.local`, and set an ASCII preview username plus a randomly generated password of at least 24 characters. The browser will ask for these credentials.

Run `netlify dev` with the Netlify CLI for platform-aware development, or `npm run dev` for the Next.js-only interface.

Missing credentials produce a 503 response; invalid credentials produce a 401 response. This applies in all environments, including production. The preview gate is separate from future Supabase user authentication.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:smoke
```

The smoke script runs the built server with missing and test-only credentials, verifies protected routes and valid requests, and stops the server. It uses no external service credentials.

A lockfile is not included in the initial foundation because the editing session has no package execution tool. The first successful install should produce a reviewed, committed `package-lock.json` before production release. Top-level runtime versions are pinned.

## Hosting

Netlify project: [document-to-excel-shiv](https://app.netlify.com/projects/document-to-excel-shiv)

The project has been created but is **not deployed or linked to this repository yet**. Follow [Netlify setup](docs/NETLIFY_SETUP.md). Do not publish production until the owner explicitly approves.

See [project state](PROJECT_STATE.md) and [architecture](docs/ARCHITECTURE.md) for verified status and remaining work.
