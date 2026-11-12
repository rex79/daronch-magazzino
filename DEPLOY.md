# Deploy su Koyeb (piano gratuito)

Chi fa cosa: **[Tu]** passaggi con account, password e token; **[Io]** passaggi che posso eseguire dopo il tuo ok.

## 0. Prima di iniziare
- [ ] Le PR "Passaggio da SQLite a PostgreSQL" e "Deploy" sono mergiate su `main`.
- [ ] **[Tu]** Registrati su Koyeb con il piano gratuito e collega l'account GitHub (accesso al repo `rex79/daronch-magazzino`).
- [ ] **[Tu]** Scegli una password per l'area admin e conservala nel tuo gestore password.

## 1. Database
- [ ] **[Tu/Io]** Crea un servizio Database gratuito (Postgres) su Koyeb, nella stessa regione dell'app (Francoforte è la scelta più vicina).
- [ ] Copia la stringa di connessione. Se non finisce già con `?sslmode=require`, aggiungilo.
- Nota: il database gratuito ha ore di calcolo mensili limitate e va in pausa dopo qualche minuto senza richieste. Controlla il consumo nel primo mese.

## 2. Servizio web
- [ ] Crea un servizio **Web** da GitHub: repo `rex79/daronch-magazzino`, branch `main`, builder **Dockerfile** (il `Dockerfile` è nella radice).
- [ ] Istanza: **Free**.
- [ ] Porta esposta: **8000** (l'immagine ascolta su `PORT=8000`).
- [ ] Variabili d'ambiente (le inserisci tu, come segreti):
  - `DATABASE_URL` = stringa di connessione del punto 1
  - `ADMIN_PASSWORD` = la password scelta
- [ ] Health check: quello TCP di default va bene.
- [ ] Avvia il deploy e attendi lo stato "Healthy". Le tabelle si creano da sole al primo avvio.

## 3. Verifiche dopo il deploy
- [ ] Apri l'URL pubblico: compare la lista dei materiali (vuota prima dell'import).
- [ ] `/#/admin` chiede la password e la accetta.
- [ ] In Admin crea un articolo di prova, registra un carico, poi eliminalo.
- [ ] Il servizio gratuito si addormenta dopo un'ora senza richieste: la prima richiesta successiva è lenta, è normale.

## 4. Import finale da Heroku
Da fare sul tuo Mac, a progetto concluso. L'import gira in locale e scrive sul database di Koyeb.

- [ ] Esporta gli articoli da Heroku (sostituisci `NOME_APP`):
  ```bash
  heroku pg:psql -a NOME_APP -c "\copy (select materiale,forma,misura,peso,barre,quantita,note,spessore from magazzinos order by materiale,forma,misura) to 'export.csv' csv header"
  heroku pg:psql -a NOME_APP -c "\copy (select nome,ordine from materialis order by ordine) to 'materiali.csv' csv header"
  ```
- [ ] Importa gli articoli sul nuovo database:
  ```bash
  DATABASE_URL='<stringa di connessione Koyeb>' npm run import:csv -- export.csv
  ```
- [ ] Applica l'ordine dei materiali (gli articoli non lo contengono):
  ```bash
  psql '<stringa di connessione Koyeb>' -c "create temp table m(nome text, ordine int)" \
    -c "\copy m from 'materiali.csv' csv header" \
    -c "update materiali t set ordine = m.ordine from m where m.nome = t.nome"
  ```
  (se usi più comandi `-c` con `\copy`, eseguili in una sola sessione `psql` interattiva.)
- [ ] Controlla i conteggi: righe in `export.csv` contro `select count(*) from magazzino`.
- [ ] Verifica a campione 5 articoli (barre e kg) tra vecchia e nuova app.
- [ ] Scarica un export CSV da Admin e conservalo come backup iniziale.
- [ ] Spegni Heroku solo dopo qualche giorno di uso senza problemi.

## 5. Dopo il lancio
- [ ] Pianifica un export CSV periodico (da Admin o con `npm run export:csv`) come backup di emergenza.
- [ ] Controlla ogni tanto il consumo del database gratuito.
