import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { InfraiError } from "./infrai_image_client.js";
import { TenantThumbnailWorkflow, WorkflowError } from "./tenant_thumbnail_workflow.js";

const app = express();
const workflow = new TenantThumbnailWorkflow();
app.use(express.json({ limit: "2mb" }));

const tenantId = z.string().min(1).max(100);
const onboardingBody = z.object({ tenantId }).strict();
const accountBody = z.object({ tenantId, status: z.enum(["active", "suspended"]) }).strict();
const thumbnailBody = z.object({
  tenantId,
  uploadId: z.string().min(1).max(200),
  image: z.string().url(),
}).strict();

app.post("/tenants/onboard", async (request, response, next) => {
  try {
    const body = onboardingBody.parse(request.body);
    response.status(201).json({ tenantId: body.tenantId, state: workflow.onboard(body.tenantId) });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/accounts", async (request, response, next) => {
  try {
    const body = accountBody.parse(request.body);
    const state = workflow.setAccountStatus(body.tenantId, body.status);
    if (!state) throw new WorkflowError(404, "Tenant was not found");
    response.json({ tenantId: body.tenantId, state });
  } catch (error) {
    next(error);
  }
});

app.post("/uploads/thumbnails", async (request, response, next) => {
  try {
    const body = thumbnailBody.parse(request.body);
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    response.status(201).json(await workflow.generate({ ...body, apiKey }));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request body", issues: error.issues });
    return;
  }
  if (error instanceof WorkflowError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof InfraiError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    response.status(status).json({ error: error.message, details: error.details });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Unexpected service error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Thumbnail service listening on http://localhost:${port}`));
