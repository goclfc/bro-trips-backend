CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  google_sub    TEXT UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  picture       TEXT,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS cars (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  plate       TEXT NOT NULL,
  seats       INT  NOT NULL CHECK (seats BETWEEN 1 AND 8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id            BIGSERIAL PRIMARY KEY,
  driver_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  car_id        BIGINT NOT NULL REFERENCES cars(id)  ON DELETE RESTRICT,
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  depart_at     TIMESTAMPTZ NOT NULL,
  seats_total   INT  NOT NULL CHECK (seats_total BETWEEN 1 AND 8),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trips_depart_at_idx ON trips (depart_at);

CREATE TABLE IF NOT EXISTS bookings (
  id            BIGSERIAL PRIMARY KEY,
  trip_id       BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  passenger_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats         INT  NOT NULL CHECK (seats BETWEEN 1 AND 8),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, passenger_id)
);
