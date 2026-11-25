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
  hideQuality?: boolean;
  hideResolution?: boolean;
  durations?: number[];
  maxRefImages?: number;
  maxRefImageSizeMB?: number;
  refLimits?: Record<string, number>;
  omniReferences?: Record<string, boolean>;
  defaultPrompt?: string;
  ideas?: string[];
  maxPromptChars?: number;
  videoBillingMode?: "duration" | "per_request";
  referenceVideoBillingEnabled?: boolean;
  referenceVideoPricePercent?: number;
  // 火山方舟 Seedance: points per million video tokens by output resolution.
  videoTokenPrices?: Record<string, { plain: number; withVideo: number }>;
  priceMatrix?: Record<string, Record<string, number>>;
  pricePerRequestByResolution?: Record<string, number>;
  tokenInputPrice?: number;
  tokenOutputPrice?: number;
  maxOutputTokens?: number;
  tokenCachedPrice?: number; // unset: cache hits cost the input price
  peakPriceRate?: number;
  errorHints?: { contains: string; message: string }[];
  availabilityStatus?: "normal" | "maintenance";
}
