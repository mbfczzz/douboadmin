export type Code = { code: string; qr: string };
export interface Child {
  roleName?: string;
  id: string;
  name: string;
  role: string;
  status: string;
  members: number;
  account: string;
  scanned: boolean;
  createdAt: string;
}
export interface Center {
  roleName?: string;
  name: string;
  status: string;
  role: string; // branch, s1 or s2
  members: number;
  codes: { member?: Code; s1?: Code; s2?: Code };
  children?: Child[];
  account: string;
  owner: boolean; // registered by scanning; manages its own login
  password?: string;
  passwordChanged?: boolean;
}

