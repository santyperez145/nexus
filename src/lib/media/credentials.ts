export type VideoCredential = {
  provider: "fal" | "replicate";
  apiKey: string;
  isByok: boolean;
};

export function selectVideoCredential(input: {
  falByok?: string;
  replicateByok?: string;
  falPlatform?: string;
  replicatePlatform?: string;
}): VideoCredential | null {
  if (input.falByok?.trim()) {
    return { provider: "fal", apiKey: input.falByok.trim(), isByok: true };
  }
  if (input.replicateByok?.trim()) {
    return { provider: "replicate", apiKey: input.replicateByok.trim(), isByok: true };
  }
  if (input.falPlatform?.trim()) {
    return { provider: "fal", apiKey: input.falPlatform.trim(), isByok: false };
  }
  if (input.replicatePlatform?.trim()) {
    return { provider: "replicate", apiKey: input.replicatePlatform.trim(), isByok: false };
  }
  return null;
}
