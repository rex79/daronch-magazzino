import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELECT_ARTICOLO, getArticolo, getLunghezzaBarra, getMateriali, trovaOCreaMateriale, type Db } from './db.js';
import { applicaMovimento, parseNumero } from './domain.js';
import { esportaCsv, nomeFileExport } from './export-csv.js';
import type { Articolo, Modo } from './types.js';

class ErroreHttp extends Error {
    constructor(public status: number, message: string) { super(message); }
}

const testo = (v: unknown, campo: string): string => {
    if (typeof v !== 'string' || v.trim() === '') throw new ErroreHttp(400, `${campo} obbligatorio`);
    return v.trim();
};
const numero = (v: unknown, campo: string): number => {
    const n = parseNumero(v);
    if (!Number.isFinite(n)) throw new ErroreHttp(400, `${campo} non valido`);
    return n;
};
const spessoreOpz = (v: unknown): number | null =>
    v === undefined || v === null || v === '' || parseNumero(v) === 0 ? null : numero(v, 'spessore');

export function creaApp(db: Db, opts: { adminPassword?: string | undefined } = {}) {
    const app = express();
    app.use(express.json());

    const soloAdmin = (req: Request, _res: Response, next: NextFunction) => {
        if (opts.adminPassword && req.header('x-admin-password') !== opts.adminPassword) {
            return next(new ErroreHttp(401, 'Password amministratore errata'));
        }
        next();
    };

    // --- operatore: flusso a schermate ---------------------------------------
    app.get('/api/materiali', async (_req, res) => {
        res.json({ err: 'ok', data: await getMateriali(db) });
    });

    app.get('/api/forme', async (req, res) => {
        const data = await db.query(`SELECT DISTINCT m.forma FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id
                                     WHERE mt.nome = $1 ORDER BY m.forma`, [testo(req.query.materiale, 'materiale')]);
        res.json({ err: 'ok', data });
    });

    app.get('/api/misure', async (req, res) => {
        const data = await db.query(`SELECT m.id, m.misura, m.spessore, m.barre FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id
                                     WHERE mt.nome = $1 AND m.forma = $2 ORDER BY m.misura, m.spessore`,
            [testo(req.query.materiale, 'materiale'), testo(req.query.forma, 'forma')]);
        res.json({ err: 'ok', data });
    });

    // Trova l'articolo da materiale/forma/misura/(spessore). 404 se non esiste.
    app.get('/api/articolo', async (req, res) => {
        const spessore = spessoreOpz(req.query.spessore);
        const [row] = await db.query<Articolo>(`${SELECT_ARTICOLO} WHERE mt.nome = $1 AND m.forma = $2 AND m.misura = $3 AND COALESCE(m.spessore, 0) = $4`,
            [testo(req.query.materiale, 'materiale'), testo(req.query.forma, 'forma'), numero(req.query.misura, 'misura'), spessore ?? 0]);
        if (!row) throw new ErroreHttp(404, 'Articolo non riconosciuto');
        res.json({ err: 'ok', data: row });
    });

    app.get('/api/articoli/:id', async (req, res) => {
        const a = await getArticolo(db, Number(req.params.id));
        if (!a) throw new ErroreHttp(404, 'Articolo non trovato');
        res.json({ err: 'ok', data: a });
    });

    // quantita: positiva = carico, negativa = scarico
    app.post('/api/movimenti', async (req, res) => {
        const modo = req.body?.modo as Modo;
        if (modo !== 'barre' && modo !== 'kg') throw new ErroreHttp(400, 'modo deve essere "barre" o "kg"');
        const quantita = numero(req.body?.quantita, 'quantita');
        const lunghezza = await getLunghezzaBarra(db);
        const risultato = await db.transaction(async (tx) => {
            const a = await getArticolo(tx, Number(req.body?.articolo_id), true);
            if (!a) throw new ErroreHttp(404, 'Articolo non trovato');
            let r;
            try { r = applicaMovimento(a, modo, quantita, lunghezza); }
            catch (e) { throw new ErroreHttp(400, (e as Error).message); }
            await tx.query('UPDATE magazzino SET barre = $1, quantita = $2, updated_at = now() WHERE id = $3', [r.barre, r.quantita, a.id]);
            await tx.query('INSERT INTO movimenti (magazzino_id, delta_barre, barre_dopo, lunghezza_barra) VALUES ($1, $2, $3, $4)',
                [a.id, r.deltaBarre, r.barre, lunghezza]);
            return getArticolo(tx, a.id);
        });
        res.json({ err: 'ok', data: risultato });
    });

    // --- impostazioni ---------------------------------------------------------
    app.get('/api/impostazioni', async (_req, res) => {
        res.json({ err: 'ok', data: { lunghezza_barra_m: await getLunghezzaBarra(db) } });
    });

    app.put('/api/impostazioni', soloAdmin, async (req, res) => {
        const l = numero(req.body?.lunghezza_barra_m, 'lunghezza_barra_m');
        if (l <= 0) throw new ErroreHttp(400, 'La lunghezza deve essere maggiore di zero');
        await db.transaction(async (tx) => {
            await tx.query("UPDATE impostazioni SET valore = $1 WHERE chiave = 'lunghezza_barra_m'", [String(l)]);
            // i kg totali dipendono dalla lunghezza: li ricalcolo dalle barre
            await tx.query('UPDATE magazzino SET quantita = ROUND((barre * $1 * peso)::numeric, 3)::float8', [l]);
        });
        res.json({ err: 'ok', data: { lunghezza_barra_m: l } });
    });

    // --- amministrazione ------------------------------------------------------
    app.get('/api/admin/magazzino', soloAdmin, async (_req, res) => {
        res.json({ err: 'ok', data: await db.query(`${SELECT_ARTICOLO} ORDER BY mt.ordine, mt.nome, m.forma, m.misura, m.spessore`) });
    });

    // ?formato=excel -> ';', virgola decimale e BOM per Excel italiano
    app.get('/api/admin/export.csv', soloAdmin, async (req, res) => {
        res.type('text/csv; charset=utf-8')
            .attachment(nomeFileExport())
            .send(await esportaCsv(db, { excel: req.query.formato === 'excel' }));
    });

    const leggiArticolo = async (b: Record<string, unknown>, tx: Db) => ({
        materiale_id: await trovaOCreaMateriale(tx, testo(b.materiale, 'materiale')),
        forma: testo(b.forma, 'forma').toUpperCase(),
        misura: numero(b.misura, 'misura'),
        spessore: spessoreOpz(b.spessore),
        peso: numero(b.peso, 'peso'),
        note: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null,
    });
    const conVincolo = async <T>(fn: () => Promise<T>): Promise<T> => {
        try { return await fn(); }
        catch (e) {
            if ((e as { code?: string }).code === '23505') throw new ErroreHttp(409, 'Esiste già un articolo con questi dati');
            throw e;
        }
    };

    app.post('/api/admin/magazzino', soloAdmin, async (req, res) => {
        const lunghezza = await getLunghezzaBarra(db);
        const id = await conVincolo(() => db.transaction(async (tx) => {
            const d = await leggiArticolo(req.body ?? {}, tx);
            const [r] = await tx.query<{ id: number }>(
                'INSERT INTO magazzino (materiale_id, forma, misura, spessore, peso, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [d.materiale_id, d.forma, d.misura, d.spessore, d.peso, d.note]);
            const id = r!.id;
            const quantita = req.body?.quantita;
            if (quantita !== undefined && quantita !== '' && parseNumero(quantita) !== 0) {
                const m = applicaMovimento({ barre: 0, peso: d.peso }, req.body?.modo === 'kg' ? 'kg' : 'barre', numero(quantita, 'quantita'), lunghezza);
                await tx.query('UPDATE magazzino SET barre = $1, quantita = $2 WHERE id = $3', [m.barre, m.quantita, id]);
            }
            return id;
        }));
        res.status(201).json({ err: 'ok', data: await getArticolo(db, id) });
    });

    // modifica anagrafica; la giacenza si cambia solo con i movimenti
    app.put('/api/admin/magazzino/:id', soloAdmin, async (req, res) => {
        const id = Number(req.params.id);
        if (!(await getArticolo(db, id))) throw new ErroreHttp(404, 'Articolo non trovato');
        const lunghezza = await getLunghezzaBarra(db);
        await conVincolo(() => db.transaction(async (tx) => {
            const d = await leggiArticolo(req.body ?? {}, tx);
            await tx.query(`UPDATE magazzino SET materiale_id = $1, forma = $2, misura = $3, spessore = $4, peso = $5, note = $6,
                    quantita = ROUND((barre * $7 * $5)::numeric, 3)::float8, updated_at = now() WHERE id = $8`,
                [d.materiale_id, d.forma, d.misura, d.spessore, d.peso, d.note, lunghezza, id]);
        }));
        res.json({ err: 'ok', data: await getArticolo(db, id) });
    });

    app.delete('/api/admin/magazzino/:id', soloAdmin, async (req, res) => {
        const rows = await db.query('DELETE FROM magazzino WHERE id = $1 RETURNING id', [Number(req.params.id)]);
        if (!rows.length) throw new ErroreHttp(404, 'Articolo non trovato');
        res.json({ err: 'ok', data: null });
    });

    app.put('/api/admin/materiali/:id', soloAdmin, async (req, res) => {
        const rows = await db.query('UPDATE materiali SET ordine = $1 WHERE id = $2 RETURNING id',
            [Math.trunc(numero(req.body?.ordine, 'ordine')), Number(req.params.id)]);
        if (!rows.length) throw new ErroreHttp(404, 'Materiale non trovato');
        res.json({ err: 'ok', data: await getMateriali(db) });
    });

    // --- frontend statico (stessa app, stesso processo) -----------------------
    app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));

    app.use('/api', (_req, _res, next) => next(new ErroreHttp(404, 'Endpoint inesistente')));
    app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const status = e instanceof ErroreHttp ? e.status : 500;
        if (status === 500) console.error(e);
        res.status(status).json({ err: status === 500 ? 'Errore interno' : (e as Error).message });
    });
    return app;
}

