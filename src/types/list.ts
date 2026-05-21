export interface TaskList {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
