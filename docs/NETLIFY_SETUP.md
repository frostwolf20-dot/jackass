# Netlify setup and launch gates

## Selected resources

- Repository: https://github.com/frostwolf20-dot/jackass
- Netlify project: document-to-excel-shiv
- Site ID: 94ceed64-3b06-45c6-8a59-6064caff989e
- Project settings: https://app.netlify.com/projects/document-to-excel-shiv
- No live or preview deployment has been verified.

## Connect source control

The connector available during setup can create projects and manage environment variables, but does not expose repository linking or deploy-preview enablement. Use the existing project's build/deploy settings to link this GitHub repository; do not create a duplicate Netlify project.

Use the root directory, build command `npm run build`, publish directory `.next`, and Node 22. Netlify detects Next.js and supplies its current OpenNext adapter.

Linking a repository may trigger a production-context build. Complete access protection and review deployment controls first. The app denies access when preview credentials are missing, but that does not constitute production approval.

Enable Deploy Previews for pull requests. Configure development branch deployment separately if desired; branch deployments and PR Deploy Previews are distinct. Keep production publishing gated.

## Private preview access

The initial native Netlify access-control attempt was rejected by automatic approval review because it interpreted the scope as potentially affecting unrelated projects. No native protection change was made.

Keep the project undeployed until site-specific native protection or a tested application gate is ready. The code includes an always-on Basic-auth preview gate. This requires HTTPS and is for prelaunch access, not per-user product authorization.

Set `PREVIEW_ACCESS_USERNAME` and `PREVIEW_ACCESS_PASSWORD` through Netlify's environment-variable interface, mark sensitive values as secrets, and include the runtime Functions scope. Use at least 24 randomly generated ASCII password characters. Use separate values for deploy-preview, branch-deploy and production. Do not store real credentials in the repository or the chat.

Missing/short passwords lock the application. There is no public-release environment switch in this foundation. Public release requires an explicitly reviewed code/configuration change after approval.

Verify unauthenticated requests on every deploy URL, not just the main domain. Verify HTML, RSC/data requests, API paths and assets. A robots noindex directive is not access control.

## Environments

The `APP_ENV` labels in netlify.toml are descriptive, not a substitute for isolation. Use separate Supabase projects or verified isolated branches for development, preview/staging and production. Never provide production credentials to untrusted PR builds. Keep Stripe test credentials in every prelaunch environment.

Supabase project/org choice, costs and region remain to be confirmed before project creation. No Supabase migration has run.

## Integration checks before launch

- Actual Next.js build and Netlify adapter build pass; functions exist and respond.
- Supabase callback URLs allow the intended private preview/staging and production URLs.
- Browser uploads go directly to private Supabase Storage, without document bytes in a Next.js route or normal Netlify Function.
- Server validates ownership and storage object metadata before submitting extraction.
- Durable jobs continue after the browser closes; retries and duplicate events cannot duplicate billing/export.
- XLSX files are private and downloads use short-lived signed URLs.
- Stripe uses test mode until approved; signed webhooks use the correct environment and raw request body.
- Logs contain IDs and safe error codes, not document contents, signed URLs, tokens or provider response bodies.
- Review records, download authorization and row-level security are verified with two separate users.
- Production release and live billing each require explicit owner approval.

## Preview job caveat

Netlify Scheduled Functions execute on published deploys, not Deploy Previews or branch deploys. Therefore preview jobs cannot rely on a preview cron schedule. Choose a provider with verified callbacks, or use protected staging with a published scheduler only after its deployment is authorized. Callbacks must have their own verified authentication and any exemption from the preview gate must be narrow and tested.

## Rollback

Before each release, record the repository commit, Netlify deploy ID, environment revision and applied migrations. Restore the last verified Netlify deploy only when authorized. Restoring frontend code does not undo Supabase migrations or Stripe configuration. Use backward-compatible database changes and a separate recovery plan; never drop tables to roll back an interface change.

## Official references checked during foundation work

- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://docs.netlify.com/build/environment-variables/get-started/
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy

Compatibility checked at documentation level: App Router, Server Components, Route Handlers, dynamic rendering, CSS and Node-compatible Proxy APIs. Netlify's actual adapter/deployment behavior remains to be tested.
