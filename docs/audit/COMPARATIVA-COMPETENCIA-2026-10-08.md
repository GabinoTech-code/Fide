# Comparativa con la competencia · 8 de octubre de 2026

> Antecedente histórico de la comparativa inicial. El [estado y plan vigentes del 10 de octubre](COMPARATIVA-Y-PLAN-2026-10-10.md)
> revisan las funciones contra el código actual y fuentes oficiales. Las tablas siguientes contienen estados y afirmaciones de aquella revisión que no deben usarse como inventario actual.

Qué ofrecen Zucchetti y las demás apps de presencias y RR. HH. que se usan en Italia, qué tiene Fide de cada cosa y qué
hacemos con lo que falta. Complementa la [auditoría funcional](AUDITORIA-FUNCIONAL-2026-10-08.md): si un hueco ya
figura allí, se cita su número (E1, V1…); los nuevos van numerados de K1 a K50.

## Con quién nos comparamos

| | Producto | Qué es |
| --- | --- | --- |
| **Z** | Zucchetti: apps ZConnect, ZTimeline, ZClockIn, ZTimesheet y People Smart, sobre la suite HR Infinity / HR Portal | Líder en Italia, con más de 60 productos de RR. HH. Cada app se licencia aparte y la empresa tiene que habilitar a cada trabajador. |
| **TS** | TeamSystem HR | Suite con nóminas, presencias y notas de gastos. La app ficha en modo simple, con GPS o con NFC. |
| **F** | Factorial | SaaS español con más de 15.000 empresas clientes y muy presente en las pymes italianas. |
| **J** | Jet HR | Startup italiana: plataforma de RR. HH. que también elabora las nóminas, con un consulente partner. |
| **I** | Inaz | Nóminas y presencias para consulenti y empresas; app HR INAZ. |
| **P** | Personio | Suite europea; firma avanzada con Signaturit. |
| **S** | Sesame HR | SaaS español: pausas, fichaje sin conexión, encuestas y chat con RR. HH. |

Las fuentes están al final. Casi todas son páginas comerciales y guías públicas: dicen lo que cada uno anuncia, no lo
bien que funciona.

**Leyenda**
- **Fide:** ✅ ya lo tiene · 🟡 a medias · ❌ falta.
- **Decisión:**
  - **B1**: bloque 1, imprescindible para el piloto.
  - **B2**: bloque 2, igualarles en el uso diario.
  - **B3**: bloque 3, completar el catálogo.
  - **Fuera**: no lo copiamos (se explica el motivo).

---

## 1. Fichar

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | Fichar desde la app con geovalla | Z, TS, F, J, S | ✅ sin guardar coordenadas | — |
| — | Fichar con QR | Z, F, J, S | ✅ QR dinámico, de un solo uso y firmado | — |
| — | Fichar sin conexión y sincronizar después | TS, S | ✅ cola local | — |
| — | Tablet fija en la entrada (kiosco) | Z, S | ✅ | — |
| K1 | **Pausas**: inicio y fin, retribuida o no, automática. Son obligatorias si la jornada supera 6 h (art. 8 D.Lgs. 66/2003). | S, F | ❌ solo entrada y salida | B2 |
| K2 | **Causal al fichar**: smart working, trasferta, servizio esterno, salida por permiso | Z | ❌ | B2 |
| K3 | Fichar desde el navegador (personal de oficina, smart working) | Z (terminal virtual), J, F | ❌ | B2 |
| K4 | Recordatorio de "no has fichado" y aviso al responsable cuando alguien ficha fuera de la sede | F, J | ❌ faltan los eventos de recordatorio/aviso fuera de sede; canal push implementado (N1) | B2 |
| K5 | NFC: acercar el móvil a una etiqueta | Z (People Smart), TS, S | ❌ | B3. Con etiquetas NTAG 424 DNA, que dan un código distinto en cada lectura, como nuestro QR. Una etiqueta normal se copia. |
| K6 | Baliza Bluetooth en la pared | Z (ZBeacon) | ❌ | B3, dentro del terminal propio (ESP32) |
| K7 | Terminal físico con badge | Z, J | 🟡 terminal ESP32 en diseño | B3 |
| K8 | Fichar por actividad o commessa (horas por proyecto u orden de trabajo) | Z (ZTimesheet), F, J | ❌ | B3 |
| — | Biometría (huella, cara) | S | ❌ a propósito | **Fuera**. El Garante la limita mucho, y no tenerla es uno de nuestros argumentos de venta. |

