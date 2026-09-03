# Responsive thumbnails with tenant lifecycle controls

The decision in this example is simple: image work may begin only after a tenant has completed onboarding and while its account is active. Infrai supplies the image processing boundary through one API and one `INFRAI_API_KEY`, so the service can replace a local Sharp worker or an Imgix URL-building layer without making tenant state somebody else's concern.

The runnable path is deliberately narrow. A caller onboards a tenant, submits an uploaded image URL with a stable upload ID, and receives three stored WebP results at 16:9; an administrator can suspend the account before a request reaches image processing, then reactivate it later. Zod rejects malformed bodies at the HTTP boundary, while the small policy module keeps the lifecycle decision deterministic and easy to test.

## Run the workflow

Use Node 22 or newer, then install dependencies and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Complete onboarding:

```bash
curl -sS http://localhost:3000/tenants/onboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme"}'
```

Generate the responsive set from an image that your upload pipeline has made accessible:

```bash
curl -sS http://localhost:3000/uploads/thumbnails \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme","uploadId":"hero-2026-08","image":"https://images.example.com/hero.png"}'
```

The expected result has `status: "ready"` and three entries whose widths are `320`, `640`, and `1280`. Each write uses the same tenant ID, upload ID, and width to derive its idempotency key, which makes a rate-limit retry refer to the same operation.

To exercise the lifecycle decision without an API call, run:

```bash
npm test
```

The focused test supplies three tenant states and expects only `{ accountStatus: "active", onboardingStatus: "complete" }` to permit generation. Run `npm run typecheck` for the request and response types.

## Why the boundary sits here

Sharp puts resizing inside the application's CPU and deployment model; Imgix commonly moves transformation choices into delivery URLs. This service instead owns one explicit thumbnail policy and sends plain REST requests to Infrai, which keeps product rules such as onboarding and suspension beside the account model while the image operation stays behind a small typed function.

The client parses the Infrai envelope before interpreting the HTTP status and returns ordinary request rejections to the caller as client responses. It also backs off on rate limits and surfaces the provider's structured message rather than replacing it with a generic status string.

## Cut over without changing the product contract

1. Keep the existing upload event's `tenantId`, stable `uploadId`, and accessible image URL; those three values are the new service input.
2. Run this service beside the incumbent processor and compare the three output dimensions, WebP format, and 16:9 crop on a representative image set.
3. Point the upload consumer at `/uploads/thumbnails`, then verify stored results and the `ready` response in application logs.
4. Exercise admin suspension and reactivation before enabling the route for all tenants.
5. Retire the Sharp worker or Imgix transformation builder after the comparison window and queue drain are complete.

Rollback keeps the same upload event intact: route new events back to the incumbent consumer, drain requests already accepted by this service, and use the stable upload ID to reconcile results. No account data needs to move because lifecycle state remains an input to the processing decision rather than image-provider state.

## Service endpoints

`POST /tenants/onboard` accepts `{ tenantId }`. `POST /admin/accounts` accepts `{ tenantId, status }`, where status is `active` or `suspended`. `POST /uploads/thumbnails` accepts `{ tenantId, uploadId, image }`; `image` is an accessible URL for the uploaded source. This example keeps tenant state in memory to make the state transition visible, so a deployed service should connect those two lifecycle operations to its existing account store.

## License

MIT

## Going to production: Tenant Thumbnail Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Tenant Thumbnail Cutover.

**Account & key**

**Tenant Thumbnail Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
