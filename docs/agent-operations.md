# Installazione e operazioni assistite da agent

## Contratto di autorizzazione

L'agent assiste la persona usando la shell dell'host autorizzato o un browser **già autenticato dall'utente**. Non serve una nuova API, un MCP dedicato, un token agent o un account di servizio Discord. Se gli strumenti non sono disponibili, fornisce istruzioni da eseguire manualmente.

1. Identifica host, checkout, server Discord (nome e ID), ambiente test/produzione e obiettivo. Leggi la sezione pertinente della [guida self-hosting](self-hosting.md). Il passo è completo quando destinazione e risultato richiesto sono univoci.
2. Proponi le azioni esatte, indicando accesso rete, downtime, esposizione HTTP, modifiche Discord/dati e reversibilità. Per update/restore, verifica con l'utente che esista un backup compatibile senza aprirlo.
3. Chiedi una conferma esplicita per quelle azioni su quella destinazione; una generica richiesta di “sistemare il progetto” non autorizza deployment o modifiche a un server reale. Se cambiano scope, destinazione o azione distruttiva, fermati e chiedi di nuovo.
4. Esegui solo l'azione approvata, nel browser autorizzato o nella shell concordata. Ricontrolla server/host immediatamente prima di inviare una modifica. Conferma l'esito osservabile senza esportare dati sensibili.
5. Riferisci cosa è cambiato, verifiche, downtime e problemi residui. Un processo HTTP healthy non prova che il bot sia collegato o che abbia i permessi corretti.

## Confini per fase

- **Preparazione locale:** ispezione di sorgenti, `.env.example`, sintassi shell e [check con credenziali fittizie](infra-checks.md) non richiedono segreti o connessione a Discord. Per rete (clone/fetch/install/download) e servizi reali serve consenso specifico.
- **Installazione:** l'utente crea l'app nel portale e inserisce privatamente token/Client Secret nell'installer. Non gestire il terminale mentre mostra campi segreti e non registrare il form. Il salvataggio della configurazione e il successivo avvio sono due effetti distinti: descrivili prima; `AVVIA` è la conferma dell'installer, non sostituisce il consenso allo scope del lavoro dell'agent.
- **Browser:** l'utente completa login/2FA. Usa l'interfaccia normale senza leggere DevTools/storage/cookie o intercettare OAuth. Invito bot, cambio permessi/intents, reset token, salvataggio impostazioni e approvazione/negazione membri sono azioni reali: consenso con server e membri/ruoli esatti. Evita screenshot con segreti o dati personali non necessari.
- **Diagnosi:** preferisci `docker compose ps -a` e `docker compose config --quiet`. I log possono includere dati personali/credenziali: chiedi estratti redatti all'utente oppure concorda una raccolta locale con minimizzazione e redazione prima di riportarli.
- **Backup:** autorizza destinazione privata e tempo di fermo; i comandi copiano `.env` come file opaco ma l'agent non ne legge il contenuto. Non aprire dump/banner per “controllare”, non inviarli a servizi terzi, non includerli nel checkout/build.
- **Update/restore:** consenso esplicito al commit e alle operazioni DB. `restore`, rimozione di volumi o banner, rotazione credenziali, cambi di bind/rete e correzioni ownership richiedono conferma dedicata. Non accettare automaticamente perdita dati Prisma. Mai usare `down -v` come update.

## Segreti e costi

Non leggere `.env` reale, nemmeno con `source`, `grep`, `docker inspect`, `docker compose config` esteso o dump dell'ambiente. Non chiedere token/cookie/password in chat. Per configurazione mancante, indica il nome della variabile e lascia all'utente l'inserimento privato; per log sensibili, richiedi redazione.

L'abbonamento di un coding agent riguarda il suo utilizzo come strumento, non il runtime Doorman. Un abbonamento chat non implica crediti API: eventuali API usate dall'agent possono avere fatturazione separata secondo il provider/piano. Il bot non usa AI né richiede chiavi LLM; host, backup e dominio restano a carico dell'utente. Non introdurre integrazioni AI per “automatizzare” amministrazione o approvazioni.
