# Conversion architecture

This document is a design, not a claim that the integrations exist.

## Upload and job lifecycle

1. Authenticate the user with Supabase. Verify the session server-side.
2. Create a document record with a server-generated ID and an owner-specific storage path. Check quotas and allowed file constraints before issuing upload authorization.
3. Return a short-lived authenticated mechanism for uploading that exact object directly from the browser to a private Supabase Storage bucket. Choose the mechanism after confirming provider token lifetime and resumable-upload support.
4. Browser uploads directly to storage; it sends only the document ID and processing options to the application afterwards.
5. Backend resolves the canonical storage path from the document record. It never trusts an arbitrary client path, remote URL, ownership field or extraction status. Validate actual stored file size, format and upload completion before processing.
6. Persist a durable job in PostgreSQL before dispatch. Submit a short-lived document read URL to an asynchronous document-intelligence API.
7. Save the provider operation ID; record retry attempts, timestamps and a processing lease. Recover ambiguous submission failures deliberately to avoid duplicate provider charges.
8. Advance jobs through verified callbacks or server-side polling. Browser polling is only for displaying status, never the sole job runner.
9. Normalize the extraction result into an editable review model. Preserve cell coordinates, original values and confidence where the provider supplies them.
10. Validate and create XLSX in bounded background work. Write untrusted extracted text as text rather than executable spreadsheet formulas. Preserve numbers, leading zeros, dates and currencies deliberately.
11. Save the workbook in private storage. Check the requesting user's ownership before issuing a short-lived signed download URL.

No PDF/image bytes pass through a normal Netlify Function or Next.js request handler. Netlify Background Functions are for bounded orchestration, validation and export, not an unbounded OCR worker.

## Proposed persistence

- profiles: user ID and user-controlled profile fields.
- documents: owner, original display name, canonical storage path, media type, size, retention timestamps and lifecycle status.
- extraction_jobs: document ID, job status, provider operation ID, attempt count, lease, safe error code and next retry time.
- document_tables / document_cells: normalized data and revision information.
- exports: owner, document/review revision, private storage path and expiry.
- billing_accounts / subscriptions: verified Stripe IDs and authoritative subscription state.
- usage_ledger: immutable usage events and idempotency keys.
- webhook_events: deduplication records and processing outcome.

Enable row-level security for user-visible tables. Users must never be able to write provider status, billing entitlements, usage credits or another user's ownership fields. Private storage policies must isolate each owner. Service-role/secret keys stay server-only.

## Failure and privacy controls

- Explicit states: awaiting_upload, queued, submitting, processing, needs_review, exporting, complete, failed and deleting.
- Bounded retries with backoff, stale-lease recovery and terminal failures visible to the user.
- Treat provider callbacks as untrusted until authenticated and mapped to an existing operation.
- Log allowlisted operational fields only.
- Enforce retention cleanup for source files, extraction payloads, reviews and exports.
- Rate-limit job creation and signed URL issuance.
- Use synthetic documents for preview tests.
- Measure duration, memory, file size and export size before adding a dedicated job provider.

## Outstanding product decisions

Choose an OCR provider using measured extraction quality on representative statements, invoices and scanned tables, plus asynchronous support, region, retention controls and per-page cost. Set supported formats, page/file limits, retention period and subscription quotas based on those measurements. Do not promise conversion of every document or perfect accuracy.

The original uploaded full brief has not been readable in this execution environment. Reconcile it before final product scope is declared complete.
