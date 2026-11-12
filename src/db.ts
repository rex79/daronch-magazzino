import pg from 'pg';
import type { Articolo, Materiale } from './types.js';

export const LUNGHEZZA_BARRA_DEFAULT = 3;

/** Interfaccia minima sul database: implementata da `pg` in produzione e da PGlite nei test. */
export interface Db {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    exec(sql: string): Promise<void>;
    transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}

const URL_LOCALE = 'postgresql://localhost:5432/magazzino';

export function apriDb(url = process.env.DATABASE_URL ?? URL_LOCALE): Db {
    // i database gratuiti vanno in pausa: la prima connessione può richiedere qualche secondo
    const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 30_000, idleTimeoutMillis: 30_000 });
    pool.on('error', (e) => console.error('Errore sulla connessione al database:', e.message));
    const su = (c: pg.Pool | pg.PoolClient): Db => ({
        query: async (sql, params) => (await c.query(sql, params as unknown[])).rows,
        exec: async (sql) => { await c.query(sql); },
        transaction: async (fn) => {
            const client = c instanceof pg.Pool ? await c.connect() : c;
            try {
                await client.query('BEGIN');
                const r = await fn(su(client));
                await client.query('COMMIT');
                return r;
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                throw e;
            } finally {
                if (c instanceof pg.Pool) (client as pg.PoolClient).release();
            }
        },
        close: async () => { if (c instanceof pg.Pool) await c.end(); },
    });
    return su(pool);
}

export async function inizializza(db: Db): Promise<void> {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS impostazioni (
        chiave TEXT PRIMARY KEY,
        valore TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS materiali (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE,
        ordine INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS magazzino (
        id SERIAL PRIMARY KEY,
        materiale_id INTEGER NOT NULL REFERENCES materiali(id),
        forma TEXT NOT NULL,
        misura DOUBLE PRECISION NOT NULL,
        spessore DOUBLE PRECISION,
        peso DOUBLE PRECISION NOT NULL DEFAULT 0,
        barre DOUBLE PRECISION NOT NULL DEFAULT 0,
        quantita DOUBLE PRECISION NOT NULL DEFAULT 0,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS magazzino_unico
        ON magazzino (materiale_id, forma, misura, (COALESCE(spessore, 0)));
      CREATE TABLE IF NOT EXISTS movimenti (
        id SERIAL PRIMARY KEY,
        magazzino_id INTEGER NOT NULL REFERENCES magazzino(id) ON DELETE CASCADE,
        delta_barre DOUBLE PRECISION NOT NULL,
        barre_dopo DOUBLE PRECISION NOT NULL,
        lunghezza_barra DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await db.query("INSERT INTO impostazioni (chiave, valore) VALUES ('lunghezza_barra_m', $1) ON CONFLICT DO NOTHING",
        [String(LUNGHEZZA_BARRA_DEFAULT)]);
}

export const SELECT_ARTICOLO = `
  SELECT m.id, m.materiale_id, mt.nome AS materiale, m.forma, m.misura, m.spessore,
         m.peso, m.barre, m.quantita, m.note
  FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id`;

export async function getLunghezzaBarra(db: Db): Promise<number> {
    const [r] = await db.query<{ valore: string }>("SELECT valore FROM impostazioni WHERE chiave = 'lunghezza_barra_m'");
    return Number(r?.valore ?? LUNGHEZZA_BARRA_DEFAULT);
}

export const getMateriali = (db: Db): Promise<Materiale[]> =>
    db.query<Materiale>('SELECT id, nome, ordine FROM materiali ORDER BY ordine, nome');

/** `bloccaRiga` serve dentro una transazione per evitare movimenti simultanei sullo stesso articolo. */
export async function getArticolo(db: Db, id: number, bloccaRiga = false): Promise<Articolo | undefined> {
    const [r] = await db.query<Articolo>(`${SELECT_ARTICOLO} WHERE m.id = $1${bloccaRiga ? ' FOR UPDATE OF m' : ''}`, [id]);
    return r;
}

export async function trovaOCreaMateriale(db: Db, nome: string): Promise<number> {
    await db.query('INSERT INTO materiali (nome) VALUES ($1) ON CONFLICT DO NOTHING', [nome]);
    const [r] = await db.query<{ id: number }>('SELECT id FROM materiali WHERE nome = $1', [nome]);
    return r!.id;
}
