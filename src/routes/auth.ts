import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { query } from '../db.js';
import { signToken, requireAuth, type AuthedRequest } from '../auth.js';

const router = Router();
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleBody = z.object({ credential: z.string().min(10) });

router.post('/google', async (req, res) => {
  const parsed = googleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'credential required' });
    return;
  }
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.startsWith('your-')) {
    res.status(503).json({ error: 'google sign-in not configured on the server' });
    return;
  }
  let payload;
  try {
    const ticket = await google.verifyIdToken({
      idToken: parsed.data.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ error: 'invalid google credential' });
    return;
  }
  if (!payload?.sub || !payload.email) {
    res.status(401).json({ error: 'incomplete google profile' });
    return;
  }

  const email = payload.email.toLowerCase();
  const { rows } = await query<{ id: string; email: string; name: string }>(
    `INSERT INTO users (google_sub, email, name, picture)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture
     RETURNING id, email, name`,
    [payload.sub, email, payload.name ?? email, payload.picture ?? null],
  );
  const user = { id: Number(rows[0].id), email: rows[0].email, name: rows[0].name };
  res.json({ token: signToken(user), user });
});

const registerBody = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(60),
});

router.post('/register', async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const hash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const { rows } = await query<{ id: string; email: string; name: string }>(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [email, parsed.data.name, hash],
    );
    const user = { id: Number(rows[0].id), email: rows[0].email, name: rows[0].name };
    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'email already registered' });
      return;
    }
    throw e;
  }
});

const loginBody = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

router.post('/login', async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const { rows } = await query<{
    id: string;
    email: string;
    name: string;
    password_hash: string | null;
  }>(
    `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
    [email],
  );
  const u = rows[0];
  if (!u || !u.password_hash) {
    res.status(401).json({ error: 'invalid email or password' });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, u.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'invalid email or password' });
    return;
  }
  const user = { id: Number(u.id), email: u.email, name: u.name };
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

export default router;
