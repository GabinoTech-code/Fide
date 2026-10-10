# Comparativa y plan de Fide · 10 de octubre de 2026

Fuente vigente del plan de construcción. Reemplaza el plan de la [comparativa del 8 de octubre](COMPARATIVA-COMPETENCIA-2026-10-08.md), que se conserva como antecedente. El detalle de hallazgos existentes sigue en la [auditoría funcional](AUDITORIA-FUNCIONAL-2026-10-08.md).

## Alcance y evidencia

Se contrastaron páginas y guías oficiales de seis proveedores con el código de Fide en `main`, commit `dbf7f98` (PR #40). Las ofertas comerciales describen capacidades anunciadas, no una prueba de funcionamiento independiente ni disponibilidad en cualquier licencia, país o configuración. No se han contratado demos ni aceptado condiciones.

«Existe» significa que hay una implementación identificable; no certifica ausencia de errores. «Parcial» indica un flujo incompleto o una limitación concreta. Los saldos de la PR #40 están integrados y con CI verde. El portal está publicado en la release `20261010202035` junto con la corrección de informes de la PR #42 (`074548e`); el desglose móvil todavía requiere distribuir un nuevo APK. No se inició otro build antes de este plan.

## Qué ofrecen y cómo organizan el trabajo

| Producto | Capacidades confirmadas y mecanismo | Qué aprender para Fide |
| --- | --- | --- |
| Zucchetti / ZConnect + Workflow HR | La app da acceso a funciones de la suite: documentos, comunicaciones, turnos y cambios, gastos, ausencias y formación. Workflow HR conecta anomalías, justificativos, totalizadores y autorizaciones del responsable. [ZConnect](https://www.zucchetti.it/it/cms/soluzioni/software-hr-zucchetti/hr-core-platform/zconnect/app-gestione-personale.html), [Workflow HR](https://www.zucchetti.it/it/cms/soluzioni/software-hr-zucchetti/software-gestione-presenze/presenze-assenze-ferie/workflow-hr/software-gestione-straordinari-piano-ferie.html). | Una bandeja de tareas conectada al cartellino y a los turnos; el trabajador debe entender qué requiere acción y quién la tramita. |
| Factorial | Integra ausencias, presencias, turnos, documentos/firma y gastos. Configura políticas asignadas a trabajadores, contadores y grupos de aprobación; los contadores tienen ciclos, acreditación y arrastre configurables. [Catálogo](https://factorial.it/funzionalita), [políticas](https://help.factorialhr.com/en_US/time-off-settings/how-to-create-and-assign-time-off-policies), [contadores](https://help.factorialhr.com/en_US/a-propos-des-compteurs-dabsences). | La acumulación depende de políticas y asignaciones con fechas; mostrar un saldo exige explicar de dónde sale. |
| Jet HR | Conecta solicitudes con saldos, calendario, presencias y datos para el cedolino. También ofrece directorio histórico y recordatorios de vencimientos. [Gestión de vacaciones](https://www.jethr.com/funzionalita/gestione-ferie-e-permessi/gestionale-ferie), [plataforma](https://www.jethr.com/cose-jet-hr). | Una aprobación debe propagarse de forma coherente al resto de pantallas y al cierre mensual. Fide necesitará adaptadores para el consulente porque no elabora las nóminas. |
| Personio | La app documenta calendario de presencias/ausencias y saldos, documentos con carga/descarga, anuncios, directorio e inbox. Algunas tareas complejas remiten a escritorio; la aprobación de horas de otros se realiza en escritorio. [Guía móvil](https://support.personio.de/hc/en-us/articles/22089774701853-Overview-of-the-Personio-mobile-app). | Definir qué resuelve cada rol en móvil y en portal. La navegación y los avisos deben llevar directamente al trámite correspondiente. |
| TeamSystem | Integra organización, presencias, turnos, gastos, dotaciones y seguridad en su catálogo. El módulo Studio HR permite cargar horas/ausencias mensuales y alimenta Studio Paghe. [Catálogo oficial](https://www.teamsystem.com/media/files/1241_TS_BROCHURE_HR_2024_sintetica.pdf), [presencias para el estudio](https://www.teamsystem.com/hr/teamsystem-studio-hr/funzionalita/inserimento-presenze-hr/). | Validar el intercambio de datos con el programa real de nóminas, además de producir un CSV legible. |
| Inaz | Su portal combina datos personales y documentos con justificativos, gastos, consultas de ausencias y gestión de anomalías. Las apps amplían la operación en movilidad. [Portal del empleado](https://www.inaz.it/software/portale-del-dipendente/), [apps](https://www.inaz.it/app-inaz/). | Completar los ciclos de corrección, comunicación y consulta histórica del trabajador. |

Estas suites conectan módulos sobre datos comunes de personas, permisos, calendario y horarios. Esta es una inferencia de sus flujos documentados, no una afirmación sobre su arquitectura interna. Sus páginas públicas tampoco demuestran por sí solas cómo almacenan claves o si usan E2EE; no se atribuye a terceros una carencia criptográfica sin evidencia.

## Estado comprobado de Fide

Las rutas siguientes son evidencia dentro del repositorio; los tests prueban comportamientos específicos, no toda la experiencia de usuario.

| Área | Estado real | Evidencia / hueco | Tanda |
| --- | --- | --- | --- |
| Acceso, invitación y passkeys | Existe | `session.tsx`, `invite/[token].tsx`, `LoginPage.tsx`; revisar en cada release los recorridos de sesión y recuperación. | T0 |
| Roles titular/HR/responsable/trabajador | Existe | `MemberPanel.tsx`, `roleChange.ts`, `managers.test.ts`; guía y confirmación de cambios en PR #37. | Mejorar T1 |
| Responsable sobre su equipo | Existe en portal | `App.tsx` habilita presencias y solicitudes con RLS. La app del trabajador no tiene bandeja de aprobación de equipo. | T3 |
| Mansione, categoría, livello, CCNL y contrato | Falta | `members` guarda rol de acceso, sede y responsable, pero no esos datos laborales. Capo turno como cargo no equivale al rol manager. | T1 |
| Organización por departamentos/equipos | Parcial | Hay empresa, sede y un responsable por empleado; faltan estructura de equipos y delegaciones temporales. | T1 / T6 |
| Horarios personales y cambios con fecha | Falta | No hay entidad de horarios ni asignaciones laborales vigentes por intervalo. | T1 |
| QR, geovalla mínima y cola offline | Existe | `timbra.tsx`, `outbox.ts`, `punch-sync.test.ts`, `attendance.test.ts`. | Mantener T0 |
| Pausas con entidad propia | Falta | El protocolo registra entrada/salida; no distingue pausa pagada/no pagada. | T2 |
| Turnos nocturnos y fronteras de mes | Parcial | El informe maneja intervalos, pero no un plan laboral que defina la jornada esperada. | T2 |
| Cartellino histórico del trabajador | Falta | `useTodayPunches()` y la pantalla de fichaje consultan hoy; el CSV de HR no sustituye el historial en la app. | T2 |
| Anomalías | Parcial | Flags y solicitudes de corrección existen; faltan tolerancias por horario y una bandeja de resolución. | T2 |
| Historial y motivo de decisiones | Existe | `RequestsPage.tsx`, `requestHistory.ts`, `richieste.tsx`: pendientes e historial, motivo y fecha. | Mantener T0 |
| Fechas y solicitud por horas | Existe con límites | Calendario móvil y cantidad por horas; medias jornadas y cantidad por día no siguen todavía horarios personales. | T1 / T3 |
| Calendario italiano para solicitudes | Parcial | `italy/calendar.ts`: laborables y festivos nacionales. No incorpora jornada de seis días, turno dominical o festivo patronal de la sede. | T1 |
| Vacaciones/ROL/EXFEST acumulados y disponibles | Parcial | PR #40: carga manual de acreditado, arrastre y utilizado externo publicada en portal; desglose móvil integrado. Falta distribuir APK, CSV y acumulación mensual configurada. | T0 / T3 |
| Contabilidad anual de saldos | Parcial | `leave_balance_summary` asigna toda la solicitud al año de inicio. Falta repartir rangos entre ejercicios y conciliar cierres. | T3 |
| Ausencia aprobada y report mensual coherentes | ✅ Corrección del calendario actual HECHA; límites explícitos | `monthlyReport.ts` comparte reparto entre detalle y resumen; `monthlyReport.test.ts` cubre fines de semana, festivos, fracciones y cruces. Cantidades incompatibles o horas multidiarias bloquean la exportación. Faltan calendarios personales y reparto explícito. | T0 / T1 / T3 |
| Catálogo y reglas de ausencias | Parcial | Tipos italianos predefinidos en BD; falta UI de configuración, elegibilidad y reglas por contrato. | T3 |
| Extra y banca ore | Falta flujo adecuado | `STRAORD` está dentro de tipos de ausencia. No hay autorización de horas extra ni libro de banca ore. | T2 / T3 |
| Plan de turnos y cambios | Falta | No hay tablas/rutas para publicar turnos ni solicitar intercambios. | T4 |
| Exportación al consulente | Parcial | `MonthlyReport.tsx`: CSV genérico con horas, ausencias y anomalías. Faltan cierre, revisión y tracciato validado con el estudio. | T0 / T5 |
| Envío/descarga de cedolini cifrados | Existe | `PayrollPage.tsx`, `payroll.ts`, `documents.ts`, `documents.test.ts`; CF, revisión de asignaciones y confianza en clave. | Mantener T0 |
| Documento individual y expediente | Parcial | Se puede asignar un PDF mediante el flujo actual; no hay un expediente ni un envío dedicado desde la ficha del empleado. | T6 |
| Trabajador adjunta documento a HR | Falta | No hay flujo de subida ni claves receptoras de HR; el cifrado actual tiene como receptor al trabajador. | T6 |
| Circulares, tablón y acuse explícito | Falta | Los avisos de la home son derivados de solicitudes/documentos; no son noticias publicadas por HR ni acuses de conformidad. | T6 |
| Firma documental | Falta | Firmar un fichaje no implementa firma de contrato ni demuestra FEA/FEQ. | T6 con revisión específica |
| Email y push | Parcial | ✅ HECHO código de email y push genérico opcional; tests en `app/packages/db-tests/src/push.test.ts` y `app/apps/mobile/src/lib/push.test.ts`. Pendientes credenciales Android/Expo, revisión de proveedores, despliegue y prueba real; ver `deploy/README.md`. | T6 |
| Vencimientos y onboarding/offboarding | Parcial | Baja, suspensión y revocación existen; faltan tareas de alta/baja, contratos y recordatorios de formación/DPI. | T7 |
| Gastos, recibos y trasferte | Falta | No hay entidad, aprobación ni adjuntos para gastos. | T7 |
| Peticiones a HR y cambios de datos | Parcial | Bandeja RGPD existe; no sustituye un trámite de cambio de datos laborales o una petición administrativa general. | T7 |
| Informes agregados y API para integraciones | Parcial / falta | Presencia de hoy y CSV existen. No hay catálogo estable de integración ni panel histórico completo. | T5 / T8 |
| RGPD, auditoría y aislamiento | Existe | `PrivacyPage.tsx`, `AuditPage.tsx`, tests DB; falta completar la automatización de conservación según auditoría G2. | T0 / T8 |

## Hallazgo reproducido: vacaciones distintas entre app y exportación

En un caso sintético, una solicitud FERIE del **11 al 14 de septiembre de 2026** arroja:

- App: `italianWorkingDays(...)` = **2 días**.
- `buildMonthlyReport(...)`: `summaries[0].absences.FERIE.days` = **4 días**.

Se ejecutaron ambas funciones sobre el mismo rango y cantidad, sin acceso a datos reales. La causa está en `app/apps/web-portal/src/lib/monthlyReport.ts`: el resumen cuenta los días del calendario dentro del rango, sin usar la cantidad de la solicitud ni el calendario laboral de la persona. La app usa `app/packages/shared/src/italy/calendar.ts`.

**Prioridad T0:** definir una única distribución diaria de la ausencia, con el calendario aplicable, y usarla tanto para solicitud/saldo como para informe. Casos mínimos: fin de semana, festivo, mes/año cruzados, horas, seis días y turnos. Las cantidades ya aprobadas no deben alterarse retroactivamente en silencio. Hasta corregir y validar, la exportación requiere revisión del consulente.

**Actualización:** ✅ corregido el caso reproducido y los rangos compatibles con el calendario actual de la app.
Detalle y resumen comparten un único reparto; solicitudes de un día conservan la cantidad aprobada, incluso
fracciones u horas. Los rangos multidiarios con cantidad distinta de los laborables y las horas multidiarias
bloquean ambos CSV e identifican la solicitud que requiere revisión. No se altera la historia ni se asume que
una baja médica deba contarse con el mismo calendario que FERIE. Faltan reglas por tipo/contrato y reparto
explícito para esos casos; no se declara T0 completo. Evidencia: `monthlyReport.test.ts`.
La PR #42 se integró con toda la CI verde y se publicó. Verificación en navegador: el informe de octubre se
preparó y descargó correctamente con sus avisos de anomalías. El caso sintético 2→4 queda cubierto por las
pruebas de regresión; no se crearon ausencias en producción para reproducirlo.

## Orden propuesto de construcción

Cada tanda incluye migraciones/RLS, portal, app con nueve idiomas, documentación y pruebas. La siguiente depende de la aceptación de la anterior. Son unidades de alcance, no una estimación de fechas de entrega.

| Tanda | Entrega completa | Dependencia y criterio de aceptación |
| --- | --- | --- |
| **T0 · Coherencia y release** | Corregir la discrepancia solicitud/report; consolidar saldos PR #40 y comprobar su publicación; revisar las 4 alertas de dependencias reportadas por GitHub; ensayo con datos sintéticos de un ciclo mensual. | La misma ausencia tiene idéntica cantidad en app, saldo e informe. Release identificada y datos de prueba separados de reales. |
| **T1 · Datos laborales y calendario** | Mansione, categoría/livello, contrato, CCNL como referencia, horas semanales, fechas; equipos y supervisor; horarios/calendario de sede y asignaciones con vigencia. | Cambiar el contrato hoy no recalcula la historia. Separar cargo laboral de permisos del sistema. No añadir salario o documentos personales que no hagan falta. |
| **T2 · Jornada y cartellino** | Pausas, turnos nocturnos, historial mensual, totales ordinarios y extra candidatos, anomalías y correcciones enlazadas. | Sin red, fichaje duplicado, medianoche y horario de verano probados. Los fichajes firmados se conservan; las correcciones siguen un flujo auditable. |
| **T3 · Ausencias y saldos completos** | Calendario de equipo, reglas de ausencias y rangos, reparto entre meses/años, medias jornadas, acumulación configurada, CSV de saldos, extra separado de ausencias y banca ore. Bandeja móvil del responsable. | Libro de movimientos con origen y fecha; sin duplicar la acumulación del consulente. Aprobación humana, sin autoaprobar por saldo. El responsable solo ve su equipo y no decide su propia solicitud. |
| **T4 · Turnos** | Plan por sede/equipo, plantillas repetibles, publicar versiones, aviso al trabajador, cambios y cobertura. | Publicar, modificar y cancelar deja versión y aviso. Una ausencia aprobada indica qué turnos afecta. Cobertura calculada con reglas explícitas. |
| **T5 · Cierre y consulente** | Revisión mensual, cierre/versionado y reapertura justificada; mapping de códigos; exportador del software real del estudio; acceso externo limitado. | El consulente importa un archivo de prueba y valida cantidades/códigos. Una corrección tras el cierre genera una nueva versión identificable. |
| **T6 · Documentos y comunicaciones** | Expediente, envío individual, avisos/circulares con destinatarios y acuse explícito; push discreto; documentos trabajador→HR; delegación temporal de aprobaciones. | Diseñar primero claves y revocación para receptores HR; servidor sin documentos en claro. Acuse distinto de abrir un archivo. No anunciar firma legal avanzada sin validación. |
| **T7 · Operación ampliada** | Vencimientos, listas de alta/baja, dotaciones/DPI, gastos/trasferte y peticiones administrativas. | Cada trámite tiene remitente, destinatario, responsable, estado, historial y acceso mínimo. Registrar cumplimiento sin diagnósticos médicos. |
| **T8 · Plataforma** | Informes históricos, integración documentada, reglas de conservación, soporte operativo y restauración verificada. | API versionada, aislamiento, exportación y recuperación demostrables. |

T1 y T2 son la base para que T3 y T4 calculen cantidades correctamente. T5 necesita además conocer el programa y el formato del consulente; esa información concreta sigue faltando. La revisión de la exportación actual no espera a T5.

## Decisiones propuestas

1. **Una fuente autorizada por contador.** Si el consulente aporta el saldo oficial, importarlo con fecha/corte y conciliar movimientos. Si Fide calcula acumulación, usar una regla configurada y validada para el contrato del piloto. Evitar dos motores acreditando el mismo mes. Factorial documenta precisamente la necesidad de desactivar acumulación/arrastre propios cuando un sistema externo ya los aporta en su [integración Silae](https://help.factorialhr.com/integraciones-de-nomina/silae-integration); ese ejemplo es de otra integración y no demuestra compatibilidad italiana de Fide.
2. **Historial de movimientos de saldo.** Acreditación, arrastre, consumo, cancelación y ajuste con origen; mostrar al trabajador el motivo de una variación. Permitir reconciliar con nóminas sin leer el PDF desde el servidor.
3. **Configuración de empresa guiada.** Antes de invitar: sedes → personas/cargos → responsables → horarios → tipos/saldos → formato del estudio. Mostrar lo que falta con estados claros.
4. **Bandeja única por rol.** Trabajador: mis trámites. Capo turno: equipo y tareas asignadas. HR: compañía. Titular: administración. No usar el título contractual como autorización implícita.
5. **Paridad diaria antes de ampliar catálogo.** Prioridad a personas, tiempo, ausencias, turnos, documentos y cierre. Pagas, crédito, tarjetas, ATS, MDM y reservas permanecen en el inventario como productos adicionales; no se presentan como funciones terminadas ni se incorporan a este ciclo del piloto.
6. **Mantener las promesas de Fide.** E2EE para documentos, ubicación mínima, nada de biometría laboral ni IA para evaluar o decidir sobre personas. Copiar un flujo útil exige implementarlo con esas protecciones.

No se promete que cubrir este plan iguale todas las variantes de seis suites. La cobertura se medirá por recorridos reales del piloto, no por número de botones.

## Puerta de aceptación de cada función

Usar una lista de recorridos con evidencia: configurar → asignar → crear → enviar → notificar → recibir → decidir → consultar historial → exportar; cuando aplique, cancelar, revocar, suspender, corregir o reabrir. Probar también falta de configuración, sin conexión, error, reintento, duplicado, cambio de rol y empresa ajena.

Cada release tendrá una matriz de pantallas del prototipo frente al producto, estados vacío/error/cargado, IT/ES/EN en portal y las nueve lenguas en app. La verificación incluirá Android e iOS antes de declarar paridad entre plataformas.

**Siguiente implementación recomendada:** T0, empezando por la discrepancia de vacaciones en el resumen mensual; después T1, sin construir acumulación automática sobre contratos y horarios que aún no están definidos.

**Revisión de dependencias de T0 (10 de octubre):** comprobadas las cuatro alertas abiertas de GitHub contra
`npm ls` y `npm run audit`. `braces`, `node-forge` y `uuid` proceden del tooling de Expo; `decode-uri-component`
sí llega a la app vía Expo Router y mantiene un riesgo de bloqueo mediante enlace manipulado. El audit pasa
con las excepciones existentes; eso no significa que las vulnerabilidades hayan sido corregidas. La fuente
de las aceptaciones y motivos sigue siendo `app/audit-allowlist.json` y el [informe vigente de seguridad](../security/AUDIT-2026-10-07.md).
