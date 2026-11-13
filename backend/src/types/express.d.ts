import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        fullName: string;
        roleId: string;
        roleKey: string;
        roleName: string;
        permissions: string[];
      };
      requestId?: string;
    }
  }
}
export {};
