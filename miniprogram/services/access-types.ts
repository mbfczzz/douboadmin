export interface AccessStatus {
  active: boolean;
  status: string;
  partnerId?: string;
  partnerName?: string;
  message?: string;
  // Registration step: name and SMS-verified phone are still missing.
  profileRequired?: boolean;
  name?: string;
  phone?: string;
}
