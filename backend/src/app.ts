import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { attachRequestId } from './interfaces/http/middleware/request-id';
import { errorHandler, notFound } from './interfaces/http/middleware/errors';
import { authRouter } from './interfaces/http/routes/auth';
import { productsRouter } from './interfaces/http/routes/products';
import { posRouter } from './interfaces/http/routes/pos';
import { usersRouter } from './interfaces/http/routes/users';
import { walletRouter } from './interfaces/http/routes/wallet';
import { salesRouter } from './interfaces/http/routes/sales';
import { financeRouter } from './interfaces/http/routes/finance';
import { rolesRouter } from './interfaces/http/routes/roles';
import { shiftsRouter } from './interfaces/http/routes/shifts';

export const app=express();
app.disable('x-powered-by');
app.use(attachRequestId);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * In local development, allow only loopback and private-LAN HTTP origins so a phone
 * on the same Wi-Fi can use the Vite dev server. Production remains exact-origin only
 * through FRONTEND_URL; never use a wildcard origin for the school deployment.
 */
function isAllowedDevelopmentOrigin(origin: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:') return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || isPrivateIpv4(hostname);
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, '')) || isAllowedDevelopmentOrigin(origin)) return callback(null, true);
    const error = new Error(`Origin tidak diizinkan oleh CORS: ${origin}`);
    error.name = 'CorsOriginError';
    return callback(error);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  maxAge: 600,
}));
app.use(compression());
app.use(express.json({limit:'1mb'}));
app.use(morgan(process.env.NODE_ENV==='production'?'combined':'dev'));
app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'dmc-flow-api',timestamp:new Date().toISOString()}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:50,standardHeaders:true,legacyHeaders:false,message:{error:'Terlalu banyak percobaan. Coba lagi beberapa saat.'}}),authRouter);
app.use('/api/products',productsRouter);
app.use('/api/pos',posRouter);
app.use('/api/shifts',shiftsRouter);
app.use('/api/users',usersRouter);
app.use('/api/wallet',walletRouter);
app.use('/api/sales',salesRouter);
app.use('/api',financeRouter);
app.use('/api/roles',rolesRouter);
app.use(notFound);
app.use(errorHandler);
