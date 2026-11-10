// Shapes returned by /admin/users/{id}/models.
export interface ModelUse {
  model: string;
  name: string;
  kind: string;
  calls: number;
  succeeded: number;
  failed: number;
  active: number;
  pointsUnits: number;
  lastAt: string;
}
export interface ModelJob {
  id: string;
  model: string;
  name: string;
  kind: string;
  status: string;
  pointsUnits: number;
  billing?: string;
  prompt: string;
  error?: string;
  createdAt: string;
}
export interface ModelRecords {
  page: number;
  size: number;
  total: number;
  models: ModelUse[];
  jobs: ModelJob[];
  limited: boolean;
}
