import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { PERMISSIONS } from '../../../domain/permissions';
import { requireAuth, requirePermission } from '../middleware/security';

export const rolesRouter=Router();rolesRouter.use(requireAuth);
rolesRouter.get('/',requirePermission('roles.manage'),async(_req,res,next)=>{
  try{
    const roles=await pool.query(`SELECT r.id,r.role_key AS "roleKey",r.name,r.description,r.is_system AS "isSystem",COALESCE(array_agg(rp.permission_code) FILTER(WHERE rp.permission_code IS NOT NULL),ARRAY[]::varchar[]) AS permissions,COUNT(u.id)::int AS "userCount" FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN users u ON u.role_id=r.id GROUP BY r.id ORDER BY r.is_system DESC,r.name`);
    return res.json({roles:roles.rows,permissions:PERMISSIONS});
  }catch(error){return next(error);}
});
rolesRouter.post('/',requirePermission('roles.manage'),async(req,res,next)=>{
  try{
    const input=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(240).optional().default(''),permissions:z.array(z.string()).max(100).default([])}).parse(req.body);
    const allowed=new Set<string>(PERMISSIONS.map(p=>p.code));if(input.permissions.some(code=>!allowed.has(code)))return res.status(400).json({error:'Daftar izin berisi kode yang tidak dikenal.'});
    const base=input.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32)||'custom-role';
    const roleKey=`custom-${base}`;
    const client=await pool.connect();
    try{await client.query('BEGIN');const role=await client.query(`INSERT INTO roles(role_key,name,description,is_system) VALUES($1,$2,$3,false) RETURNING id,role_key AS "roleKey",name,description`,[`${roleKey}-${Date.now().toString().slice(-5)}`,input.name,input.description]);for(const code of input.permissions)await client.query(`INSERT INTO role_permissions(role_id,permission_code) VALUES($1,$2)`,[role.rows[0].id,code]);await client.query('COMMIT');await writeAudit(req,'role.create','role',role.rows[0].id,{permissionCount:input.permissions.length});return res.status(201).json({role:{...role.rows[0],permissions:input.permissions}});}catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }catch(error){return next(error);}
});
rolesRouter.put('/:id/permissions',requirePermission('roles.manage'),async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const input=z.object({permissions:z.array(z.string()).max(100)}).parse(req.body);const allowed=new Set<string>(PERMISSIONS.map(p=>p.code));if(input.permissions.some(code=>!allowed.has(code)))return res.status(400).json({error:'Daftar izin berisi kode yang tidak dikenal.'});
    await client.query('BEGIN');const role=await client.query(`SELECT id,role_key FROM roles WHERE id=$1 FOR UPDATE`,[req.params.id]);if(!role.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Role tidak ditemukan.'});}if(role.rows[0].role_key==='superadmin'){await client.query('ROLLBACK');return res.status(400).json({error:'Hak akses superadmin tidak dapat dikurangi lewat editor role.'});}
    await client.query(`DELETE FROM role_permissions WHERE role_id=$1`,[req.params.id]);for(const code of input.permissions)await client.query(`INSERT INTO role_permissions(role_id,permission_code) VALUES($1,$2)`,[req.params.id,code]);await client.query('COMMIT');await writeAudit(req,'role.permissions.update','role',req.params.id,{permissions:input.permissions});return res.json({message:'Izin role diperbarui dan berlaku pada request berikutnya.',permissions:input.permissions});
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);return next(error);}finally{client.release();}
});

rolesRouter.delete('/:id', requirePermission('roles.manage'), async (req,res,next) => {
  try {
    const role = await pool.query(`SELECT id, role_key, is_system FROM roles WHERE id=$1`, [req.params.id]);
    if (!role.rowCount) return res.status(404).json({ error: 'Role tidak ditemukan.' });
    if (role.rows[0].role_key === 'superadmin' || role.rows[0].is_system) {
      return res.status(400).json({ error: 'Role bawaan sistem tidak dapat dihapus.' });
    }

    const assigned = await pool.query(`SELECT 1 FROM users WHERE role_id=$1 LIMIT 1`, [req.params.id]);
    if (assigned.rowCount) {
      return res.status(409).json({ error: 'Role ini masih dipakai akun. Ubah role pengguna terlebih dahulu.' });
    }

    await pool.query(`DELETE FROM roles WHERE id=$1`, [req.params.id]);
    await writeAudit(req, 'role.delete', 'role', req.params.id, { deleted: true });
    return res.json({ message: 'Role custom berhasil dihapus.' });
  } catch (error) { return next(error); }
});
