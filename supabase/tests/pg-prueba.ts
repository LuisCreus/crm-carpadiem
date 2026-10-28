// Base de datos Postgres en memoria (PGlite) con lo mínimo de Supabase
// (esquema auth, roles y publicación de Realtime) para probar las migraciones.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const PREPARACION = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create publication supabase_realtime;
`;

export async function crearBaseDePrueba() {
  const db = new PGlite();
  await db.exec(PREPARACION);
  const carpeta = join(__dirname, "..", "migrations");
  for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(carpeta, archivo), "utf8"));
  }
  return db;
}

// Crea un usuario como si entrara con Microsoft y devuelve su id
export async function crearUsuario(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, '{}') returning id",
    [email],
  );
  return rows[0].id;
}

// Ejecuta como un usuario con sesión (rol authenticated + su id)
export async function comoUsuario<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${userId}'; set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}
