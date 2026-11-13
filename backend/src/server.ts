import 'dotenv/config';
import dotenv from 'dotenv';
import { app } from './app';
import { pool } from './infrastructure/database';

dotenv.config();
const port=Number(process.env.PORT||8000);

async function start(){
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET harus diatur dengan secret acak minimal 32 karakter.');
  await pool.query('SELECT 1');
  const server=app.listen(port,'0.0.0.0',()=>console.log(`D-Pay API listening on http://0.0.0.0:${port}`));
  const shutdown=()=>server.close(()=>{pool.end().finally(()=>process.exit(0));});
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
start().catch(error=>{console.error('Backend could not start. Check DATABASE_URL and database readiness.',error);process.exit(1);});
