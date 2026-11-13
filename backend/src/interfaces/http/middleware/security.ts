import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../../infrastructure/database';

const developmentSecret = 'unsafe-development-secret-replace-me-000000';
function getJwtSecret() { return process.env.JWT_SECRET || developmentSecret; }
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('JWT_SECRET must be set to a random string with at least 32 characters before deployment.');
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login kembali.' });
  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string') return res.status(401).json({ error: 'Token tidak valid.' });
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.status, r.id AS role_id, r.role_key, r.name AS role_name,
              COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::varchar[]) AS permissions
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE u.id = $1 GROUP BY u.id, u.email, u.full_name, u.status, r.id, r.role_key, r.name`, [decoded.sub],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active') return res.status(401).json({ error: 'Akun tidak aktif atau sesi telah dicabut.' });
    req.user = { id: row.id, email: row.email, fullName: row.full_name, roleId: row.role_id, roleKey: row.role_key, roleName: row.role_name, permissions: row.permissions };
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa.' });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    // Deny-by-default: every protected operation must name an explicit permission.
    if (req.user.roleKey !== 'superadmin' && !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Akses ditolak: izin tidak diberikan untuk akun ini.', requiredPermission: permission });
    }
    next();
  };
}

export function requireAnyRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    if (req.user.roleKey !== 'superadmin' && !roles.includes(req.user.roleKey)) return res.status(403).json({ error: 'Role tidak diizinkan untuk operasi ini.' });
    next();
  };
}
