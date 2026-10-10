# Despliegue de la web y el portal en el servidor propio

La web pública (`fide-work.it`, con `/invite/*` y los ficheros `/.well-known` de las passkeys y los App Links) y el
portal de HR (`app.fide-work.it`) son **ficheros estáticos**. Los sirve el **nginx que ya existe** en el servidor de
AegisLink (Hetzner, Helsinki: `157.180.116.176`), con bloques `server` propios y certificado de Let's Encrypt.
`fide-work.online` (con su `www` y `app`) apunta al mismo servidor y redirige a `fide-work.it`. La base
de datos y las funciones siguen en Supabase (UE).

`deploy/nginx/fide.conf` **no se edita a mano**: se genera con `npm run gen:nginx` (en `app/`) desde
`app/packages/shared/src/security-headers.ts`, la misma fuente que usan Cloudflare y `vite preview`. Un test falla si
se desincroniza o si algún `location` pierde las cabeceras de seguridad.

Los `.mjs` de `/assets/` (el worker de pdf.js con el que el portal lee los cedolini) se sirven como
`text/javascript`: el `mime.types` de nginx no conoce esa extensión y, con `nosniff`, el navegador no los ejecutaría.
Sin esto, el portal no puede leer ningún PDF.

## Convivencia con AegisLink

En ese servidor nginx ya atiende `aegislink.duckdns.org`, `aegis-link.it` y `www.aegis-link.it` en 80, 443 y 8443.
La configuración de Fide:

- solo responde a sus dominios (`server_name`), sin `default_server`, así que no cambia lo que reciben los otros;
- escucha **solo IPv4** y **sin `http2`**, como los sitios existentes. Un `listen [::]` o `http2` en un bloque nuevo
  cambiaría los sockets que comparten. Por la misma razón, no crees registros AAAA para los dominios de Fide;
- sirve ficheros de `/opt/fide-web`, sin procesos nuevos ni puertos nuevos;
- se valida con `nginx -t` antes de recargar. Si falla, nginx sigue con la configuración anterior.

## Instalación (una sola vez, como administrador)

**1. DNS en register.it.** Registros **A** (no AAAA) de `fide-work.it` y `app` hacia `157.180.116.176`; `www` es
un CNAME al dominio raíz. Lo mismo para `fide-work.online`.
Comprueba que resuelven antes del paso 4:

```powershell
nslookup fide-work.it 1.1.1.1
```

**2. Copiar la configuración al servidor** desde la raíz del repo, en tu PC:

```powershell
scp -i $HOME\.ssh\aegislink_hetzner deploy/nginx/fide-bootstrap.conf deploy/nginx/fide.conf root@157.180.116.176:/tmp/
```

**3. En el servidor:** carpetas, configuración solo de puerto 80 y recarga.

```bash
mkdir -p /opt/fide-web/releases /var/www/letsencrypt
cp /tmp/fide-bootstrap.conf /etc/nginx/sites-available/fide
ln -s /etc/nginx/sites-available/fide /etc/nginx/sites-enabled/fide
nginx -t && systemctl reload nginx
```

**4. Certificado** para los tres dominios. Certbot pide un email y que aceptes sus condiciones; renueva solo y
recarga nginx al renovar:

```bash
certbot certonly --webroot -w /var/www/letsencrypt --cert-name fide-work.it \
  -d fide-work.it -d www.fide-work.it -d app.fide-work.it \
  -d fide-work.online -d www.fide-work.online -d app.fide-work.online \
  --deploy-hook "systemctl reload nginx"
```

**5. Configuración completa** con HTTPS:

```bash
cp /tmp/fide.conf /etc/nginx/sites-available/fide
nginx -t && systemctl reload nginx
```

Cuando cambien las reglas de seguridad, repite los pasos 2 y 5 con el `fide.conf` regenerado.

## Publicar una versión

En `app/apps/web-portal/.env.production` (no se sube al repo):

```
VITE_SUPABASE_URL=https://saehchpgnbcciqimrqsj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clave publicable de Project Settings → API Keys>
```

Un alias SSH en `C:\Users\<tú>\.ssh\config`:

```
Host fide-web
  HostName 157.180.116.176
  User root
  IdentityFile ~/.ssh/aegislink_hetzner
```