## 2. Cartellino, anomalías y cierre de mes

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| K9 | **Cartellino del mes** para el trabajador: sus fichajes y sus horas, en la app y en PDF | Z, TS | ❌ solo ve hoy (F4) | B2 |
| K10 | **Totalizadores**: horas trabajadas, extra y saldo del mes actual y del anterior; los propios y los del equipo | Z | ❌ | B2 |
| K11 | **Horario de trabajo** de cada empleado (horas teóricas y tolerancia de retraso) | Z, J | ❌ (F5) | B2. Sube desde el bloque 3: sin horarios no se pueden detectar anomalías ni calcular horas extra. |
| K12 | **Anomalías justificables**: el trabajador toca la anomalía y elige el justificativo, con atajos de un toque | Z (ZTimeline), J, TS | 🟡 marcas sin flujo (F3) | B2 |
| K13 | Una ausencia aprobada justifica sola ese día | J, TS | ❌ | B2 |
| K14 | **Cierre mensual** del responsable, que bloquea el mes revisado | Z (HR Workflow) | ❌ | B2 |
| K15 | **Exportación al programa de nóminas del consulente**, con una tabla de códigos de justificativo por empresa. Formatos: Zucchetti Paghe ("Importa Movimenti Paga"), TeamSystem, Inaz y Essepaghe (TRRIPW). | F, J, Fluida (grupo Zucchetti) | 🟡 CSV genérico | **B2, lo primero**: tiene que estar antes del primer cierre de mes del piloto. Hay que pedirle el formato al consulente de la empresa piloto. |
| K16 | Acceso del **consulente del lavoro**: solo lectura y varias empresas | J, TS | ❌ (el modelo de datos ya lo admite) | B2 |

## 3. Horarios, turnos y horas extra

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| K17 | **Solicitud y autorización de horas extra**. Hoy STRAORD está mal planteado como un tipo de ausencia. | Z, J | 🟡 (V7) | B2 |
| K18 | **Banca ore**: saldo de horas y compensaciones | Z | ❌ | B2 |
| K19 | **Planificación de turnos**: cobertura, conflictos y propuesta automática | Z (ZScheduling), F (con IA), TS | ❌ (F5) | B3 |
| K20 | El trabajador pide un cambio de turno y lo aprueba el coordinador | Z | ❌ | B3 |
| K21 | Reperibilità (guardias) | Habitual en presencias (no verificado) | ❌ | B3 |
| K22 | Lavoro intermittente | J | ❌ | B3 |

## 4. Vacaciones, permisos y bajas

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | Tipos italianos: ferie, ROL, ex festività, 104, malattia | F, J | ✅ | — |
| K23 | El resto de los permisos de ley: congedo parentale, matrimonio, lutto, donazione sangue, allattamento, permessi studio, sindacali, elettorali e infortunio | J | ❌ | B2, junto con V7 |
| — | Saldos con **maturazione** mensual y residuo del año anterior | Z, F, J | Parcial: carga manual y desglose en app ✅; cálculo mensual automático pendiente. Estado y pruebas en V1 de la auditoría funcional. | B2 |
| — | Calendario de ausencias del equipo y de la empresa | Z, F, J | ❌ (V5) | B2 |
| — | Solicitudes por horas o medias jornadas, con selector de fechas | Z, F | 🟡 (V6) | B2 |
| — | Aprobación por el responsable de su equipo | Z, F, J | 🟡 la BD lo permite, faltan las pantallas (R1) | B2 |
| K24 | Aprobar varias solicitudes a la vez | Z | ❌ | B2 |
| — | Nota al aprobar o rechazar | Z | ❌ (V3) | B2 |
| K25 | Solicitud de **smart working** y registro de días en la oficina | J | ❌ | B2 |
| — | El trabajador anula su propia solicitud | Z | ✅ | — |
| K26 | Delegar las aprobaciones temporalmente (por ejemplo, durante las vacaciones del responsable) | Z | ❌ | B3 |
| K27 | Aprobación en varios niveles y reglas, como periodos bloqueados | F | ❌ | B3 |
| K28 | Guardar solicitudes como borrador sin conexión | Z | ❌ | B3 |

