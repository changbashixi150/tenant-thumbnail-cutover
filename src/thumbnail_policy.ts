export type AccountStatus = "active" | "suspended";
export type OnboardingStatus = "pending" | "complete";

export interface TenantState {
  accountStatus: AccountStatus;
  onboardingStatus: OnboardingStatus;
}

export const thumbnailWidths = [320, 640, 1280] as const;

export function canGenerateThumbnails(tenant: TenantState): boolean {
  return tenant.accountStatus === "active" && tenant.onboardingStatus === "complete";
}
