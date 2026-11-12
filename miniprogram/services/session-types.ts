export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
  provider: string;
}
export interface PendingLogin {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
}
export interface LoginExchange {
  phoneCode?: string;
  generation: number;
  mode: string;
  promise: Promise<void>;
}
export interface LoginResponse {
  activationRequired?: boolean;
  token: string;
  userId: string;
  expiresIn: number;
  provider: string;
  isNewUser: boolean;
}