## 5. Documentos y firma

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | Nóminas y CU a cada trabajador | todos | ✅ cifradas de extremo a extremo | — |
| K29 | **Comunicaciones y circulares con presa visione** (confirmación de lectura), o con consentimiento o conformidad | Z (Workspace de ZConnect) | ❌ | B2 |
| K30 | **Reglamentos, informativa de privacidad y código disciplinario** publicados con confirmación de lectura | Z | ❌ | B2. También nos sirve para entregar nuestra propia informativa (art. 13 RGPD) con prueba de entrega. |
| K31 | **Firma electrónica** de documentos: contratos, adendas, políticas | F (eIDAS), P (FEA con Signaturit), J | ❌ | B2 como firma simple con la clave del móvil. FEA solo con dictamen legal. |
| — | Expediente de cada empleado con su historial | F, TS | 🟡 (D4) | B2 |
| — | Enviar un documento suelto a quien elijas | F | ❌ (D2) | B2 |
| K32 | El trabajador sube documentos: certificados y justificantes adjuntos a una solicitud | Z | ❌ | B2. Cifrados para HR, lo que exige una clave de empresa que hoy no existe. |

## 6. Comunicación

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| K33 | **Tablón** de noticias y avisos de la empresa | Z, F, TS, S | ❌ | B2, junto con K29 |
| — | Notificaciones push y por email | todos | ✅ HECHO: email y push genérico opcional (`push.test.ts` en DB y móvil); activación y prueba real pendientes, ver `deploy/README.md` | B2 |
| K34 | **Peticiones a la oficina de personal** con su estado: certificado de servicios, cambio de IBAN, anticipo del TFR… | Z (ventanilla virtual y tickets), J (chat), S (chat con RR. HH.) | ❌ | B2 como formulario; el chat, en B3 |
| K35 | **Whistleblowing**: canal de denuncias del D.Lgs. 24/2023, obligatorio a partir de 50 trabajadores | F, P, TS | ❌ | B3, de mucho valor: el cifrado de extremo a extremo encaja perfecto |
| K36 | Encuestas anónimas y eNPS | S | ❌ | B3 |
| — | Cuestionario de salud antes de entrar (Health Check) | Z | ❌ | **Fuera**: son datos de salud (art. 9 RGPD) y venía de la época del COVID |
| — | Cumpleaños y nuevas incorporaciones | F | ❌ | **Fuera** por defecto, por privacidad |

