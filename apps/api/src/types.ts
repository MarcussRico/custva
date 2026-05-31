import type { UserRole } from "@custva/shared";

export interface AuthContext {
  userId: string;
  merchantId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
