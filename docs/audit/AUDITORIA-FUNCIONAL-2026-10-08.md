# Auditoría funcional de punta a punta · 8 de octubre de 2026

> Estado vivo: cada punto terminado lleva **✅ HECHO** con su prueba. El plan vigente está en la
> [comparativa](COMPARATIVA-COMPETENCIA-2026-10-08.md).

Revisión de la base de datos (tablas, RPC y permisos), del portal de HR y de la app del trabajador, buscando
los flujos que se cortan a mitad de camino. Cada hallazgo indica dónde está el hueco: **BD** (no existe en la base
de datos), **Portal** o **App** (existe en la base de datos, pero nadie lo puede usar).

Prioridades:
- **P0**: bloquea el piloto o incumple algo que ya prometemos en los documentos legales.
- **P1**: necesario para que una empresa lo use a diario.
- **P2**: mejora.

---

## 1. Empleados

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| E1 | **Dar de baja o suspender a un empleado.** `set_member_status` existe, pero no hay botón. Un despedido conserva el acceso a la app, puede fichar y seguiría recibiendo documentos. ✅ **HECHO** (migración `20261009090100_member_lifecycle.sql`, test `lifecycle.test.ts`, panel «Gestisci» del portal). | Portal | **P0** |
| E2 | **Revocar el móvil de un empleado** (perdido o robado). `revoke_device_key` existe, sin botón. ✅ **HECHO** (panel «Gestisci» → Stato e telefono; `revoke_device_key` ya cubierto en `members.test.ts`). | Portal | **P0** |
| E3 | **Editar un empleado** (nombre, email, CF, matrícula, sede, responsable). La BD lo permite, pero el portal solo deja crear. Un error al escribir el email bloquea la invitación para siempre. ✅ **HECHO** (RPC `update_member` (email solo mientras está invitado), test `lifecycle.test.ts`). | Portal | **P0** |
| E4 | **Mansión y categoría.** No existen. Falta un catálogo de **mansioni** configurable por empresa (operaio comune, operaio specializzato, capo turno, capo impianto, magazziniere, impiegato…), más categoría (operaio / impiegato / quadro / apprendista), **livello CCNL**, tipo de contrato (indeterminato, determinato, apprendistato, somministrato), **horas semanales** o part-time, fecha de alta y de baja, y reparto. | BD + Portal + App | **P1** |
| E5 | **Roles y jerarquía.** `set_member_role` existe, sin botón: no se puede nombrar a nadie HR ni responsable. `manager_member_id` (quién es su capo turno) tampoco se puede asignar. 🟡 **A medias**: el responsable ya se asigna en «Gestisci → Dati» (`update_member`); los roles siguen sin pantalla. | Portal | **P1** |
| E6 | **Estado de la invitación.** No se ve si caducó (7 días), no se puede anular (`revoke_invitation`, sin botón) y "Invitar" crea una nueva cada vez. | Portal | P1 |
| E7 | Buscar o filtrar empleados por sede, rol o estado; ordenar. | Portal | P2 |
| E8 | La importación CSV no recoge mansión, contrato ni horas (depende de E4). | Portal | P1 |

**Sobre "capo turno":** son dos cosas distintas que conviene separar.
- La **mansión** es lo que hace en el contrato (capo turno, capo impianto). Sale en sus datos y en el informe para el consulente.
- El **rol** es lo que puede hacer en Fide. Un capo turno sería *responsable* (manager) de su equipo: ve las presencias de su gente y aprueba sus solicitudes.

## 2. Responsables (capo turno, capo impianto)

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| R1 | **El responsable no tiene herramienta.** La BD ya le deja aprobar las solicitudes de su equipo (`decide_leave_request` acepta al manager) y ver sus fichajes, pero el portal bloquea a todo el que no sea HR y la app no tiene pantallas de responsable. | Portal + App | **P1** |
| R2 | Vista "mi equipo hoy": quién ha entrado, quién falta y quién está de vacaciones. | Portal + App | P1 |