## 7. Personas y empresa

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | Mansión, categoría, livello, contrato y horas | todos | ❌ (E4) | B2 |
| — | Roles y responsables | todos | 🟡 (E5) | B2 |
| K37 | **Vencimientos (scadenzario)**: fin de un contrato temporal, fin del periodo de prueba, visita médica y cursos de seguridad (D.Lgs. 81/2008). Además, **caducidad del permiso de residencia**, que es idea nuestra. | J | ❌ | B2. Muchos operai son extranjeros, y por eso ofrecemos 9 idiomas. |
| K38 | El trabajador pide **corregir sus datos**: dirección, IBAN, familiares a cargo | Z, J | 🟡 solo como solicitud RGPD | B2 |
| K39 | **Entrega de EPI** con firma de recibido, como prueba de la entrega que exige el art. 77 D.Lgs. 81/2008 (idea nuestra) | — | ❌ | B3. Muy útil en fábrica. |
| K40 | Organigrama, con varios responsables por persona | F | ❌ | B3 |
| K41 | Permisos detallados por grupo | F | ❌ | B3 |
| K42 | Altas y bajas con lista de tareas | F, P | ❌ | B3. La baja segura ya entra en B1 (E1 y E2). |
| — | Varias sedes y varias empresas | Z, TS | ✅ | — |
| K43 | Equipos de la empresa asignados a cada persona (portátil, móvil) | J, F | ❌ | B3, junto con K39 |

## 8. Nóminas, gastos y beneficios

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | **Calcular las nóminas** | Z, TS, I, J | ❌ | **Fuera**. Es otro producto y el consulente ya lo hace. Nosotros le pasamos los datos (K15). |
| K44 | Resumen de las variaciones del mes para el consulente | F | ❌ | B2, junto con K15 |
| K45 | **Buoni pasto**: días que dan derecho y exportación | J, Z | ❌ | B2, solo el cálculo, no la emisión |
| K46 | **Notas de gastos y trasferte**: foto del ticket, sin conexión, con aprobación | Z, TS, F, J | ❌ | B3 |
| K47 | **Lectura de la nómina** en la app: cada voce y lo que cambia frente al mes anterior | J (con IA) | ❌ | B3. Se haría en el propio móvil, para que la nómina no salga del cifrado. |
| — | Pago de sueldos y F24, tarjetas, welfare y fringe benefits | J, F | ❌ | **Fuera** |

## 9. Talento

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | Selección (ATS), evaluación del desempeño, OKR y formación | Z, F, TS, P | ❌ | **Fuera** de momento. La formación obligatoria entra en los vencimientos (K37). |

## 10. Informes y plataforma

| # | Función | Quién | Fide | Decisión |
| --- | --- | --- | --- | --- |
| — | Registro de auditoría | Z | ✅ | — |
| — | Idiomas | Z (multilingüe) | ✅ 9, árabe incluido | — |
| K48 | Panel de absentismo, horas extra y costes | Z (HR Analytics), F, J | 🟡 solo la presencia de hoy | B3 |
| K49 | API e integraciones | F, J | ❌ | B3 |
| K50 | Vídeo o guía dentro de la app | Z | ❌ | B3 |
| — | Comedor, control de accesos y tornos | Z | ❌ | **Fuera** |
| — | Gestión de dispositivos (MDM), inventario de TI y de licencias SaaS | F | ❌ | **Fuera** |

---

## Donde Fide ya va por delante

1. **Nóminas cifradas de extremo a extremo.** Ni nosotros ni el servidor podemos leerlas. Zucchetti anuncia documentos "incluso criptografiados", pero no dice que lo sean de extremo a extremo.
2. **Fichajes firmados** con recibo del servidor: si alguien los altera después, se nota. El QR caduca a los 30 segundos y solo vale una vez, así que una foto no sirve.
3. **Ubicación sin coordenadas.** Solo guardamos "dentro" o "fuera". ZTimesheet envía la posición al servidor, y Factorial anuncia que la empresa conoce el lugar de cada entrada y salida.
4. **Sin recopilar datos biométricos ni exigir biometría**; se mantiene la confirmación local del sistema con alternativa de PIN. [Decisión y alcance](../adr/0005-local-authentication.md).
5. **9 idiomas** para plantillas extranjeras: árabe, albanés, ucraniano, rumano, chino, entre otros.
6. **Sin licencias por módulo ni por trabajador habilitado.** En Zucchetti, cada app exige el HR Portal y su propia licencia.

## Lo que los usuarios critican de ZConnect

Datos de nuestra tesis para inversores (archivo privado, fuentes consultadas el 4 de octubre de 2026, sin volver a
verificar). Cada punto es una oportunidad que no cuesta funciones nuevas, solo hacer bien lo que ya tenemos.

