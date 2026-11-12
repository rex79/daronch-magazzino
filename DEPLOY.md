# Deploy su Render + Neon (piani gratuiti)

Database Postgres su **Neon**, app su **Render** (Docker). Koyeb non è più utilizzabile gratuitamente per i nuovi account.

Chi fa cosa: **[Tu]** passaggi con account, password e token; **[Io]** passaggi che posso eseguire dopo il tuo ok.

## 0. Prima di iniziare
- [ ] Le PR "Passaggio da SQLite a PostgreSQL" e "Deploy" sono mergiate su `main`.
- [ ] **[Tu]** Scegli una password per l'area admin e conservala nel tuo gestore password.
- [ ] **[Tu]** Crea l'account su [Neon](https://neon.com) e su [Render](https://render.com) (con GitHub, senza carta se non la chiedono: se compare una richiesta di carta, fermati e ricontrolla il piano scelto).

## 1. Database su Neon
- [ ] **[Tu]** Crea un progetto, regione **Francoforte** (`eu-central-1`), per avere poca latenza con Render.
- [ ] Copia la stringa di connessione (dal pulsante "Connect"). Deve essere del tipo `postgresql://utente:password@host/db?sslmode=require`.
- [ ] Se l'app non riesce a connettersi e la stringa contiene `channel_binding=require`, rimuovi quel parametro.
- Nota: il database va in pausa dopo 5 minuti senza richieste e riparte da solo; il piano gratuito ha 100 ore di calcolo al mese e 1 GB di spazio, più che sufficienti per questo uso. Condizioni da ricontrollare sul sito, cambiano spesso.

## 2. App su Render
- [ ] **[Tu]** New + > **Blueprint** e scegli il repo `rex79/daronch-magazzino`: Render legge `render.yaml` (servizio web Docker, piano **Free**, Francoforte).
- [ ] **[Tu]** Quando lo chiede, inserisci come segreti:
  - `DATABASE_URL` = stringa di connessione di Neon
  - `ADMIN_PASSWORD` = la password scelta
- [ ] Controlla che il piano mostrato sia **Free** prima di confermare.
- [ ] Attendi il deploy: lo stato diventa "Live" e le tabelle si creano da sole al primo avvio.
- Nota: il servizio gratuito si addormenta dopo 15 minuti senza richieste e la prima richiesta successiva impiega circa un minuto. Ha un tetto di 750 ore al mese: per un solo servizio basta.

## 3. Verifiche dopo il deploy
- [ ] Apri l'URL pubblico (`https://magazzino-xxxx.onrender.com`): compare la lista dei materiali (vuota prima dell'import).
- [ ] `/#/admin` chiede la password e la accetta.
- [ ] In Admin crea un articolo di prova, registra un carico, poi eliminalo.

## 4. Import finale da Heroku
Da fare sul tuo Mac, a progetto concluso. L'import gira in locale e scrive sul database di Neon.

- [ ] Esporta gli articoli da Heroku (sostituisci `NOME_APP`):
  ```bash
  heroku pg:psql -a NOME_APP -c "\copy (select materiale,forma,misura,peso,barre,quantita,note,spessore from magazzinos order by materiale,forma,misura) to 'export.csv' csv header"
  heroku pg:psql -a NOME_APP -c "\copy (select nome,ordine from materialis order by ordine) to 'materiali.csv' csv header"
  ```
- [ ] Importa gli articoli sul nuovo database:
  ```bash
  DATABASE_URL='<stringa di connessione Neon>' npm run import:csv -- export.csv
  ```
- [ ] Applica l'ordine dei materiali (gli articoli non lo contengono):
  ```bash
  psql '<stringa di connessione Neon>' -c "create temp table m(nome text, ordine int)" \
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
- [ ] Controlla ogni tanto il consumo di ore di calcolo su Neon.
