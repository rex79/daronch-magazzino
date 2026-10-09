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
    app.get('/api/materiali', (_req, res) => {
        res.json({ err: 'ok', data: getMateriali(db) });
    });

    app.get('/api/forme', (req, res) => {
        const data = db.prepare(`SELECT DISTINCT m.forma FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id
                                 WHERE mt.nome = ? ORDER BY m.forma`).all(testo(req.query.materiale, 'materiale'));
        res.json({ err: 'ok', data });
    });

    app.get('/api/misure', (req, res) => {
        const data = db.prepare(`SELECT m.id, m.misura, m.spessore, m.barre FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id
                                 WHERE mt.nome = ? AND m.forma = ? ORDER BY m.misura, m.spessore`)
            .all(testo(req.query.materiale, 'materiale'), testo(req.query.forma, 'forma'));
        res.json({ err: 'ok', data });
    });

    // Trova l'articolo da materiale/forma/misura/(spessore). 404 se non esiste.
    app.get('/api/articolo', (req, res) => {
        const spessore = spessoreOpz(req.query.spessore);
        const row = db.prepare(`${SELECT_ARTICOLO} WHERE mt.nome = ? AND m.forma = ? AND m.misura = ? AND IFNULL(m.spessore, 0) = ?`)
            .get(testo(req.query.materiale, 'materiale'), testo(req.query.forma, 'forma'),
                numero(req.query.misura, 'misura'), spessore ?? 0) as Articolo | undefined;
        if (!row) throw new ErroreHttp(404, 'Articolo non riconosciuto');
        res.json({ err: 'ok', data: row });
    });

    app.get('/api/articoli/:id', (req, res) => {
        const a = getArticolo(db, Number(req.params.id));
        if (!a) throw new ErroreHttp(404, 'Articolo non trovato');
        res.json({ err: 'ok', data: a });
    });

    // quantita: positiva = carico, negativa = scarico
    app.post('/api/movimenti', (req, res) => {
        const modo = req.body?.modo as Modo;
        if (modo !== 'barre' && modo !== 'kg') throw new ErroreHttp(400, 'modo deve essere "barre" o "kg"');
        const quantita = numero(req.body?.quantita, 'quantita');
        const lunghezza = getLunghezzaBarra(db);
        const risultato = db.transaction(() => {
            const a = getArticolo(db, Number(req.body?.articolo_id));
            if (!a) throw new ErroreHttp(404, 'Articolo non trovato');
            let r;
            try { r = applicaMovimento(a, modo, quantita, lunghezza); }
            catch (e) { throw new ErroreHttp(400, (e as Error).message); }
            db.prepare("UPDATE magazzino SET barre = ?, quantita = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .run(r.barre, r.quantita, a.id);
            db.prepare('INSERT INTO movimenti (magazzino_id, delta_barre, barre_dopo, lunghezza_barra) VALUES (?, ?, ?, ?)')
                .run(a.id, r.deltaBarre, r.barre, lunghezza);
            return getArticolo(db, a.id);
        })();
        res.json({ err: 'ok', data: risultato });
    });

    // --- impostazioni ---------------------------------------------------------
    app.get('/api/impostazioni', (_req, res) => {
        res.json({ err: 'ok', data: { lunghezza_barra_m: getLunghezzaBarra(db) } });
    });

    app.put('/api/impostazioni', soloAdmin, (req, res) => {
        const l = numero(req.body?.lunghezza_barra_m, 'lunghezza_barra_m');
        if (l <= 0) throw new ErroreHttp(400, 'La lunghezza deve essere maggiore di zero');
        db.prepare("UPDATE impostazioni SET valore = ? WHERE chiave = 'lunghezza_barra_m'").run(String(l));
        // i kg totali dipendono dalla lunghezza: li ricalcolo dalle barre
        db.prepare('UPDATE magazzino SET quantita = ROUND(barre * ? * peso, 3)').run(l);
        res.json({ err: 'ok', data: { lunghezza_barra_m: l } });
    });

    // --- amministrazione ------------------------------------------------------
    app.get('/api/admin/magazzino', soloAdmin, (_req, res) => {
        res.json({ err: 'ok', data: db.prepare(`${SELECT_ARTICOLO} ORDER BY mt.ordine, mt.nome, m.forma, m.misura, m.spessore`).all() });
    });

    // ?formato=excel -> ';', virgola decimale e BOM per Excel italiano
    app.get('/api/admin/export.csv', soloAdmin, (req, res) => {
        res.type('text/csv; charset=utf-8')
            .attachment(nomeFileExport())
            .send(esportaCsv(db, { excel: req.query.formato === 'excel' }));
    });

    const leggiArticolo = (b: Record<string, unknown>) => ({
        materiale_id: trovaOCreaMateriale(db, testo(b.materiale, 'materiale')),
        forma: testo(b.forma, 'forma').toUpperCase(),
        misura: numero(b.misura, 'misura'),
        spessore: spessoreOpz(b.spessore),
        peso: numero(b.peso, 'peso'),
        note: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null,
    });
    const conVincolo = <T>(fn: () => T): T => {
        try { return fn(); }
        catch (e) {
            if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ErroreHttp(409, 'Esiste già un articolo con questi dati');
            throw e;
        }
    };

    app.post('/api/admin/magazzino', soloAdmin, (req, res) => {
        const d = leggiArticolo(req.body ?? {});
        const lunghezza = getLunghezzaBarra(db);
        const id = conVincolo(() => db.transaction(() => {
            const r = db.prepare('INSERT INTO magazzino (materiale_id, forma, misura, spessore, peso, note) VALUES (?, ?, ?, ?, ?, ?)')
                .run(d.materiale_id, d.forma, d.misura, d.spessore, d.peso, d.note);
            const id = Number(r.lastInsertRowid);
            const quantita = req.body?.quantita;
            if (quantita !== undefined && quantita !== '' && parseNumero(quantita) !== 0) {
                const m = applicaMovimento({ barre: 0, peso: d.peso }, req.body?.modo === 'kg' ? 'kg' : 'barre', numero(quantita, 'quantita'), lunghezza);
                db.prepare('UPDATE magazzino SET barre = ?, quantita = ? WHERE id = ?').run(m.barre, m.quantita, id);
            }
            return id;
        })());
        res.status(201).json({ err: 'ok', data: getArticolo(db, id) });
    });

    // modifica anagrafica; la giacenza si cambia solo con i movimenti
    app.put('/api/admin/magazzino/:id', soloAdmin, (req, res) => {
        const id = Number(req.params.id);
        if (!getArticolo(db, id)) throw new ErroreHttp(404, 'Articolo non trovato');
        const d = leggiArticolo(req.body ?? {});
        const lunghezza = getLunghezzaBarra(db);
        conVincolo(() => db.prepare(`UPDATE magazzino SET materiale_id = ?, forma = ?, misura = ?, spessore = ?, peso = ?, note = ?,
                quantita = ROUND(barre * ? * ?, 3), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(d.materiale_id, d.forma, d.misura, d.spessore, d.peso, d.note, lunghezza, d.peso, id));
        res.json({ err: 'ok', data: getArticolo(db, id) });
    });

    app.delete('/api/admin/magazzino/:id', soloAdmin, (req, res) => {
        const r = db.prepare('DELETE FROM magazzino WHERE id = ?').run(Number(req.params.id));
        if (!r.changes) throw new ErroreHttp(404, 'Articolo non trovato');
        res.json({ err: 'ok', data: null });
    });

    app.put('/api/admin/materiali/:id', soloAdmin, (req, res) => {
        const r = db.prepare('UPDATE materiali SET ordine = ? WHERE id = ?').run(numero(req.body?.ordine, 'ordine'), Number(req.params.id));
        if (!r.changes) throw new ErroreHttp(404, 'Materiale non trovato');
        res.json({ err: 'ok', data: getMateriali(db) });
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

