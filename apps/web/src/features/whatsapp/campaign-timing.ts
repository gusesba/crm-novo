export interface CampaignTiming {
  intervalSeconds: number;
  intervalVarianceSeconds: number;
  pauseEvery: number;
  pauseSeconds: number;
}

export const defaultCampaignTiming: CampaignTiming = {
  intervalSeconds: 10,
  intervalVarianceSeconds: 3,
  pauseEvery: 20,
  pauseSeconds: 60,
};
export const campaignTimingStorageKey = "crm:campaign-timing:v1";

export function validateCampaignTiming(value: unknown): CampaignTiming | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { intervalSeconds, intervalVarianceSeconds, pauseEvery, pauseSeconds } = value as CampaignTiming;
  if (![intervalSeconds, intervalVarianceSeconds, pauseEvery, pauseSeconds].every(Number.isSafeInteger) ||
      intervalSeconds < 3 || intervalSeconds > 3600 ||
      intervalVarianceSeconds < 0 || intervalVarianceSeconds > 1800 || intervalVarianceSeconds > intervalSeconds - 3 ||
      pauseEvery < 1 || pauseEvery > 500 || pauseSeconds < 0 || pauseSeconds > 3600) return null;
  return { intervalSeconds, intervalVarianceSeconds, pauseEvery, pauseSeconds };
}

export function loadCampaignTiming(): CampaignTiming {
  try {
    return validateCampaignTiming(JSON.parse(window.localStorage.getItem(campaignTimingStorageKey) || "null")) || { ...defaultCampaignTiming };
  } catch {
    return { ...defaultCampaignTiming };
  }
}

export function saveCampaignTiming(value: unknown): boolean {
  const timing = validateCampaignTiming(value);
  if (!timing) return false;
  try {
    window.localStorage.setItem(campaignTimingStorageKey, JSON.stringify(timing));
    return true;
  } catch {
    return false;
  }
}
