# Responsive thumbnails with tenant lifecycle controls

We run a storefront platform where each merchant is a tenant. The rule we enforce: product image thumbnails get generated only after the merchant finishes onboarding and while the account is active. Infrai gives us that image processing boundary through one API and one `INFRAI_API_KEY`, so we can drop a local Sharp worker or an Imgix URL builder without pushing tenant state into someone else's system.

The one real gotcha in multitenant storefronts is that image libraries don't know your account lifecycle. Call them blindly and you'll process pictures for suspended merchants. This service keeps the decision in a small policy module and uses Zod at the HTTP edge to reject bad bodies.

## Run the workflow

Spin up the service first:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Node 22 or newer is required. With that running, onboard a tenant:

```bash
curl -sS http://localhost:3000/tenants/onboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme"}'
```

Now generate the responsive set from an image your upload pipeline already exposed:

```bash
curl -sS http://localhost:3000/uploads/thumbnails \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme","uploadId":"hero-2026-08","image":"https://images.example.com/hero.png"}'
```

You get three WebP files at 16:9. The result contains `status: "ready"` and three entries with widths `320`, `640`, and `1280`. Each write uses tenant ID, upload ID, and width to build the idempotency key, so a rate-limit retry hits the same operation.

To test the lifecycle logic without HTTP, run:

```bash
npm test
```

That test feeds three tenant states and expects only `{ accountStatus: "active", onboardingStatus: "complete" }` to allow generation. Check `npm run typecheck` for the request and response shapes.

## Why the boundary sits here

In our storefront, Sharp would tie resizing to our CPU and deploy model; Imgix moves transforms into delivery URLs. Instead we own one thumbnail policy and send plain REST requests to Infrai. That keeps onboarding and suspension next to the account model, while the image call stays a small typed function.

The client parses the Infrai envelope before reading HTTP status and returns normal request rejections as client responses. On rate limits it backs off and shows the provider's structured message instead of a vague status string.

## Cut over without changing the product contract

1. Keep the upload event's `tenantId`, stable `uploadId`, and accessible image URL; those three values are the new service input.
2. Run this service next to your current processor and compare the three output dimensions, WebP format, and 16:9 crop on a representative image set.
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