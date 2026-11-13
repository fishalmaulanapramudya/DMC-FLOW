import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

export const attachRequestId: RequestHandler = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};
