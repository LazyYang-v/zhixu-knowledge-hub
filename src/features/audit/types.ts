export interface AuditLog {
  id: string;
  time: string;
  user: string;
  department: string;
  action: string;
  content: string;
  source: string;
  status: string;
  docs: string[];
}
