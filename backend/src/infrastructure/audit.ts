import type { Request } from 'express';
import { pool } from './database';

export async function writeAudit(req: Request, action: string, resource: string, resourceId?: string, detail: unknown = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, resource, resource_id, ip_address, user_agent, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [req.user?.id ?? null, action, resource, resourceId ?? null, req.ip, req.get('user-agent') ?? '', JSON.stringify(detail ?? {})],
    );
  } catch (error) {
    console.error('Audit log write failed:', error instanceof Error ? error.message : error);
  }
}
