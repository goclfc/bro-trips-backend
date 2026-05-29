import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

const router = Router();

router.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT
       t.id, t.from_address, t.to_address, t.depart_at,
       u.name AS driver_name, u.picture AS driver_picture,
       c.make AS car_make, c.model AS car_model, c.plate AS car_plate,
       b.seats AS my_seats
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     JOIN users u ON u.id = t.driver_id
     JOIN cars  c ON c.id = t.car_id
     WHERE b.passenger_id = $1
     ORDER BY t.depart_at ASC`,
    [req.user!.id],
  );
  res.json({ bookings: rows });
});

export default router;
