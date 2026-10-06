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

Ejecutar el script **en local**; los PDFs nunca salen del ordenador:

```bash
cd app && npm install
node packages/payroll-parser/scripts/spike-extract.mjs ruta/a/cedolini.pdf --employer <P.IVA o CF de la empresa>
```

El script lista, por página, los CF con carácter de control válido, enmascarados para poder pegar el resultado en este ADR sin datos personales. También indica si el CF solo aparece al unir trozos de texto y si una página no tiene capa de texto (escaneada). Con `--text` muestra además el principio del texto de cada página.

`splitPayroll()` de `@fide/payroll-parser` ya cubre los CF partidos, las páginas de continuación, el CF del empleador (incluidas las ditte individuali) y las páginas ambiguas. El test `pdf-pipeline.test.ts` lo prueba de punta a punta con un PDF sintético.

## Criterio go/no-go

- **Go:** el 100 % de las páginas principales se asignan a un único CF válido, y las de continuación se detectan.
- **No-go:** asignación manual asistida en el portal (HR elige el empleado por página) y se pide al consulente un PDF por empleado o un CSV de mapeo.

## Resultado

_(pendiente)_