Después, desde la raíz del repo, **en Git Bash**. Sin alias, usa `FIDE_DEPLOY_HOST=root@157.180.116.176` y
`FIDE_DEPLOY_SSH_KEY=~/.ssh/aegislink_hetzner`:

```bash
FIDE_DEPLOY_HOST=fide-web ./deploy/deploy.sh
```

El script compila la web y el portal, los sube a `/opt/fide-web/releases/<fecha>` y cambia `www` a esa versión de
forma atómica. nginx sirve los ficheros nuevos al momento y se conservan las 5 últimas versiones.

**Volver a la versión anterior**, en el servidor:

```bash
cd /opt/fide-web && ls -1t releases | head
ln -sfn releases/<version-anterior> www.next && mv -T www.next www
```

**Recomendado más adelante:** un usuario `fide-deploy`, dueño solo de `/opt/fide-web` y con su propia clave, para que
la clave de despliegue de Fide no sea la de root del servidor de AegisLink.

## Comprobaciones después de publicar

```bash
curl -sI https://fide-work.it | grep -iE 'strict-transport|content-security'
curl -sI https://fide-work.it/.well-known/assetlinks.json | grep -iE '^HTTP|content-type'   # 200 y application/json, sin redirección
curl -sI https://fide-work.it/.well-known/apple-app-site-association | grep -iE '^HTTP|content-type'
curl -sI https://fide-work.it/invite/prueba | grep -iE '^HTTP|x-robots|referrer'            # 200, noindex, no-referrer
curl -sI https://app.fide-work.it/kiosk | grep -iE '^HTTP'                                  # 200 (SPA)
curl -sI https://fide-work.it/_headers | grep -iE '^HTTP'                                   # 404
curl -sI https://aegis-link.it | grep -iE '^HTTP'                                           # AegisLink sigue igual
```


## Notifiche push

Implementazione pronta per il rilascio; non considerarla attiva finché non sono completati setup e prova reale.

1. Android: il `google-services.json` pubblico in `app/apps/mobile` deve corrispondere a `it.fidework.app`.
   In EAS, progetto Fide → Credentials → Android → FCM V1, caricare la chiave **privata** di account di servizio
   del medesimo progetto Firebase. Questa chiave non è `google-services.json` e non va mai nel repository.
2. iOS: associare in EAS a `it.fidework.app` una chiave APNs valida del proprio team. Una chiave Team Scoped
   può servire più app: token e bundle ID separano i destinatari. La revoca della chiave condivisa interrompe
   tutte le app che la usano. File `.p8` solo nell’archivio privato dell’operatore e in EAS.
3. Abilitare **Enhanced Push Security** per Fide in Expo, generare un token Expo con accesso al progetto e salvarlo
   nel secret `FIDE_EXPO_ACCESS_TOKEN` dell’environment GitHub `production`. Non copiarlo in variabili pubbliche.
4. Prima del rollout con lavoratori reali, completare gli accordi e le garanzie dei fornitori push indicate nel
   [DPA](../docs/legal/DPA_GDPR_Art28.md) e aggiornare/consegnare l’informativa del cliente pilota.
5. Dopo approvazione e merge della PR: eseguire il workflow `Supabase deploy`, che applica migrazione e funzione
   e imposta il secret server. Fare nuove build Android e iOS: icona e Firebase sono configurazione nativa.
6. Su due telefoni reali: attivare gli avvisi dalla home, autorizzare il sistema, chiudere/minimizzare la app e
   pubblicare un documento o decidere una richiesta tramite il portale. Verificare il testo generico nella lingua
   del destinatario, nome/icona Fide, apertura della app e aggiornamento dei dati. Il push non è una conferma
   di consegna o lettura. Verificare che l’e-mail continui ad arrivare anche disattivando il push.
7. Provare disattivazione nella home, logout, permesso tolto dal sistema (riaprire la home per sincronizzarlo),
   revoca del telefono, sospensione e cessazione. Nuovi eventi non devono produrre altri push al vecchio token.
   Messaggi già accettati da Expo/APNs/FCM possono arrivare entro il TTL: non sono revocabili retroattivamente.

Fonti: [Expo SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/),
[FCM v1](https://docs.expo.dev/push-notifications/fcm-credentials/),
[Expo tickets/ricevute e sicurezza](https://docs.expo.dev/push-notifications/sending-notifications/),
[Apple APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns).
