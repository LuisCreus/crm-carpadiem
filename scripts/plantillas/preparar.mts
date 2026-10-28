// Prepara las plantillas del CRM a partir de las originales de Luis.
//
//   1. Descarga las dos plantillas originales (solo lectura: no se tocan).
//   2. Inserta los controles de contenido (cliente, fecha, ubicación, nº, % reserva).
//   3. Sube las copias a SP_PLANTILLAS (en pruebas: 00. CRM PRUEBAS/02. PLANTILLAS).
//   4. Guarda en <carpeta de salida> el PDF de antes y de después para compararlos.
//
// Uso:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/plantillas/preparar.mts <carpeta de salida> [--comprobar]
//
// Con --comprobar solo verifica que el CRM puede leer el sitio y las plantillas.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  TIPO_DOCX, asegurarCarpeta, descargar, descargarComoPdf, elementoPorRuta, rutaPlantilla, subir,
} from "../../src/lib/graph/sharepoint";
import { insertarControles, leerControles, leerImporte } from "../../src/lib/word/controles";

const ORIGINALES = {
  carpadiem: "CARPA DIEM/02. PLANTILLAS/01. PRESUPUESTOS/PRESU WORD _ CARPADIEM.docx",
  neutra: "CARPA DIEM/02. PLANTILLAS/01. PRESUPUESTOS/PRESU WORD NEUTRO _ CARPADIEM .docx",
} as const;

const [salida, opcion] = process.argv.slice(2);
if (!salida) {
  console.error("Falta la carpeta de salida");
  process.exit(1);
}
mkdirSync(salida, { recursive: true });

for (const [clave, ruta] of Object.entries(ORIGINALES) as [keyof typeof ORIGINALES, string][]) {
  const original = await elementoPorRuta(ruta);
  if (!original) {
    console.log(`✗ No encuentro ${ruta}`);
    continue;
  }
  console.log(`✓ Leída la plantilla original: ${ruta}`);
  if (opcion === "--comprobar") continue;

  const docx = await descargar(original.id);
  writeFileSync(join(salida, `ANTES ${clave}.pdf`), await descargarComoPdf(original.id));

  const { docx: preparada, etiquetas } = await insertarControles(docx);
  const faltan = ["cliente", "fecha", "ubicacion", "numero", "reserva"].filter((e) => !etiquetas.includes(e as never));
  console.log(`  Controles insertados: ${etiquetas.join(", ")}${faltan.length ? ` · FALTAN: ${faltan.join(", ")}` : ""}`);
  console.log("  Valores actuales:", await leerControles(preparada), await leerImporte(preparada));

  const destino = rutaPlantilla(clave);
  await asegurarCarpeta(destino.split("/").slice(0, -1).join("/"));
  if (await elementoPorRuta(destino)) {
    console.log(`  ! Ya existe ${destino}: no la sustituyo. Bórrala a mano si quieres regenerarla.`);
    continue;
  }
  const subida = await subir(destino, preparada, TIPO_DOCX);
  writeFileSync(join(salida, `DESPUES ${clave}.pdf`), await descargarComoPdf(subida.id));
  writeFileSync(join(salida, `PLANTILLA ${clave}.docx`), preparada);
  console.log(`✓ Subida la plantilla del CRM: ${destino}`);
}
