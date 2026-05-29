import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import carRoutes from './routes/cars.js';
import tripRoutes from './routes/trips.js';
import bookingRoutes from './routes/bookings.js';

const app = express();

const normalize = (o: string) => o.trim().replace(/\/+$/, '');

// Hardcoded so a misconfigured CORS_ORIGIN env var can't break the live site.
// The deployed frontend is served at bro-tips.usectl.com (no second "r");
// bro-trips is kept too in case the domain is ever corrected to match the repo.
const HARDCODED_ORIGINS = [
  'https://bro-tips.usectl.com',
  'https://bro-trips.usectl.com',
  'http://localhost:5173',
];

const allowedOrigins = [
  ...HARDCODED_ORIGINS,
  ...(process.env.CORS_ORIGIN ?? '').split(','),
]
  .map(normalize)
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (no Origin header) and any allowlisted origin.
      if (!origin || allowedOrigins.includes(normalize(origin))) {
        callback(null, true);
      } else {
        callback(new Error(`origin not allowed: ${origin}`));
      }
    },
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`api on http://localhost:${port}`));
