# Despliegue de la web y el portal en un servidor propio

La web pública (`fide-work.it`, con `/invite/*` y los ficheros `/.well-known` de las passkeys y los App Links) y el
portal de HR (`app.fide-work.it`) son **ficheros estáticos**. Aquí se sirven con [Caddy](https://caddyserver.com) en
un contenedor, que además obtiene y renueva los certificados HTTPS. La base de datos y las funciones siguen en
Supabase (UE).

El `Caddyfile` **no se edita a mano**: se genera con `npm run gen:caddy` (en `app/`) desde
`app/packages/shared/src/security-headers.ts`, la misma fuente que usan Cloudflare y `vite preview`, y un test falla
si se desincroniza.

## Antes de usar el servidor de coturn de AegisLink

Se puede compartir, pero comprueba esto antes. Afecta a AegisLink, no solo a Fide.

1. **Puertos.** Caddy necesita 80/tcp (para obtener el certificado) y 443/tcp. Muchos coturn escuchan TURN sobre
   TLS en **443** para atravesar firewalls de empresa. Compruébalo en el servidor:

   ```bash
   sudo ss -tulpn | grep -E ':(80|443)\b'
   ```

   Si coturn usa 443, hay tres opciones:
   - mover TURN-TLS solo a 5349, si los clientes de AegisLink no lo necesitan en 443;
   - usar una segunda IP para la web;
   - poner delante un enrutador por SNI (HAProxy o el módulo `stream` de nginx) que mande `fide-work.it` a Caddy y el
     dominio TURN a coturn.

   No cambies coturn sin probar antes las llamadas de AegisLink.
2. **Ubicación en la UE.** El servidor debe estar en la Unión Europea, como dice el acuerdo art. 28 (allegato 3).
   Apunta el proveedor (por ejemplo Hetzner u OVH) en `docs/legal/DPA_GDPR_Art28.md`.
3. **Aislamiento.** El contenedor es de solo lectura, no tiene más permisos que abrir 80/443, monta la web en solo
   lectura y tiene límites de CPU y memoria. No toca la configuración ni los secretos de coturn. Usa un usuario de
   despliegue propio, que no pueda leer `/etc/turnserver.conf`.
4. **Ataques.** Sin Cloudflare delante, un ataque contra la web llega al mismo servidor que las llamadas de AegisLink.
   Los límites del contenedor protegen la CPU y la memoria, no el ancho de banda.

## Preparación del servidor (una sola vez)

```bash
# Como administrador
sudo adduser --disabled-password fide-deploy
sudo usermod -aG docker fide-deploy
sudo mkdir -p /opt/fide-web && sudo chown fide-deploy: /opt/fide-web
# Abrir 80 y 443 si hay firewall (ufw)
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

Como `fide-deploy`, crea `/opt/fide-web/.env` con el e-mail de la cuenta de Let's Encrypt:

```bash
echo 'ACME_EMAIL=tu-email@ejemplo.it' > /opt/fide-web/.env
# Si 80/443 están ocupados y usas un enrutador SNI delante: FIDE_HTTP_PORT=8080 y FIDE_HTTPS_PORT=8443
```

**DNS.** Registros A (y AAAA si hay IPv6) de `fide-work.it`, `www.fide-work.it` y `app.fide-work.it` hacia la IP del
servidor. Caddy pide los certificados la primera vez que arranca.

**SSH desde tu PC.** Clave de SSH para `fide-deploy` y un alias en `~/.ssh/config`:

```
Host fide-web
  HostName <ip-del-servidor>
  User fide-deploy
  IdentityFile ~/.ssh/fide_deploy
```

## Publicar

En `app/apps/web-portal/.env.production` (no se sube al repo) pon los datos del proyecto Supabase:

```
VITE_SUPABASE_URL=https://saehchpgnbcciqimrqsj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clave publicable>
```

Después, desde la raíz del repo (Git Bash):

```bash
FIDE_DEPLOY_HOST=fide-web ./deploy/deploy.sh
```

El script compila la web y el portal, los sube a `/opt/fide-web/releases/<fecha>`, apunta `www` a esa versión,
recrea el contenedor y conserva las 5 últimas versiones.

**Volver a la versión anterior**, en el servidor:

```bash
cd /opt/fide-web && ls -1t releases | head
ln -sfn releases/<version-anterior> www && docker compose up -d --force-recreate
```

## Comprobaciones después de publicar

```bash
curl -sI https://fide-work.it | grep -iE 'strict-transport|content-security'
curl -sI https://fide-work.it/.well-known/assetlinks.json | grep -iE '^HTTP|content-type'   # 200 y application/json, sin redirección
curl -sI https://fide-work.it/.well-known/apple-app-site-association | grep -iE '^HTTP|content-type'
curl -sI https://fide-work.it/invite/prueba | grep -iE '^HTTP|x-robots|referrer'            # 200, noindex, no-referrer
curl -sI https://app.fide-work.it/kiosk | grep -iE '^HTTP'                                  # 200 (SPA)
curl -sI https://fide-work.it/_headers | grep -iE '^HTTP'                                   # 404
```

Después, en Supabase: añade `https://app.fide-work.it` a `FIDE_ALLOWED_ORIGINS` de las funciones y a las URL de
redirección de Auth, y pon `FIDE_SITE_URL=https://fide-work.it`.
