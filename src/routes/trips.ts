import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

const router = Router();

const tripBody = z.object({
  car_id: z.number().int().positive(),
  from_address: z.string().min(1).max(200),
  to_address: z.string().min(1).max(200),
  depart_at: z.string().datetime(),
  seats_total: z.number().int().min(1).max(8),
  notes: z.string().max(500).optional().nullable(),
});

const tripListSelect = `
  SELECT
    t.id, t.from_address, t.to_address, t.depart_at, t.seats_total, t.notes,
    t.driver_id::int AS driver_id, u.name AS driver_name, u.picture AS driver_picture,
    c.make AS car_make, c.model AS car_model, c.plate AS car_plate,
    COALESCE((SELECT SUM(seats) FROM bookings b WHERE b.trip_id = t.id), 0)::int AS seats_booked,
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.trip_id = t.id AND b.passenger_id = $1
    ) AS booked_by_me
  FROM trips t
  JOIN users u ON u.id = t.driver_id
  JOIN cars  c ON c.id = t.car_id
`;

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `${tripListSelect}
     WHERE t.depart_at > now() - INTERVAL '2 hours'
     ORDER BY t.depart_at ASC`,
    [req.user!.id],
  );
  res.json({ trips: rows });
});

router.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `${tripListSelect}
     WHERE t.driver_id = $1
     ORDER BY t.depart_at DESC`,
    [req.user!.id],
  );
  res.json({ trips: rows });
});

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = tripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { car_id, from_address, to_address, depart_at, seats_total, notes } = parsed.data;

  const car = await query(`SELECT id FROM cars WHERE id = $1 AND user_id = $2`, [
    car_id,
    req.user!.id,
  ]);
  if (car.rowCount === 0) {
    res.status(400).json({ error: 'car does not belong to you' });
    return;
  }

  const { rows } = await query(
    `INSERT INTO trips (driver_id, car_id, from_address, to_address, depart_at, seats_total, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [req.user!.id, car_id, from_address, to_address, depart_at, seats_total, notes ?? null],
  );
  res.status(201).json({ id: rows[0].id });
});

router.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const r = await query(`DELETE FROM trips WHERE id = $1 AND driver_id = $2`, [id, req.user!.id]);
  if (r.rowCount === 0) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(204).end();
});

const bookBody = z.object({ seats: z.number().int().min(1).max(8) });

router.post('/:id/book', requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const parsed = bookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const seats = parsed.data.seats;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const trip = await client.query(
      `SELECT id, driver_id, seats_total,
              COALESCE((SELECT SUM(seats) FROM bookings b WHERE b.trip_id = trips.id), 0)::int AS seats_booked
       FROM trips WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (trip.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'trip not found' });
      return;
    }
    const t = trip.rows[0];
    if (Number(t.driver_id) === req.user!.id) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'you are the driver' });
      return;
    }
    if (t.seats_booked + seats > t.seats_total) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'not enough free seats' });
      return;
    }
    await client.query(
      `INSERT INTO bookings (trip_id, passenger_id, seats)
       VALUES ($1, $2, $3)
       ON CONFLICT (trip_id, passenger_id)
       DO UPDATE SET seats = EXCLUDED.seats`,
      [id, req.user!.id, seats],
    );
    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id/book', requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const r = await query(`DELETE FROM bookings WHERE trip_id = $1 AND passenger_id = $2`, [
    id,
    req.user!.id,
  ]);
  if (r.rowCount === 0) {
    res.status(404).json({ error: 'no booking' });
    return;
  }
  res.status(204).end();
});

router.get('/:id/passengers', requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const owns = await query(`SELECT 1 FROM trips WHERE id = $1 AND driver_id = $2`, [
    id,
    req.user!.id,
  ]);
  if (owns.rowCount === 0) {
    res.status(403).json({ error: 'only the driver can see passengers' });
    return;
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.picture, b.seats
     FROM bookings b JOIN users u ON u.id = b.passenger_id
     WHERE b.trip_id = $1 ORDER BY b.created_at`,
    [id],
  );
  res.json({ passengers: rows });
});

export default router;
