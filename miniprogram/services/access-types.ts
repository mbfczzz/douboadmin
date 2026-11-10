export interface AccessStatus {
  active: boolean;
  canBrowse?: boolean;
  status: string;
  partnerId?: string;
  partnerName?: string;
  message?: string;
  // Name and phone are required; SMS setup determines verification.
  profileRequired?: boolean;
  // Missing on older APIs: keep SMS validation unless explicitly disabled.
  smsRequired?: boolean;
  name?: string;
  phone?: string;
}
