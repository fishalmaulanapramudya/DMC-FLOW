import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' });

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.name === 'ZodError') return res.status(400).json({ error: 'Data tidak valid.', details: error.issues });
  if (error?.name === 'CorsOriginError') {
    console.warn('CORS rejected origin:', error.message);
    return res.status(403).json({ error: 'Origin frontend tidak diizinkan oleh CORS. Periksa FRONTEND_URL atau gunakan /api melalui proxy frontend.' });
  }
  console.error('Unhandled request error:', error instanceof Error ? error.message : error);
  return res.status(500).json({ error: 'Terjadi kesalahan internal. Coba kembali.' });
};
