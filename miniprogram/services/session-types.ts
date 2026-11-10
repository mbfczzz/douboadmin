export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
  provider: string;
}
export interface LoginResponse {
  activationRequired?: boolean;
  token: string;
  userId: string;
  expiresIn: number;
  provider: string;
  isNewUser: boolean;
}
