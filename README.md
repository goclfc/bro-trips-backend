# bro-trips · backend

Express + TypeScript REST API for the bro-trips carpool app.
Stores users, cars, trips, and bookings in Postgres.
Auth: email+password (bcrypt) and Google OAuth (ID-token verification).

Frontend repo: see the sibling `bro-trips-frontend` repo.

## Tech

- Node.js 20+, Express 4, TypeScript
- `pg` (no ORM), `zod` for request validation
- `bcryptjs` for password hashing, `jsonwebtoken` for sessions
- `google-auth-library` for Google ID-token verification

## Local development

### 1. Postgres via Docker

```sh
docker compose up -d db
```

Postgres listens on `localhost:5433` to avoid clashing with any host install.
Credentials: `brotrips` / `brotrips`, database `brotrips`. Data persists in the
named volume `brotrips-pgdata`.

### 2. Configure env

```sh
cp .env.example .env
# edit .env — at minimum set JWT_SECRET to something long and random.
# GOOGLE_CLIENT_ID is optional: if unset/placeholder, /api/auth/google
# returns 503 instead of crashing.
```

| Variable           | Purpose                                                                 |
|--------------------|-------------------------------------------------------------------------|
| `DATABASE_URL`     | Postgres connection string. Defaults to the docker-compose Postgres.    |
| `PORT`             | API listen port. Default `4000`.                                        |
| `JWT_SECRET`       | HMAC secret for signing/verifying JWTs.                                 |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID. Optional; needed only for Google sign-in.   |
| `CORS_ORIGIN`      | Allowed Origin for CORS. Default `http://localhost:5173`.               |

### 3. Install deps and bootstrap the schema

```sh
npm install
npm run db:init      # applies src/schema.sql; idempotent, safe to re-run
```

### 4. Run

```sh
npm run dev          # tsx --watch on PORT (default 4000)
```

Sanity-check: `curl http://localhost:4000/api/health` → `{"ok":true}`.

## HTTP API

All endpoints under `/api`. Routes that need auth expect
`Authorization: Bearer <jwt>`.

### Auth

| Method | Path                | Body                                          | Notes |
|--------|---------------------|-----------------------------------------------|-------|
| POST   | `/auth/register`    | `{ email, password (>=8), name }`             | Returns `{ token, user }`. 409 if email taken. |
| POST   | `/auth/login`       | `{ email, password }`                         | Returns `{ token, user }`. 401 on bad creds. |
| POST   | `/auth/google`      | `{ credential }` (Google ID token)            | Returns `{ token, user }`. 503 if `GOOGLE_CLIENT_ID` unset. |
| GET    | `/auth/me`          | —                                             | Returns `{ user }` from the JWT. |

### Cars (auth required)

| Method | Path        | Body                                  | Notes |
|--------|-------------|---------------------------------------|-------|
| GET    | `/cars`     | —                                     | Caller's cars. |
| POST   | `/cars`     | `{ make, model, plate, seats (1-8) }` | Returns `{ car }`. |
| DELETE | `/cars/:id` | —                                     | 204 on success. |

### Trips (auth required)

| Method | Path                    | Body                                                                                  | Notes |
|--------|-------------------------|---------------------------------------------------------------------------------------|-------|
| GET    | `/trips`                | —                                                                                     | Upcoming trips (depart_at > now - 2h). Includes `seats_booked`, `booked_by_me`. |
| GET    | `/trips/mine`           | —                                                                                     | Trips the caller is driving. |
| POST   | `/trips`                | `{ car_id, from_address, to_address, depart_at (ISO), seats_total (1-8), notes? }`    | `car_id` must belong to caller. |
| DELETE | `/trips/:id`            | —                                                                                     | Driver only. |
| POST   | `/trips/:id/book`       | `{ seats (1-8) }`                                                                     | 400 if you're the driver, 409 if not enough free seats. Transactional with `SELECT … FOR UPDATE`. |
| DELETE | `/trips/:id/book`       | —                                                                                     | Cancels caller's booking. |
| GET    | `/trips/:id/passengers` | —                                                                                     | Driver only. |

### Bookings (auth required)

| Method | Path              | Notes |
|--------|-------------------|-------|
| GET    | `/bookings/mine`  | Trips the caller has booked, with their seat count. |

## Project layout

```
src/
├── server.ts            # express app + middleware
├── db.ts                # pg pool + query helper
├── db-init.ts           # applies schema.sql
├── schema.sql           # idempotent schema (CREATE IF NOT EXISTS + ALTERs)
├── auth.ts              # signToken, requireAuth middleware, AuthedRequest type
└── routes/
    ├── auth.ts          # /auth/register, /auth/login, /auth/google, /auth/me
    ├── cars.ts          # /cars CRUD
    ├── trips.ts         # /trips, booking, passengers
    └── bookings.ts      # /bookings/mine
```

## Deployment notes

- `npm run build` emits to `dist/`; `npm start` runs the built server.
- The schema is applied via `npm run db:init`. Run it once after the
  database is reachable (or as a post-deploy / release step).
- Don't reuse the dev `JWT_SECRET` in production — generate a new one
  (`openssl rand -hex 32`).
- For Google OAuth in production, add the production frontend origin to the
  OAuth client's Authorized JavaScript origins in Google Cloud Console.
- Set `CORS_ORIGIN` to your deployed frontend URL.
- The app is meant for a small trusted group — there are no rate limits or
  abuse protections built in.

## Common commands

```sh
docker compose up -d db        # start dev postgres
docker compose down            # stop (keeps volume)
docker compose down -v         # nuke postgres data
npm run db:init                # re-apply schema (idempotent)
npm run dev                    # api with --watch
npm run build && npm start     # production-mode run
```
