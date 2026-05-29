import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

const router = Router();

const carBody = z.object({
  make: z.string().min(1).max(40),
  model: z.string().min(1).max(40),
  plate: z.string().min(1).max(20),
  seats: z.number().int().min(1).max(8),
});

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT id, make, model, plate, seats FROM cars WHERE user_id = $1 ORDER BY id DESC`,
    [req.user!.id],
  );
  res.json({ cars: rows });
});

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = carBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { make, model, plate, seats } = parsed.data;
  const { rows } = await query(
    `INSERT INTO cars (user_id, make, model, plate, seats)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, make, model, plate, seats`,
    [req.user!.id, make, model, plate, seats],
  );
  res.status(201).json({ car: rows[0] });
});

router.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const r = await query(`DELETE FROM cars WHERE id = $1 AND user_id = $2`, [id, req.user!.id]);
  if (r.rowCount === 0) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(204).end();
});

export default router;