## 3. Fichajes y presencias

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| F1 | **HR no puede registrar un fichaje en nombre de un trabajador.** Solo el propio trabajador crea sus correcciones. La informativa y la DPIA **prometen** una alternativa sin móvil gestionada por HR, y el Garante la exige. ✅ **HECHO** (RPC `hr_record_punch` (`20261009090200_hr_entries.sql`), test `hr-actions.test.ts`). | BD + Portal | **P0** |
| F2 | Historial de presencias por empleado y por mes en el portal (hoy solo existe "hoy" y el CSV mensual). | Portal | P1 |
| F3 | Panel de **anomalías**: salidas olvidadas, turnos de más de 16 h, fichajes marcados. Hoy solo aparecen dentro del CSV. | Portal | P1 |
| F4 | El trabajador solo ve los fichajes de **hoy**; no tiene su historial del mes ni sus horas. | App | P1 |
| F5 | **Turnos y horarios.** No existen. Sin ellos no se puede calcular retraso, ausencia injustificada ni horas extra frente al contrato (depende de E4). | BD + Portal + App | P2 (grande) |
| F6 | Calendario de festivos italianos (y patrón local) para el informe. | BD | P2 |
| F7 | Mapa para elegir la posición de la sede; hoy se escriben latitud y longitud a mano (solo importa si se activa la ubicación). | Portal | P2 |

## 4. Vacaciones, permisos y bajas

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| V1 | **Saldos.** La tabla `leave_balances` existe, pero no hay pantalla ni importación: nadie puede cargar los días de vacaciones o ROL, y el trabajador ve sus saldos vacíos. Estaba planificado como importación CSV. | Portal | **P1** |
| V2 | **HR no puede registrar una ausencia en nombre del trabajador** (por ejemplo, la malattia con el certificado INPS que le llega a la empresa, o la de un trabajador sin móvil). ✅ **HECHO** (RPC `hr_record_leave` (`20261009090200_hr_entries.sql`), test `hr-actions.test.ts`). | BD + Portal | **P0** |
| V3 | El trabajador **no ve el motivo de un rechazo** (`decision_note`) y HR no puede escribirlo al rechazar. | Portal + App | P1 |
| V4 | Solicitudes: solo se ven las pendientes. Falta historial, filtros y quién aprobó y cuándo. | Portal | P1 |
| V5 | **Calendario de ausencias** de la empresa o del equipo, para ver quién falta y cuándo. | Portal | P1 |
| V6 | El trabajador escribe las fechas a mano (`AAAA-MM-GG`) y calcula él los días. Falta un selector de fechas y el cálculo de días laborables (y medias jornadas). | App | P1 |
| V7 | Configurar los tipos de ausencia (la BD lo permite: nombre, unidad, si necesita aprobación o protocolo). "STRAORD" es una hora extra, no una ausencia: debería ser una solicitud aparte. | Portal | P2 |
| V8 | Avisos: nadie se entera de una solicitud nueva ni de una decisión (ver N1). | — | P1 |

## 5. Documentos y nóminas

**Cómo funciona hoy.** HR sube el PDF con todas las nóminas.
1. El portal busca el codice fiscale de cada página y lo empareja con los empleados que tienen ese CF en Fide.
2. Enseña una tabla con cada destinatario, sus páginas y su estado (*listo*, *ya entregado*, *móvil nuevo*, *sin dispositivo*).
3. Las páginas sin CF reconocible se pueden asignar a mano.
4. Cada parte se cifra para el móvil de su destinatario.

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| D1 | **Retirar un documento** enviado a la persona equivocada. No existe ninguna forma, y un cedolino en el móvil equivocado es una violación de datos. ✅ **HECHO** (RPC `withdraw_document` (`20261009090300_document_withdrawal.sql`), test `hr-actions.test.ts`, historial de Cedolini). | BD + Portal | **P0** |
| D2 | **Documento suelto a una o varias personas** (contrato, comunicación, CU de uno solo): hoy hay que pasar por el flujo de nóminas y asignar las páginas a mano. Falta "Enviar documento", eligiendo destinatarios de una lista. | Portal | P1 |
| D3 | **Pendientes de entrega.** Si un trabajador aún no ha activado la app, su nómina se salta y nadie lo recuerda. Falta una cola "se enviará cuando active el móvil", o al menos un aviso persistente. | Portal | P1 |
| D4 | **Historial por empleado**: qué documentos tiene, cuándo los abrió (prueba de entrega) y exportarlo. Hoy solo hay un recuento por lote. | Portal | P1 |
| D5 | Empleados **sin CF** en Fide: nunca se emparejan automáticamente; avisar al subir el PDF. | Portal | P1 |
| D6 | El trabajador no recibe aviso de un documento nuevo (ver N1). | — | P1 |

