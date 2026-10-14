# Self-hosting

## 1. Prerequisiti e Discord

Usa un host con container Linux, Docker Engine/Desktop, Docker Compose v2 recente (`--wait`, `service_completed_successfully` e `pull_policy`), Git, Bash e OpenSSL. Su Windows esegui l'installer in WSL o Git Bash con Docker Desktop in modalità Linux. Proteggi l'accesso al daemon Docker: equivale a privilegi amministrativi sull'host.

Nel [Discord Developer Portal](https://discord.com/developers/applications):

1. Crea un'applicazione; copia **Application ID** da General Information.
2. In **Bot**, abilita **Server Members Intent**. Presence Intent e Message Content Intent non servono; gli intent non privilegiati Guilds/GuildInvites sono richiesti dal codice. Eventuali app verificate devono ottenere l'approvazione Discord per gli intent privilegiati.
3. Genera/copia il Bot Token e, in **OAuth2**, il Client Secret. Conservali in un password manager; non incollarli in chat, issue, screenshot o nella cronologia shell.
4. In **OAuth2 → Redirects**, aggiungi esattamente `http://localhost:3000/api/auth/callback` per il default locale; per HTTPS usa `https://doorman.example.org/api/auth/callback`. Schema, host e porta devono coincidere con `PUBLIC_URL`, senza slash finale nell'origine. Il login richiede `identify guilds`, non il permesso di invitare il bot.
5. In **Installation** scegli Guild Install (se richiesto dal portale); in **OAuth2 → URL Generator** seleziona `bot` e `applications.commands`. Invita l'app solo nel server desiderato.

### Permessi minimi

- **Manage Roles** per assegnare ruoli. Il ruolo Doorman deve essere **sopra i ruoli da assegnare**, non sopra amministratori/moderatori. Escludi ruoli gestiti dalle integrazioni e `@everyone`.
- Nel solo canale di benvenuto: **View Channel, Send Messages, Attach Files**. Se non usi card, questi permessi non sono necessari a quella funzione.
- **Manage Server / Manage Guild** solo se usi i ruoli per invito: serve a leggere tutti gli inviti e i relativi contatori. Senza, l'autorole base continua a funzionare, ma l'attribuzione degli inviti no.
- **Administrator, Ban Members, Kick Members, Manage Channels, Message Content** non servono. Negare un'approvazione non espelle il membro: non gli concede i ruoli.

L'utente della dashboard deve essere proprietario o avere Manage Server/Administrator. Questi sono permessi dell'utente, non una ragione per dare Administrator al bot. Le slash command sono globali: la prima registrazione può richiedere tempo per propagarsi.

## 2. Installare e verificare

```bash
git clone --config core.autocrlf=false https://github.com/PrimeBuild-pc/Doorman.git
cd Doorman
bash install.sh
```

L'installer salva `.env` con permessi privati e valori casuali distinti per cifratura sessioni/password DB; token e Client Secret hanno input nascosto. Rifiuta `.env` esistente, anche se è un link: non ruota credenziali o password di database già inizializzati. Accetta un'origine HTTP locale oppure HTTPS senza percorso. `DOORMAN_BIND_ADDRESS` rimane `127.0.0.1`; la porta è configurabile.

**Doorman e D-View sullo stesso homelab:** entrambi propongono la porta 3000.
Nell'installer Doorman scegli **3001**, usa `PUBLIC_URL=http://localhost:3001`
e registra `http://localhost:3001/api/auth/callback` in Discord. D-View può restare
su 3000 e Gnosis su 8080. Mantieni applicazioni Discord, `.env`, database e volumi
separati; non riutilizzare token o password. Nel tunnel SSH usa
`-L 3001:127.0.0.1:3001` e apri `http://localhost:3001`.

Solo digitando `AVVIA` autorizzi download, build e connessione del bot a Discord. Se annulli dopo il salvataggio, per avviare successivamente:

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
docker compose ps -a
docker compose logs --tail=80 schema bot web
```

`config --quiet` valida senza stampare segreti; evita `docker compose config` senza questa opzione. Non pubblicare log grezzi senza controllo/redazione. `--wait` verifica PostgreSQL e HTTP; **non certifica il login Discord del bot**: controlla nei log il messaggio di login e il server atteso.

Il database non pubblica porte sull'host. Il controllo DB usa TCP per attendere il server finale, non il server temporaneo di inizializzazione. Il job `schema` esegue una sola sincronizzazione Prisma e deve terminare con codice 0 prima di bot/web. Non ci sono migration versionate: `db push` rifiuta cambiamenti che richiedono accettazione della perdita di dati; non forzare il flag di accettazione.

I container usano utenti non-root, filesystem root read-only e nessuna capability aggiuntiva. Solo DB/banner/cache temporanee sono scrivibili. Il bot monta i banner in sola lettura. Le dipendenze vengono installate con il lockfile obbligatorio e pnpm fissato; bot/web/schema usano la stessa immagine locale compilata, non un `latest` remoto. Le versioni base sono fissate a tag espliciti; tag e repository apt non sono immutabili: per una build byte-identica servirebbero digest verificati e snapshot apt. Aggiorna periodicamente le basi con controllo vulnerabilità e test.

Apri `http://localhost:3000`, accedi con Discord, scegli il server, imposta ruoli non privilegiati e, se desiderato, canale/banner/soglia d'età. Prova prima in un server di test con un account autorizzato: verificare assegnazione, messaggio e approvazioni modifica realmente Discord.

### Limiti operativi e sicurezza dei server

Puoi invitare la stessa app in più server: ogni impostazione e mutazione resta scoped all'ID server. Il cookie di sessione è cifrato e autenticato; non contiene la lista dei server. I permessi OAuth e la presenza del bot vengono controllati nuovamente a ogni pagina/modifica: un errore o una revoca bloccano l'accesso. Le sessioni vecchie della versione precedente vengono invalidate; scadenza del token o rotazione `AUTH_SECRET` richiedono un nuovo login.

Ruoli con privilegi amministrativi/moderativi, anche tramite override di canali/categorie, vengono esclusi e rivalidati prima della concessione. Questo non sostituisce la revisione delle autorizzazioni Discord: un ruolo può dare accesso a canali privati o funzioni di altri bot. Usa solo ruoli di ingresso a basso privilegio.

I banner accettano PNG/JPEG/WebP singoli fino a 5 MiB e 16 megapixel; vengono decodificati e ricampionati in PNG 1024×450. Le sostituzioni rimuovono normalmente il file precedente; upload contemporanei/interruzioni possono lasciare file inutilizzati, da pulire solo dopo backup e confronto con DB.

Un rejoin supera le richieste pendenti precedenti; l'approvazione verifica il timestamp di ingresso attuale su Discord. Le vecchie richieste create prima di questa versione possono essere rifiutate perché usavano un timestamp locale: verifica privatamente il membro e i ruoli in Discord e nega/archivia la richiesta obsoleta. Negare non rimuove ruoli esistenti, non kicka e non banna.

SQL e Discord non sono una transazione unica: un errore durante un'approvazione può concedere alcuni ruoli lasciando la richiesta pendente. Verifica Discord prima di ritentare; i PUT dei ruoli sono idempotenti. Anche i permessi o la membership possono cambiare fra controllo e chiamata API: non usare questo bot come sistema di controllo accessi ad alta garanzia. La coda mostra al massimo 100 membri per pagina; dopo le decisioni ricarica per vedere gli altri. Dati di configurazione e storico restano nel DB se il bot lascia un server; pianifica pulizia/retention e backup secondo le necessità della community.

## 3. Accesso remoto

Per amministrare da un altro computer senza esporre porte:

```bash
ssh -N -L 3000:127.0.0.1:3000 utente@host-doorman
```

Apri `http://localhost:3000` sul computer del browser; mantieni l'origine e il redirect locali. Se la porta dell'host è diversa, cambia il secondo `3000`; il primo deve corrispondere all'URL del browser.

Per un dominio pubblico, configura sull'host un reverse proxy con certificato TLS valido verso `127.0.0.1:3000`. Imposta privatamente `PUBLIC_URL=https://doorman.example.org`, registra il redirect identico in Discord e ricrea i servizi:

```bash
docker compose up -d --build --wait --wait-timeout 180
```

Il web deve usare il protocollo di `PUBLIC_URL` per i cookie `Secure`: HTTPS anche se il proxy parla HTTP all'app, HTTP solo per il default locale. Proteggi il proxy con firewall e preserva Host/forwarded headers senza fidarti di quelli forniti dal client. Un proxy in un altro container richiede una rete/configurazione dedicata: `127.0.0.1` in quel container non è l'host. Non cambiare il bind a `0.0.0.0` come scorciatoia per HTTPS.

## 4. Backup coerente

Salva database, banner, `.env` e commit del codice. Gli archivi contengono dati personali; conserva copie cifrate fuori host e prova il ripristino. Esegui dalla root, con spazio disponibile; i servizi restano fermi se un comando fallisce: riavviali solo dopo aver risolto.

```bash
set -e
umask 077
BACKUP="$(dirname "$PWD")/doorman-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
docker compose stop bot web
docker compose exec -T db pg_dump -U doorman -d doorman -Fc > "$BACKUP/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar web \
  -C /data/uploads -czf - . > "$BACKUP/uploads.tar.gz"
cp -p .env "$BACKUP/env.private"
git rev-parse HEAD > "$BACKUP/commit.txt"
docker compose start bot web
```

Il percorso predefinito è fuori dal checkout: mantieni anche eventuali percorsi alternativi fuori dal repository e dal contesto Docker. L'attuale `.dockerignore` non esclude cartelle di backup arbitrarie.

### Ripristino (distruttivo: conferma e backup prima)

Sul commit e sulla versione PostgreSQL compatibili con il backup, crea/configura privatamente `.env` per l'host di destinazione. Non sovrascrivere credenziali esistenti senza un piano. Usa un backup fidato e sostituisci il percorso di esempio:

```bash
set -e
BACKUP=/percorso/privato/del/backup
docker compose stop bot web
docker compose up -d --wait db
docker compose exec -T db pg_restore -U doorman -d doorman \
  --clean --if-exists --no-owner --exit-on-error < "$BACKUP/database.dump"
# Il restore DB sovrascrive dati; la riga seguente elimina tutti i banner attuali.
docker compose run --rm --no-deps -T --entrypoint sh web \
  -c 'set -e; find /data/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -xzf - -C /data/uploads' \
  < "$BACKUP/uploads.tar.gz"
docker compose rm -f schema
docker compose up -d --build --wait --wait-timeout 180
```

## 5. Aggiornare

Prima backup; controlla release/diff e scegli un commit/tag revisionato, senza aggiornamento automatico. Esegui `git fetch` solo quando autorizzi accesso rete; `git checkout` richiede working tree pulito e un riferimento reale al posto del segnaposto:

```bash
git fetch --tags origin
git checkout <commit-o-tag-revisionato>
docker compose stop bot web
docker compose rm -f schema
docker compose up -d --build --wait --wait-timeout 180
```

Rimuovere il solo container `schema` forza la verifica anche se l'immagine non cambia. **Mai `docker compose down -v` per aggiornare**: cancella DB e banner. Se lo schema cambia in modo incompatibile, tornare al codice precedente non basta: ripristina anche il backup DB/banner compatibile. Cambiare `POSTGRES_PASSWORD` in `.env` non cambia la password di un database esistente; serve una rotazione SQL esplicita, concordata, e l'aggiornamento coordinato dei client.

### Volumi provenienti dalla vecchia versione root

Prima di usare la versione non-root, fai il backup. I banner esistenti possono essere di root; se l'upload fallisce per permessi, ferma bot/web e autorizza una correzione limitata al volume:

```bash
docker compose stop bot web
docker compose run --rm --no-deps --user root --cap-add CHOWN \
  --entrypoint chown web -R 1000:1000 /data/uploads
docker compose up -d --build --wait --wait-timeout 180
```

Questo comando è l'eccezione temporanea non-root, non la configurazione permanente. PostgreSQL mantiene il major 16 e la directory dati precedente; se il volume DB ha ownership anomala, chiedi una diagnosi prima di cambiarla.

## 6. Troubleshooting

- **Variabile richiesta mancante:** compila privatamente `.env` seguendo `.env.example`; nessun fallback password di default. Compose ignora `DATABASE_URL`/`UPLOADS_DIR` dell'host per i servizi, derivandoli dalla sua configurazione.
- **DB unhealthy:** `docker compose logs --tail=80 db`; verifica spazio, permessi e password del volume originale. Non cancellare volumi per “riparare”.
- **Schema fallito:** `docker compose logs --tail=80 schema`; verifica compatibilità, fai backup e pianifica una migration manuale se necessario. Bot/web bloccati in questo caso è intenzionale.
- **401/token o intent disallowed:** verifica privatamente token/app corretti e Server Members Intent; ricrea il bot dopo una rotazione. La modifica intent o token nel portale richiede consenso.
- **Redirect OAuth/login che torna alla home:** confronta privatamente origine/porta/protocollo e redirect esatto; per HTTPS verifica TLS/proxy/cookie Secure; il browser deve poter raggiungere `PUBLIC_URL`. Non raccogliere cookie o codici OAuth nei log.
- **Server assente:** verifica che il bot sia stato invitato proprio lì, che sia connesso e che l'utente abbia Manage Server o sia proprietario. I permessi vengono riletti da Discord a ogni pagina e modifica; se il token OAuth è scaduto, esegui nuovamente il login.
- **Ruoli non assegnati:** Manage Roles, gerarchia e ruolo non gestito/non privilegiato. La negazione nella coda non kicka/banna.
- **Card assente:** banner valido, canale di testo normale, permessi View/Send/Attach; controlla ownership del volume. Un'approvazione concede i ruoli configurati, non promette l'invio retroattivo della card.
- **Invito non riconosciuto:** Manage Server è necessario. Vanity URL, inviti eliminati/scaduti o ingressi simultanei rendono l'associazione ambigua; non usarla come prova di identità o confine di sicurezza.
- **Build fallisce:** non rigenerare il lockfile durante il deploy; usa checkout completo, Node/pnpm compatibili e spazio sufficiente. Vedi [verifiche locali](infra-checks.md). La prima build richiede rete; il job schema richiede un DB reale.
