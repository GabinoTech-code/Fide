# Fide — reglas del proyecto

Fide es la app de RR. HH. para las pymes italianas: fichaje con QR del kiosco y geovalla mínima, nóminas cifradas de
extremo a extremo que solo se abren en el móvil del trabajador, vacaciones, permisos y documentos. Está en fase de
piloto con una empresa real. El dueño es un fundador solo, hispanohablante: **todas las respuestas, en español**.

Estas reglas vienen de las que se usan en AegisLink, adaptadas a Fide. Cada una existe porque ya pasó una vez.

## Principios no negociables

- **Las nóminas nunca se ven en claro fuera del navegador de HR y del móvil del trabajador.** Se cifran en el navegador
  de HR; ninguna función Edge cifra, descifra ni recibe un documento en claro.
- **Las claves privadas no salen del móvil** (expo-secure-store, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
- **Ubicación mínima:** solo «dentro/fuera», nunca coordenadas. La geovalla está apagada por sede hasta que la empresa
  la active (art. 4 L. 300/1970).
- **Sin biometría** ni datos biométricos: las claves se usan tras el desbloqueo normal del sistema operativo.
- **Los fichajes no se modifican:** firmados en el móvil, contrafirmados por el servidor, insertados solo por
  `punch-sync`; las correcciones son solicitudes aprobadas.
- **Aislamiento entre empresas** con RLS, demostrado por tests.
- **Sin IA ni decisiones automatizadas sobre personas.**
- **Nunca se rebaja una promesa de privacidad por comodidad.** Si algo no funciona bien con la protección puesta, se
  arregla con ingeniería; no se añade un interruptor ni un plan B que la quite.
- **Si una función no se puede auditar de forma independiente, no se publica.**

## Regla — Proponer decisiones y avisar de todo, nunca quedarse callado

El dueño se guía por lo que ve y prueba; el asistente ve el código entero y detecta huecos que él no puede adivinar.
Quedarse callado ante uno de esos huecos es dejarle solo con lo más difícil.

1. **Si algo parece raro, se dice en el mismo turno**, aunque no forme parte de la tarea: un documento que promete
   algo que el código no hace, un secreto mal guardado, un coste que va a llegar, un plazo legal, un riesgo de seguridad.
2. **Cuando un hueco es una decisión de producto, UX, legal o de negocio**, se propone activamente: qué es, por qué
   importa (impacto concreto: seguridad, Garante, RGPD, App Store, usuarios, dinero) y una recomendación concreta.
   Nunca se espera a que pregunte.
3. **Proponer ideas** que mejoren el producto o lo diferencien de la competencia (Zucchetti, Factorial, Jet HR…).
4. No aplica a preferencias triviales de estilo o nombres: esas se deciden solas siguiendo la convención.

## Regla — Cada cosa completa, de punta a punta

Una función no está hecha hasta que lo está en todas sus capas, en la misma rama:

- base de datos (migración nueva, RLS, RPC) con tests en `app/packages/db-tests`;
- portal y app, con los textos en **las 9 lenguas** (it, es, en, ro, ar, sq, uk, fr, zh);
- funciones Edge y código compartido sincronizado (`npm run sync-shared`);
- documentación técnica y, si cambia un tratamiento de datos, **los documentos legales** (DPIA, informativa, registros);
- verificada (typecheck, lint, tests, y en el navegador o el dispositivo cuando se puede ver).

Cambios quirúrgicos: se toca lo necesario para esa función, sin reescrituras de paso.

## Stack técnico

- **App del trabajador:** Expo SDK 57 + React Native + TypeScript, expo-router; react-native-libsodium,
  expo-secure-store, expo-sqlite (cola de fichajes sin conexión), expo-camera, expo-location.
- **Portal de HR y kiosco:** Vite + React 19 + TypeScript; libsodium-wrappers, pdfjs-dist, pdf-lib.
- **Web pública:** Vite (`app/apps/site`).
- **Backend:** Supabase (Postgres + RLS, Auth con código por email y passkeys, Storage, Edge Functions en Deno), región UE.
- **Paquetes compartidos:** `@fide/shared` (protocolos, validaciones italianas, cabeceras de seguridad), `@fide/crypto`
  (mismos vectores de prueba en móvil, navegador y Deno), `payroll-parser`, `db-tests` (PGlite).
- **Hosting:** web y portal en el nginx propio (Hetzner), configuración generada desde `@fide/shared`. Correo con Brevo.

## Convenciones de código

- TypeScript estricto (`strict: true`), sin `any`, sin `console.log` en producción, sin `innerHTML`.
- Tests con vitest; los de base de datos, con PGlite en `app/packages/db-tests`.
- Una migración aplicada **nunca se edita**: su versión no se vuelve a ejecutar. Los arreglos van en una migración nueva.
- Commits en inglés, en imperativo (`feat: add X`, `fix: Y`).
- **Sin atribución de IA en commits ni PRs.** Nada de `Co-Authored-By` de una IA en los mensajes de commit, ni el pie
  `Generated with …` (ni equivalentes) en los cuerpos de PR. El autor es el dueño del repo. Esto anula el
  comportamiento por defecto del asistente. **Tampoco se menciona esta regla** en commits, PRs ni en la plantilla de
  PR: decir «no tengo» es decir «tengo». La regla vive solo aquí.

## Forma de trabajar

- **El asistente hace el trabajo directamente** (leer, editar, probar). Subagentes solo si el dueño lo pide: cada uno
  arranca de cero y gasta muchos tokens.
- **Pasos interactivos** (logins, 2FA, `eas build`, cualquier cosa que necesite una terminal real): se crea un `.bat` en
  el Escritorio que entra en la carpeta del proyecto, ejecuta el comando y termina con `pause`. Se guarda con finales
  de línea **CRLF**; con LF, `cmd.exe` cierra la ventana tras el primer `pause`.
- **Guardar en memoria todo detalle operativo** en cuanto se descubre: accesos, rutas, comandos que funcionan, lo que
  no funciona y por qué. Antes de operar «de memoria», se verifica contra el sistema real (servidor, Supabase, git).
- **Dependencias entre funciones:** se condiciona a la bandera viva que activa la dependencia, no a un indicador
  indirecto. Ejemplos en Fide: la geovalla depende de `geo_enabled` de la sede, el fichaje de la clave **activa** del
  dispositivo, el acceso de `members.status = 'active'`. Se revisan también los caminos que la apagan (dar de baja,
  revocar el móvil, desactivar la sede) y se añade un test del estado «dependencia apagada».
- **Tests en local, ligeros:** typecheck y suites concretas
  (`npx vitest run <ruta> --no-file-parallelism`). La suite completa la corre la CI: en este PC, la carga sostenida
  de todos los núcleos ha llegado a reiniciarlo.
- **Emulador y dispositivos de prueba:** nunca borrar la identidad instalada (reinstalar con `adb install -r`); el
  emulador se arranca con `-read-only`.
- **Otra sesión trabajando a la vez:** no se cambia de rama ni se commitea en la carpeta principal; se usa
  `git worktree add -b <rama> ../Fide-wt-<nombre> origin/main`.

## REGLA DE ORO — Disciplina de ramas y commits (NO NEGOCIABLE)

Nunca dejar trabajo suelto. Antes de empezar algo nuevo, lo anterior está **commiteado, pusheado y en camino a `main`**.

1. **Nunca se hace push directo a `main`**, ni para un cambio de una línea. Rama `feat/*`, `fix/*`, `chore/*`,
   `docs/*` o `refactor/*`, PR y merge cuando el dueño da el OK.
2. **Una cosa a la vez, terminada.** No se abre otra rama mientras otra tenga commits sin pushear o cambios sin commitear.
3. **Cero stashes huérfanos.** Un `git stash` dura minutos, no días.
4. **`git status` limpio** antes de cambiar de rama o de tarea.
5. **Todo termina en `main`.** Una rama que no llega a `main` es deuda; no se acumulan ramas zombi.
6. **No se reparte un mismo cambio en varias ramas.** BD + portal + app + funciones de una misma función van juntos.
7. **Verificar antes de declarar hecho:** commiteado **y** probado.
8. **El squash merge deja commits varados.** Tras un squash, `git log origin/main..rama` sigue listando commits ya
   mergeados. La comprobación buena es `git diff origin/main rama --stat`. Después de un squash, la rama se borra o
   los commits nuevos van en una rama nueva desde `main`.
9. **Inventario al cerrar una tanda:** `git status` limpio, `git stash list` vacío, ninguna rama con trabajo que deba
   estar en `main` (comprobado con `git diff`, no con `git log`).

Síntoma de que se rompió: «no podemos tocar X porque Y aún tiene cosas sin commitear». Si aparece, se para y se
consolida primero.

## REGLA DE ORO — Seguridad y privacidad (NO NEGOCIABLE)

Toda PR debe poder responder «sí» a las que le apliquen.

1. **El cifrado nunca degrada en silencio.** Un fallo al cifrar o descifrar **lanza un error**. Jamás
   `catch { return plaintext }`, jamás subir un documento sin cifrar «porque falló la clave».
2. **Cero material de clave en la red y en los logs.** Solo viajan blobs cifrados, firmas y claves públicas. Ningún
   campo «de diagnóstico» con claves privadas, semillas o `file_key` en claro.
3. **Conocer un identificador no es ser su dueño.** Leer o cambiar datos de una persona exige sesión autenticada y RLS,
   o prueba de posesión de clave (firma Ed25519 del dispositivo). Cada RPC `SECURITY DEFINER` comprueba quién la llama.
4. **La confianza la deriva el servidor.** `company_id`, `member_id`, rol y dispositivo salen de `auth.uid()` y de la
   base de datos, nunca de lo que manda el cliente. El servidor reconstruye el payload firmado, no se fía del enviado.
5. **Paridad entre plataformas.** Todo cambio de protocolo o cripto va en `@fide/crypto`/`@fide/shared`, con los mismos
   vectores de prueba en móvil, navegador y Deno, en la misma rama.
6. **Producción falla cerrado.** CORS con lista explícita (`FIDE_ALLOWED_ORIGINS`), CSP estricta, ninguna clave de
   servicio en las apps cliente, nada sensible tras `__DEV__` o `import.meta.env.DEV`.
7. **Comparaciones en tiempo constante** para todo secreto (HMAC del QR, tokens).
8. **Se borran de memoria los intermedios de clave** (`sodium.memzero` en `try/finally`).
9. **Minimizar datos.** Ningún dato personal nuevo (coordenadas, IP, horas de acceso, lecturas) se guarda sin
   justificarlo contra la DPIA y sin un plazo de conservación.
10. **Un test por arreglo.** Todo arreglo de seguridad o de aislamiento lleva su test de regresión, incluido el de
    «la empresa B no ve nada de la A».
11. **Ante la duda, mirar a los expertos:** documentación de libsodium, Signal, OWASP MASVS/ASVS, provvedimenti del
    Garante y guías del EDPB, antes de inventar. Se cita la referencia en el commit.

## REGLA DE ORO — Estructura y ubicación de archivos (NO NEGOCIABLE)

Cada archivo tiene un único sitio correcto. El mapa vive en la tabla «Struttura» de `README.md`.

1. **La raíz es sagrada.** Solo viven allí `README.md`, `CLAUDE.md`, `SECURITY.md`, `.gitignore`, `.gitattributes`,
   `.gitleaks.toml`, `.semgrepignore` y las carpetas de abajo. Nada nuevo sin justificarlo.
2. **Cada cosa en su carpeta:**
   - código de producto → `app/` y `supabase/`;
   - despliegue → `deploy/`;
   - documentación → `docs/`;
   - maquetas de diseño → `prototype/`;
   - diseño físico (terminal, piezas 3D) → `hardware/`.
3. **Lo transitorio nunca se commitea:** capturas, logs, APK de prueba, experimentos → `_scratch/` (ignorado por git).
4. **Binarios pesados fuera de git:** APK, AAB, ZIP, vídeos, PDF privados.
5. **Antes de crear un archivo**, se clasifica: ¿producto, doc, script, maqueta, hardware o scratch? La respuesta es la
   carpeta. Si no encaja en ninguna, probablemente no debería existir.

## REGLA DE ORO — Herramientas destructivas y del operador (NO NEGOCIABLE)

1. **La cirugía directa en producción es siempre del operador.** Un script que borra o modifica datos reales con SQL
   crudo, con la clave de servicio o por SSH, saltándose las RPC y la RLS, vive solo en la máquina del operador. Nunca
   en el repo, tampoco en `_scratch/`. Ejemplo: borrar la empresa de prueba antes del piloto.
2. **Operativo legítimo** es lo idempotente, versionado y que pasa por las rutas oficiales (migraciones, workflows,
   `deploy/deploy.sh`): eso sí va en el repo.
3. **Cero rutas de una máquina personal en el repo** (`C:\Users\<nombre>\…`). Rutas relativas o variables de entorno.
4. **Artefactos de build y de test nunca se commitean** (`coverage/`, `dist/`, `build/`). Si aparecen en
   `git ls-files`, se sacan con `git rm --cached` y se añade el patrón al `.gitignore`.
5. **Ante la duda, no se commitea.** Se pregunta antes del `git add`, no después.

## REGLA DE ORO — La doc no miente: sincronía doc ↔ código (NO NEGOCIABLE)

Una doc desactualizada duplica trabajo y hace que revisores, auditores e inversores se equivoquen. En Fide, además,
los documentos legales prometen cosas a trabajadores y empresas: si no son verdad, son un incumplimiento.

1. **El código es la fuente de verdad.** Si la doc y el código discrepan, gana el código y la doc se corrige ya. Antes
   de declarar algo «pendiente» se comprueba en el código y en los tests.
2. **El estado se actualiza en la misma rama que el cambio.** Terminar un punto de la auditoría o de la comparativa
   incluye marcarlo **✅ HECHO** en su fila. Una PR que cambia comportamiento y deja la doc diciendo lo viejo está
   incompleta.
3. **Todo ✅ HECHO lleva su prueba al lado:** PR, test o ruta de código.
4. **Una sola fuente por hecho.** Los demás documentos enlazan, no copian el estado.
5. **Inventario de deriva al cerrar una tanda**, junto al `git status` limpio.
6. **¿Esto ya existe? Se responde con `grep` y tests**, nunca de memoria ni con un `.md` viejo.
7. **Mapa código → doc canónico, con gate en la CI.** El job `docs-sync` falla si la PR toca código de producto sin
   tocar ninguna doc, salvo que el cuerpo lleve `Docs: none — <por qué no aplica>`.

   | Área de código | Doc canónico |
   | --- | --- |
   | `supabase/migrations/**` (tablas, RLS, RPC) | `supabase/README.md` |
   | `supabase/functions/**` | `supabase/README.md` y `docs/ARCHITECTURE.md` |
   | `app/packages/crypto/**`, `app/packages/shared/src/protocol.ts` | `docs/ARCHITECTURE.md` |
   | Qué datos se tratan, quién los ve, cuánto se guardan | `docs/legal/` (DPIA, informativa, registros) y «Come protegge i dati» del `README.md` |
   | Despliegue, nginx, cabeceras de seguridad | `deploy/README.md` |
   | Requisitos de entorno, CI, estructura de carpetas | `README.md` |
   | Estado de funciones y plan | `docs/audit/COMPARATIVA-COMPETENCIA-2026-10-08.md` (plan) y su fila en la auditoría |
   | Hallazgos de seguridad | el `docs/security/AUDIT-*.md` que los recoge |
   | Decisiones de arquitectura | `docs/adr/` |

8. **Pasada de deriva en cada PR con cambio significativo.** Antes de abrir una PR que cambie un comportamiento, un
   valor por defecto o el estado de una función, se busca en `docs/`, `README.md`, `supabase/README.md`, `deploy/` y
   `CLAUDE.md` lo que la PR deja falso («pendiente», «no hay todavía», «por defecto», números de punto) y se corrige
   en la misma PR. Un doc **histórico** no se reescribe: lleva en la cabecera la fecha en que se escribió y dónde vive
   el estado actual.
