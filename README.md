# Magazzino

App unica (API Express + frontend statico in `public/`) con database PostgreSQL. Sostituisce la vecchia versione Padrino/Heroku.

## Avvio in locale

Serve un Postgres raggiungibile. In locale: `createdb magazzino`, poi

```bash
npm install
ADMIN_PASSWORD=scegli-una-password npm run dev   # http://localhost:3000
npm test                                          # usa PGlite (Postgres in-process), nessun server necessario
npm run build && npm start                        # produzione
```

Le tabelle si creano da sole all'avvio.

Variabili: `DATABASE_URL` (default `postgresql://localhost:5432/magazzino`), `PORT` (3000), `ADMIN_PASSWORD` (se assente l'area admin è aperta).
Con un database gestito usa l'URL del provider, ad esempio `postgresql://utente:password@host/db?sslmode=require`.
I database gratuiti vanno in pausa quando non sono usati: la prima richiesta dopo la pausa può metterci qualche secondo (timeout di connessione: 30 s).

## Dati

```bash
npm run import:csv -- export.csv                                      # export Postgres con intestazione
npm run import:csv -- all.csv --separatore '#' --senza-intestazione   # vecchio formato
npm run export:csv -- magazzino.csv [--excel]                         # export (anche da Admin)
```

L'import è ripetibile: aggiorna peso, barre, kg e note degli articoli già presenti.
Per la migrazione finale da Heroku: esportare `magazzinos` in CSV con intestazione (`\copy (select ...) to 'export.csv' csv header`) e importarlo con lo stesso comando, con `DATABASE_URL` che punta al nuovo database.

## Regole

- La lunghezza della barra è un'impostazione (default 3 m, modificabile da Admin). I kg si ricalcolano come `barre × lunghezza × peso`.
- Carico/scarico in barre o kg; i kg diventano barre frazionarie, senza perdere il resto.
- Ogni movimento è registrato nella tabella `movimenti`; i movimenti simultanei sullo stesso articolo sono serializzati.
