export interface AccessStatus {
  active: boolean;
  status: string;
  partnerId?: string;
  partnerName?: string;
  message?: string;
  // Name is required; phone verification depends on the server's SMS setup.
  profileRequired?: boolean;
  // Missing on older APIs: keep SMS validation unless explicitly disabled.
  smsRequired?: boolean;
  name?: string;
  phone?: string;
}
