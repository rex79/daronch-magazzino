// Solo test: Postgres reale in-process (PGlite), nessun server da installare.
import { PGlite } from '@electric-sql/pglite';
import { inizializza, type Db } from './db.js';

type Eseguibile = Pick<PGlite, 'query' | 'exec'>;

export async function apriDbTest(): Promise<Db> {
    const pg = new PGlite();
    const su = (c: Eseguibile, tx: boolean): Db => ({
        query: async (sql, params) => (await c.query(sql, params as unknown[])).rows as never,
        exec: async (sql) => { await c.exec(sql); },
        transaction: (fn) => tx ? fn(su(c, true)) : pg.transaction((t) => fn(su(t as Eseguibile, true))),
        close: async () => { if (!tx) await pg.close(); },
    });
    const db = su(pg, false);
    await inizializza(db);
    return db;
}
