import type { Input } from "./types";
export type EstimateInput = Pick<Input,"kind"|"model"|"resolution"|"ratio"|"quality"|"duration"> & { assets?:string[] };
export interface Estimate { units:number; billingEnabled:boolean; perSecond?:boolean; perToken?:boolean; referenceUnits?:number }
