export type UserRole = 'SUPER_ADMIN' | 'LEADER' | 'MEMBER';
export interface SessionUser {
  id: string;
  parishId: string | null;
  memberId: string | null;
  name: string;
  email: string;
  role: UserRole;
  initials: string;
}
export interface AuthenticatedRequest {
  cookies?: Record<string, string>;
  user: SessionUser;
}
