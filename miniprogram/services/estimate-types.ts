import type { Input } from "./types";
export type EstimateInput = Pick<Input,"kind"|"model"|"resolution"|"ratio"|"quality"|"duration">;
export interface Estimate { units:number; billingEnabled:boolean }