## 6. Privacidad y cumplimiento

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| G1 | **Solicitudes RGPD sin bandeja.** El trabajador puede pedir la cancelación desde la app, pero HR no las ve: `resolve_gdpr_request` existe, sin pantalla. Hay que responder en un mes (art. 12). ✅ **HECHO** (página Privacy del portal y lista en la app; `20261009090400_gdpr_inbox.sql`, test `hr-actions.test.ts`). | Portal | **P0** |
| G2 | Purga automática de datos al terminar los plazos de conservación. | BD | P2 |

## 7. Avisos

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| N1 | **Notificaciones.** Push sin configurar (falta Firebase) y sin emails de aviso. Ni HR se entera de las solicitudes nuevas, ni el trabajador de las decisiones o de los documentos. Alternativa rápida: emails por Brevo, que ya funciona. | BD + App | **P1** |
| N2 | El email de invitación solo está en italiano; el trabajador tiene idioma preferido (`preferred_language`). | Funciones | P2 |

## 8. Empresa, cuenta y operación

| # | Hallazgo | Dónde | Prio |
| --- | --- | --- | --- |
| C1 | **Datos de la empresa** (PEC, SDI, CCNL, dirección) no se pueden editar después del alta. | Portal | P1 |
| C2 | **Passkeys:** el botón "Entrar con passkey" aparece, pero en producción no están configuradas (solo `localhost`) y falla. Hay que configurarlas o esconder el botón. | Supabase + Portal | P1 |
| C3 | **Plan de Supabase:** el plan gratuito **pausa** el proyecto tras 7 días sin actividad y **no hace copias de seguridad**. Antes del piloto real hace falta el plan Pro (~25 $/mes). | Operación | **P1** |
| C4 | **App del trabajador:** falta la build con los App Links y con las variables de Supabase configuradas en EAS. | App | **P0** para el piloto |
| C5 | Borrar la empresa de prueba antes del piloto real. | Operación | P1 |

---

## Plan propuesto

> La [comparativa con la competencia](COMPARATIVA-COMPETENCIA-2026-10-08.md) amplía los bloques 2 y 3 con lo que ofrecen
> Zucchetti y los demás (K1–K50) y adelanta los horarios (F5) al bloque 2. El plan de allí sustituye a este.

**Bloque 1 · Imprescindible para el piloto (P0)**
- E1 baja y suspensión;
- E2 revocar móvil;
- E3 editar empleado;
- F1 y V2: HR registra fichajes y ausencias en nombre del trabajador;
- D1 retirar documento;
- G1 bandeja RGPD;
- C4 build de la app.

**Bloque 2 · Uso diario (P1)**
- E4 + E8 mansioni, contrato y horas (también en la importación);
- E5 roles y capo turno;
- R1 + R2 herramienta del responsable;
- V1 saldos e importación;
- V3–V6 solicitudes completas;
- D2–D5 documentos sueltos y pendientes;
- N1 avisos por email;
- C1–C3.

**Bloque 3 · Mejoras (P2)**
- F5 turnos y horarios;
- F6 festivos;
- F7 mapa;
- V7;
- N2;
- G2.