| Crítica | Respuesta de Fide | Estado |
| --- | --- | --- |
| 3,1★ en Google Play y 2,3★ en App Store Italia | App sencilla, en 9 idiomas | — |
| Acceso complicado: URL del servidor, código de entorno, matrícula y contraseña | Invitación por enlace y código por email, sin contraseña | ✅ (passkeys en producción: C2) |
| Hay que abrir la app para ver las circulares nuevas | Avisos push y por email | Canal ✅ HECHO (N1, `push.test.ts`); circulares pendientes (K33) |
| Google Play declara datos «no cifrados» y que no se pueden eliminar | Cifrado de extremo a extremo y derechos RGPD desde la app | ✅ (la bandeja de HR falta: G1) |
| Fichaje «sospechoso» sin GPS o con mala conexión | Fichaje firmado sin conexión y QR del kiosco | ✅ |
| Cierres al arrancar, PDF que no se guardan, desincronía entre app y web | Pruebas en dispositivo real antes del piloto | Pendiente (C4) |

## Recomendación

No quedarnos atrás en nada es el objetivo correcto para **todo lo que una fábrica usa a diario**: fichar, cartellino,
justificar anomalías, vacaciones y permisos, horas extra, documentos, comunicaciones y pasar los datos al consulente. En
eso hay que igualarles punto por punto y ganarles en privacidad, y es todo el bloque 2.

No lo es para lo que en Zucchetti también son productos aparte: nóminas, selección, evaluación, MDM o comedor. Copiarlos
retrasaría meses el piloto. Además, la empresa piloto ya tiene consulente y programa de nóminas; lo que necesita es que
Fide les dé los datos ya preparados (K15).

## Plan actualizado

**Bloque 1 · Piloto.** Sin cambios respecto a la auditoría:
- E1, E2 y E3;
- F1 y V2;
- D1, G1 y C4.

**Bloque 2 · Igualar a la competencia en el uso diario**, en este orden:
1. **Datos para el consulente:** K15 y K44, antes del primer cierre de mes del piloto.
2. **Presencias:**
   - K11 horarios;
   - K1 pausas;
   - K2 causales;
   - K12 y K13 anomalías;
   - K9 y K10 cartellino y totalizadores;
   - K14 cierre mensual;
   - K17 y K18 horas extra y banca ore;
   - K45 buoni pasto;
   - K3 fichar desde el navegador.
3. **Ausencias:**
   - V1 saldos;
   - K23 resto de permisos de ley;
   - V5 calendario;
   - V6 horas y medias jornadas;
   - R1 herramienta del responsable;
   - K24 aprobación múltiple;
   - V3 nota de la decisión;
   - K25 smart working.
4. **Personas:**
   - E4 mansioni y contrato;
   - E5 roles y capo turno;
   - K16 acceso del consulente;
   - K37 vencimientos;
   - K38 corrección de datos.
5. **Comunicación y documentos:**
   - N1 y K4 avisos;
   - K33, K29 y K30 tablón y presa visione;
   - K31 firma;
   - D2 a D5 documentos;
   - K32 subida de documentos;
   - K34 peticiones a personal.

**Bloque 3 · Completar el catálogo:**
- K19 a K22 turnos;
- K5 a K7 NFC, baliza y terminal;
- K8 commesse;
- K26 a K28 aprobaciones avanzadas;
- K35 whistleblowing;
- K36 encuestas;
- K39 y K43 EPI y equipos;
- K40 a K42 organigrama, permisos y altas y bajas;
- K46 gastos y trasferte;
- K47 lectura de la nómina;
- K48 a K50 panel, API y guía;
- de la auditoría: F6, F7, N2 y G2.

## Lo que necesitamos de la empresa piloto

- Qué programa de nóminas usa su consulente (Zucchetti, TeamSystem, Inaz, Essepaghe u otro) y su formato de importación
  de presencias, con los códigos de justificativo.
