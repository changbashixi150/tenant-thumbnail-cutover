import { processThumbnail, type ProcessedImage } from "./infrai_image_client.js";
import {
  canGenerateThumbnails,
  thumbnailWidths,
  type AccountStatus,
  type TenantState,
} from "./thumbnail_policy.js";

export interface ThumbnailBatch {
  tenantId: string;
  uploadId: string;
  status: "ready";
  thumbnails: Array<{ width: number; image: ProcessedImage }>;
}

export class TenantThumbnailWorkflow {
  private readonly tenants = new Map<string, TenantState>();

  onboard(tenantId: string): TenantState {
    const state: TenantState = { accountStatus: "active", onboardingStatus: "complete" };
    this.tenants.set(tenantId, state);
    return state;
  }

  setAccountStatus(tenantId: string, accountStatus: AccountStatus): TenantState | undefined {
    const current = this.tenants.get(tenantId);
    if (!current) return undefined;
    const next = { ...current, accountStatus };
    this.tenants.set(tenantId, next);
    return next;
  }

  async generate(input: {
    tenantId: string;
    uploadId: string;
    image: string;
    apiKey: string;
  }): Promise<ThumbnailBatch> {
    const tenant = this.tenants.get(input.tenantId);
    if (!tenant) throw new WorkflowError(404, "Tenant has not completed onboarding");
    if (!canGenerateThumbnails(tenant)) {
      throw new WorkflowError(409, "Thumbnail generation is paused for this account");
    }

    const thumbnails = await Promise.all(
      thumbnailWidths.map(async (width) => ({
        width,
        image: await processThumbnail({
          apiKey: input.apiKey,
          image: input.image,
          width,
          height: Math.round((width * 9) / 16),
          idempotencyKey: `${input.tenantId}:${input.uploadId}:${width}`,
        }),
      })),
    );

    return { tenantId: input.tenantId, uploadId: input.uploadId, status: "ready", thumbnails };
  }
}

export class WorkflowError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "WorkflowError";
  }
}
