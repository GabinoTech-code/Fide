# ADR 0004 — Spike S3: extracción del codice fiscale de nóminas PDF

- **Estado:** Pendiente. Requiere 3 PDFs de nómina anonimizados (Zucchetti y/o TeamSystem) de la empresa piloto o de su consulente del lavoro.

## Pregunta

¿Se puede extraer de forma fiable el codice fiscale de cada página con pdf.js, en el navegador de HR, sin enviar el PDF a ningún servidor?

Hay que comprobar:
- si el CF sale en un solo item de texto o partido en varios;
- si las páginas de continuación (2.ª página del mismo empleado) traen o no el CF;
- si aparece también el CF o la P.IVA del empleador, que hay que excluir;
- si hay PDFs escaneados sin capa de texto, que quedan fuera del MVP.

## Procedimiento

Usar el script `app/packages/payroll-parser/scripts/spike-extract.mjs`, que llega en la Fase 2 junto con el validador de CF de `@fide/shared/italy`. Se ejecuta **en local**, y los PDFs nunca salen del ordenador:

```bash
node app/packages/payroll-parser/scripts/spike-extract.mjs ruta/a/cedolini.pdf
```

El script lista, por página, los candidatos a CF con un carácter de control válido.

## Criterio go/no-go

- **Go:** el 100 % de las páginas principales se asignan a un único CF válido, y las de continuación se detectan.
- **No-go:** asignación manual asistida en el portal (HR elige el empleado por página) y se pide al consulente un PDF por empleado o un CSV de mapeo.

## Resultado

_(pendiente)_
