# L’Isola dei Bimbi — simple-media-hub

*[Read in English](README.md)*

Una schermata per bambini da aprire nel browser di una TV o di un monitor: riquadri grandi con i
cartoni e i film di un utente [Jellyfin](https://jellyfin.org), riprodotti a schermo intero dentro
la pagina, e una raccolta di giochi che funzionano senza internet. Si usa con frecce, Invio ed Esc
(una tastierina, un telecomando o un air mouse). Niente pubblicità, niente tracciamento, e i
giochi non possono collegarsi alla rete.

L’interfaccia è in italiano.

## Cosa fa

- **Guarda**: prima i preferiti ❤ dell’utente, poi tutte le librerie che l’utente Jellyfin vede.
  Pagina di dettaglio con trama, durata, età consigliata, ❤ e puntate; il ▶ su un riquadro (o
  Spazio) fa partire subito il video; le serie riprendono da dove erano rimaste; basta scrivere
  una lettera per cercare.
- **Gioca**: 19 giochi, da Tetris, Pac-Man e Space Invaders a Memory, Sokoban (21 livelli),
  scacchi, dama e tria contro il computer. Girano in un iframe isolato che non può usare la rete.
- **Impostazioni** (⚙️, password nel `.env`): nome dell’app, tema calcolato da un colore di base,
  sfondo animato o con immagine, indirizzo / chiave API / utente di Jellyfin con prova di
  connessione, quali giochi mostrare e in che ordine, fuso orario e luogo per il meteo.
- **Ora e meteo** nell’intestazione: data e ora (fuso della TV o quello scelto nelle impostazioni)
  e, scelto un luogo, il meteo attuale da [Open-Meteo](https://open-meteo.com) (senza chiave; lo
  chiede il server ogni 15 minuti, la TV parla solo con l’hub).
- **PWA**: si installa a schermo intero; la pagina e i giochi si aprono anche se il server non
  risponde (i browser lo permettono solo in https o su localhost).
- Nessuna dipendenza oltre a [hls.js](https://github.com/video-dev/hls.js); impostazioni in
  SQLite con il modulo `node:sqlite` integrato in Node.

## Come usa Jellyfin

La chiave API di Jellyfin resta sul server, il browser non la vede mai. Tutto passa da un solo
utente Jellyfin e l’hub mostra solo quello che quell’utente può vedere: **librerie e limiti di età
si impostano in Jellyfin**. Crea un utente per i bambini, abilita solo le loro librerie e indica
quell’utente all’hub.

Per la riproduzione l’hub chiede a Jellyfin flussi che Chrome legge direttamente (H.264/VP9/AV1
in mp4/webm) e altrimenti usa la conversione HLS. Se il server è troppo lento per convertire al
volo, `tools/convert-to-mp4.sh` converte la libreria in mp4 leggibili direttamente.

## Avvio rapido

Con Docker:

```sh
cp .env.example .env      # imposta ADMIN_PASSWORD, chmod 600 .env
docker compose up -d --build
```

Apri `http://<host>:8099`, poi ⚙️ → Jellyfin: indirizzo del server, chiave API (pannello di
Jellyfin → Chiavi API) e nome utente. **Prova connessione** li verifica e mostra gli utenti.

Senza Docker (Node 24 o successivo):

```sh
npm ci
cp .env.example .env
ENV_FILE=.env PORT=8099 npm start
```

`deploy.sh` costruisce e avvia l’immagine su un host Docker remoto via ssh
(`HOST=utente@server ./deploy.sh`).

## Configurazione

| Variabile | Predefinito | |
|---|---|---|
| `ADMIN_PASSWORD` | — | Attiva le impostazioni. Senza, la pagina resta disattivata. |
| `JELLYFIN_URL` | `http://localhost:8096` | Indirizzo di Jellyfin visto dal server dell’hub. |
| `JELLYFIN_API_KEY` | — | Chiave API di Jellyfin. |
| `JELLYFIN_USER` | — | Utente Jellyfin di cui mostrare preferiti e librerie. |
| `PORT` | `8080` | Porta HTTP. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Database delle impostazioni e immagine di sfondo. |
| `ENV_FILE` | `/run/secrets/media-hub.env` | File da cui leggere le variabili (l’ambiente ha la precedenza). |

Le impostazioni salvate dalla pagina ⚙️ stanno in `DATA_DIR/hub.db` (permessi 600) e vincono
sull’ambiente; un campo Jellyfin vuoto usa il valore dell’ambiente. La chiave API si può solo
scrivere: la pagina non la rilegge mai. La TV prende le modifiche entro cinque minuti, o
ricaricando.

## Sicurezza

L’hub è pensato per la rete di casa. Per guardare non serve accesso, apposta: chi raggiunge la
porta può sfogliare e guardare quello che vede l’utente Jellyfin configurato, e cambiarne
preferiti e avanzamento. Non esporlo su internet senza un proxy con autenticazione davanti.

Le impostazioni usano un cookie di sessione HttpOnly e SameSite=Strict e si bloccano per un minuto
dopo cinque password sbagliate. I giochi sono serviti con una CSP che vieta la rete e girano in
una sandbox con solo `allow-scripts`.

## Giochi

Ogni gioco è una cartella in `public/games/<id>/` elencata in `src/games.js`. La pagina del gioco
carica `games/shell.js`, che trasforma Esc / Backspace in "torna all’hub" e ripete nel gioco i
tasti finiti sull’hub mentre il gioco è aperto. I giochi scritti per l’hub condividono
`games/kit.js` (suoni, cursore a griglia, messaggi); le loro regole stanno in moduli separati
verificati da `npm test` (la generazione delle mosse degli scacchi è controllata con i valori
perft di riferimento).

I giochi di terzi e le loro licenze sono elencati in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
e nella finestra ℹ️ dell’app.

## Sviluppo

```
src/            server Node: client Jellyfin, controllo accessi, API delle impostazioni (SQLite)
public/         la pagina (app.js), le impostazioni, tema e sfondi, service worker
public/games/   i giochi
test/           node --test
tools/          convert-to-mp4.sh
```

```sh
npm test
```

## Licenza

Copyright © 2026 Roberto Luttino.

Software libero con licenza [GNU Affero General Public License](LICENSE), versione 3 o (a tua
scelta) successiva. Se fai girare una versione modificata dell’hub per altre persone devi offrire
loro il codice sorgente: punta `homepage` di `package.json` al tuo codice e la finestra ℹ️ lo
collega.

I giochi, i font e le librerie di terzi inclusi mantengono le loro licenze: vedi
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