- Horario de cada grupo (turnos o jornada fija) y cómo gestionan hoy las pausas, las horas extra y los buoni pasto.
- Si la empresa tiene 50 trabajadores o más (whistleblowing obligatorio) y si reparte EPI.

---

## Fuentes

- Zucchetti: [guía de ZConnect (Fondo Est)](https://www.fondoest.it/public/uploads/files/APP_ZConnect_e_Questionario_Health_Check.pdf), [ZTimeline en App Store](https://apps.apple.com/it/app/ztimeline-enterprise-edition/id1400759144), [ZTimesheet en App Store](https://apps.apple.com/it/app/ztimesheet-enterprise-edition/id1204525465), [People Smart en App Store](https://apps.apple.com/app/id1491899612), [folleto ZBeacon](https://zucchetti.it/it/dms/zucchetti-it/aziende/hr/hardware-presenze/zbeacon/brochure/Presenze_ZBeacon_ITA.pdf), [catálogo HR Infinity](https://www.zucchetti.es/wp-content/uploads/brochure/Catalogo_HR_INFINITY.pdf), [kiosco de comedor](https://zucchetti.it/it/dms/zucchetti-it/aziende/hr/time/mensa-ristorazione-aziendale/brochure/Scheda_Chiosco.pdf), [HR Infinity Portal (Grant Thornton)](https://www.bgt-grantthornton.it/en/services/hr--payroll/hr-infinity-portal/), [Infinity Global HR en Capterra](https://www.capterra.it/software/160206/infinity-global-hr), [informativa privacy de las apps](https://www.zucchetti.it/app/ztimesheet/privacy_ztimesheet.pdf).
- TeamSystem: [app TeamSystem HR](https://www.teamsystem.com/hr/app-mobile-teamsystem-hr/), [rilevazione presenze](https://www.teamsystem.com/magazine/risorse-umane/rilevazione-presenze-azienda/).
- Factorial: [funcionalidades](https://factorial.it/funzionalita), [ferie e permessi](https://factorial.it/software-gestione-ferie-e-permessi), [timbrature](https://factorial.it/blog/timbrature-dipendenti/), [recordatorios de fichaje](https://factorial.helpjuice.com/en_US/set-up-clock-in-and-clock-out-reminders-on-the-mobile-app), [integración con Zucchetti](https://help.factorialhr.com/zucchetti-integration).
- Jet HR: [web](https://jethr.com/), [rilevazione presenze](https://jethr.com/new-funzionalita/rilevazione-presenze), [ferie e permessi](https://jethr.com/new-funzionalita/gestione-ferie-e-permessi), [lectura del cedolino con IA](https://www.aziendabanca.it/notizie/fintech-insurtech/jet-hr-lettura-busta-paga), [reseñas en Capterra](https://www.capterra.com/p/3669/JetHR/reviews/).
- Inaz: [HR Inaz en Capterra](https://www.capterra.it/software/208651/hr-inaz).
- Personio: [firma con Signaturit (Namirial)](https://www.namirial.com/it/partners/marketplace/personio/).
- Sesame: [pausas](https://help.sesamehr.com/en/how-do-i-set-up-breaks), [fichaje](https://help.sesamehr.com/en/how-can-employees-clock-in/out), [encuestas](https://help.sesamehr.com/en/what-are-surveys).
- Exportación a nóminas: [Fluida y Zucchetti Paghe](https://www.fluida.io/en/connect/zucchetti-payroll).
- Normativa: [whistleblowing (Agenda Digitale)](https://www.agendadigitale.eu/people-and-change/whistleblowing-software-segnalare-in-azienda-illeciti-in-maniera-sicura/), [publicación del código disciplinario (Altalex)](https://www.altalex.com/documents/news/2008/01/21/sanzioni-disciplinari-affissione-del-codice-disciplinare-luogo-accessibile).
