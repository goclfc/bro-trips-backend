import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.JWT_SECRET!;

export type AuthedUser = { id: number; email: string; name: string };

export function signToken(u: AuthedUser): string {
  return jwt.sign(u, SECRET, { expiresIn: '30d' });
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), SECRET) as AuthedUser;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
