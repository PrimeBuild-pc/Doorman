# Sviluppo

Monorepo TypeScript: Next.js in `apps/web`, discord.js in `apps/bot`, Prisma/PostgreSQL in `packages/database`, utility/validazione in `packages/shared`. Consulta i `package.json` per gli script correnti; `pnpm-workspace.yaml` controlla anche i build script delle dipendenze.

## Dipendenze e build

Usa Node 22.20+ e la versione pnpm dichiarata in `package.json`. Con consenso alla rete:

```bash
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

La build ricorsiva compila shared/database prima delle app, che li importano dai rispettivi `dist`. Prisma Client viene generato durante la build: non eseguire `migrate deploy` aspettandoti uno schema iniziale, perché non sono presenti migration versionate. `pnpm build` non deve ricevere credenziali Discord reali né collegarsi a Discord/DB. Evita `pnpm format` sull'intero repository per modifiche circoscritte.

Con dipendenze già installate, puoi eseguire i controlli senza `install`. Riferisci eventuali processi/binarî non disponibili; non scaricarli automaticamente durante una verifica autorizzata solo come locale. Il web include test per sessioni/OAuth, autorizzazione e mutazioni isolate per guild, upload e markup/accessibilità. Bot/shared hanno test degli eventi, inviti e permessi. Il workspace database non ha una suite propria: una stringa “no tests” non è un test applicativo. La suite ordinaria usa mock delle transazioni; la verifica staging sotto esegue anche lock e concorrenza su PostgreSQL reale.

## Runtime di sviluppo (solo su ambiente autorizzato)

`next dev`/bot **non caricano automaticamente la `.env` della root allo stesso modo di Compose**. Configura le variabili privatamente nel terminale/process manager tramite un metodo che non ne registri i valori; non usare un agent per leggere/source la `.env` reale. Servono i nomi in `.env.example` e, fuori Docker:

- `DATABASE_URL`: database di sviluppo raggiungibile dall'host (es. PostgreSQL su localhost; Compose non pubblica il DB).
- `UPLOADS_DIR`: directory locale scrivibile condivisa da web e bot.
- `PUBLIC_URL`: origine della dashboard senza slash finale, con il redirect esatto registrato nell'app Discord **di test**.

Con quelle variabili già presenti e un DB di sviluppo pronto:

```bash
pnpm --filter @doorman/database exec prisma db push --skip-generate
pnpm dev:web
# In un secondo terminale con le stesse variabili, solo quando autorizzato:
pnpm dev:bot
```

Il bot registra comandi e reagisce agli ingressi reali: non avviarlo con credenziali di produzione per un check di compilazione. Cambiamenti a ruoli, code o banner vanno verificati in un server di test, con consenso.

## Infrastruttura

Esegui i [check locali senza deploy](infra-checks.md). Una build Docker reale scarica basi e pacchetti e richiede autorizzazione separata:

```bash
docker build -t doorman:local .
```

Non avviare il progetto Compose predefinito come test automatico: schema modifica il database e bot si collega a Discord. Una verifica runtime richiede un ambiente temporaneo esplicitamente autorizzato; per base image/hardening controlla utenti, ownership volumi, Prisma/native canvas e cache Next dopo ogni aggiornamento.

### Staging isolato (solo dopo autorizzazione a download e avvio container)

Con Docker Linux, Compose v2, Git e Python 3:

```bash
docker build -t doorman:verification .
python scripts/verify-staging.py
```

Lo script non legge `.env`: genera configurazione e dati sintetici fuori dal checkout. Rifiuta risorse preesistenti del progetto `doorman-verification`, sceglie una porta localhost libera e avvia solo DB/schema/web con volumi temporanei. Verifica inizializzazione e riavvio PostgreSQL non-root/read-only, schema precedente da `HEAD` popolato e upgrade senza perdita dati, healthcheck e flussi HTTP di login negato/stato invalido/logout. Non segue redirect verso Discord.

La suite separata `apps/web/staging/staging.test.ts` usa Prisma/PostgreSQL e filesystem reali, ma simula sessione, autorizzazione e API Discord: verifica approvazioni concorrenti, attese advisory lock osservate in PostgreSQL, rejoin, rollback e decode PNG/JPEG/WebP con Sharp/canvas nativi. Non fa parte di `pnpm test` e rifiuta l'esecuzione senza il marcatore staging. Il bot non viene mai avviato; il suo handler di join è chiamato con un membro sintetico.

La pulizia finale elimina solo container/rete/volumi del progetto creato, anche dopo un errore; l'immagine di verifica e la cache di build restano disponibili. Il test dello schema `HEAD` non simula cambiamenti strutturali se `HEAD` e working tree hanno lo stesso schema. OAuth riuscito, permessi e assegnazioni Discord reali richiedono ancora un server di test autorizzato.
