## Qué cambia

<!-- Una o dos frases. Qué y por qué. -->

## Docs

<!-- OBLIGATORIO (regla de oro «La doc no miente», gate `docs-sync` en la CI).
     Deja UNA de las dos líneas, sin el comentario:
       Docs: supabase/README.md, docs/legal/DPIA_GDPR_Art35.md
       Docs: none — <por qué no aplica: p. ej. «solo tests», «refactor sin cambio de comportamiento»>
     Mapa código → doc canónico: CLAUDE.md, sección «La doc no miente». -->
Docs:

## Verificación

<!-- Qué se corrió y qué salió: typecheck, suites concretas, prueba en el navegador o en el dispositivo. -->

## Checklist

- [ ] Completo de punta a punta: migración nueva + RLS + db-tests, portal, app y las 9 lenguas (si aplica)
- [ ] Un test por arreglo de seguridad o de aislamiento entre empresas
- [ ] Si cambia qué datos se tratan, quién los ve o cuánto se guardan: DPIA, informativa y registros actualizados
- [ ] Sin `console.log`, sin `any`, sin `innerHTML`, sin material de clave en logs ni en la red
