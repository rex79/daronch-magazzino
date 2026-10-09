# Magazzino

App unica (API Express + frontend statico in `public/`) con database SQLite. Sostituisce la vecchia versione Padrino/Postgres/Heroku.

## Avvio

```bash
npm install
ADMIN_PASSWORD=scegli-una-password npm run dev   # http://localhost:3000
npm test
npm run build && npm start                        # produzione
```

Variabili: `PORT` (3000), `DB_FILE` (`data/magazzino.db`), `ADMIN_PASSWORD` (se assente l'area admin è aperta).

## Dati

```bash
npm run import:csv -- export.csv                              # export Postgres con intestazione
npm run import:csv -- all.csv --separatore '#' --senza-intestazione   # vecchio formato
```

L'import è ripetibile: aggiorna peso, barre, kg e note degli articoli già presenti.
Per la migrazione finale: esportare da Heroku (`COPY magazzinos ... CSV HEADER` unito a `materialis`) e importare con lo stesso comando.

## Regole

- La lunghezza della barra è un'impostazione (default 3 m, modificabile da Admin). I kg si ricalcolano come `barre × lunghezza × peso`.
- Carico/scarico in barre o kg; i kg diventano barre frazionarie, senza perdere il resto.
- Ogni movimento è registrato nella tabella `movimenti`.
