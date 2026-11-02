export interface ModelSettings {
  description?: string;
  icon?: string;
  costUsd?: string;
  estSeconds?: number;
  badges?: { text: string; tone: "hot" | "new" | "info" }[];
  modes?: string[];
  resolutions?: string[];
  ratios?: string[];
  qualities?: string[];
  durations?: number[];
  maxRefImages?: number;
  maxRefImageSizeMB?: number;
  refLimits?: Record<string, number>;
  omniReferences?: Record<string, boolean>;
  defaultPrompt?: string;
  ideas?: string[];
  maxPromptChars?: number;
  videoBillingMode?: "duration" | "per_request";
  priceMatrix?: Record<string, Record<string, number>>;
  pricePerRequestByResolution?: Record<string, number>;
  errorHints?: { contains: string; message: string }[];
  availabilityStatus?: "normal" | "maintenance";
}
