-- Migrazione dei dati della vecchia app Heroku (tabelle Rails `materialis`, `magazzinos`)
-- nelle tabelle della nuova app (`materiali`, `magazzino`).
-- Stesse regole di src/import-csv.ts:
--   - righe senza materiale, forma, misura o peso vengono saltate
--   - forma in maiuscolo, spessore 0 -> NULL, barre mancanti -> 0
--   - le barre fanno fede, i kg si ricalcolano come barre x lunghezza_barra x peso (arrotondati a 3 decimali)
--   - materiali non presenti in `materialis` vengono creati
--   - per i duplicati sulla chiave (materiale, forma, misura, spessore) vince la riga aggiornata più di recente
-- Le tabelle vecchie non vengono toccate. Da eseguire dentro una transazione (BEGIN ... COMMIT).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM magazzino) OR EXISTS (SELECT 1 FROM materiali) THEN
        RAISE EXCEPTION 'materiali o magazzino non sono vuote: migrazione interrotta';
    END IF;
END $$;

CREATE TEMP TABLE righe_valide ON COMMIT DROP AS
SELECT DISTINCT ON (trim(materiale), upper(trim(forma)), misura, COALESCE(NULLIF(spessore, 0), 0))
       id, trim(materiale) AS materiale, upper(trim(forma)) AS forma, misura, NULLIF(spessore, 0) AS spessore,
       peso, COALESCE(barre, 0) AS barre, NULLIF(trim(note), '') AS note,
       created_at AT TIME ZONE 'UTC' AS created_at, COALESCE(updated_at, created_at) AT TIME ZONE 'UTC' AS updated_at
FROM magazzinos
WHERE trim(COALESCE(materiale, '')) <> '' AND trim(COALESCE(forma, '')) <> '' AND misura IS NOT NULL AND peso IS NOT NULL
ORDER BY trim(materiale), upper(trim(forma)), misura, COALESCE(NULLIF(spessore, 0), 0), updated_at DESC NULLS LAST, id DESC;

-- materiali esistenti, con il loro id
INSERT INTO materiali (id, nome, ordine)
SELECT id, trim(nome), COALESCE(ordine, 0) FROM materialis WHERE trim(COALESCE(nome, '')) <> '';
SELECT setval(pg_get_serial_sequence('materiali', 'id'), (SELECT max(id) FROM materiali));

-- materiali usati in magazzino ma non presenti in materialis
INSERT INTO materiali (nome)
SELECT DISTINCT materiale FROM righe_valide ON CONFLICT (nome) DO NOTHING;

INSERT INTO magazzino (id, materiale_id, forma, misura, spessore, peso, barre, quantita, note, created_at, updated_at)
SELECT r.id, mt.id, r.forma, r.misura, r.spessore, r.peso, r.barre,
       round((r.barre * l.lunghezza * r.peso)::numeric, 3)::double precision,
       r.note, COALESCE(r.created_at, now()), COALESCE(r.updated_at, now())
FROM righe_valide r
JOIN materiali mt ON mt.nome = r.materiale
CROSS JOIN (SELECT valore::double precision AS lunghezza FROM impostazioni WHERE chiave = 'lunghezza_barra_m') l;
SELECT setval(pg_get_serial_sequence('magazzino', 'id'), (SELECT max(id) FROM magazzino));
