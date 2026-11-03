// Fichero de transferencias SEPA (norma ISO 20022, pain.001.001.03) para subir a Santander Empresas:
// varias facturas de proveedores en un solo fichero, que se firma una sola vez en el banco.

import { formatoIban, ibanValido } from "@/lib/leer-factura";

// Datos de Carpa Diem como ordenante (los mismos que salen en las facturas)
export const ORDENANTE = {
  nombre: "CARPADIEM IBERICA SL",
  cif: "B26815829",
  sufijo: "000", // sufijo del ordenante que asigna el banco; "000" si no se ha pedido otro
  iban: "ES3300495119172117161045",
  bic: "BSCHESMMXXX", // Banco Santander
};

export type Transferencia = { id: string; beneficiario: string; iban: string; importe: number; concepto: string };

// Los bancos solo aceptan letras sin tildes, números y unos pocos signos
export function textoSepa(texto: string, maximo: number): string {
  return texto
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[ñÑ]/g, (l) => (l === "ñ" ? "n" : "N"))
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo);
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const euros = (n: number) => n.toFixed(2);

// Qué falta para poder pagar una factura por fichero
export function problemaTransferencia(t: Pick<Transferencia, "iban" | "importe" | "beneficiario">): string | null {
  if (!t.beneficiario.trim()) return "Falta el proveedor";
  if (!t.iban.trim()) return "Falta el IBAN";
  if (!ibanValido(t.iban)) return "El IBAN no es correcto";
  if (!(t.importe > 0)) return "El importe tiene que ser mayor que 0";
  return null;
}

export function ficheroSepa({ transferencias, fechaEjecucion, creado }: {
  transferencias: Transferencia[];
  fechaEjecucion: string; // aaaa-mm-dd
  creado: Date;
}): string {
  const malas = transferencias.filter((t) => problemaTransferencia(t));
  if (malas.length) throw new Error(`Hay ${malas.length} transferencias con datos incompletos`);
  if (!transferencias.length) throw new Error("No hay transferencias");

  const id = `CD${creado.toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const suma = euros(transferencias.reduce((s, t) => s + Math.round(t.importe * 100), 0) / 100);
  const n = transferencias.length;
  const ordenante = escapar(textoSepa(ORDENANTE.nombre, 70));

  const lineas = transferencias.map((t, i) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${id}-${i + 1}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${euros(t.importe)}</InstdAmt></Amt>
        <Cdtr><Nm>${escapar(textoSepa(t.beneficiario, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${formatoIban(t.iban).replace(/\s/g, "")}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${escapar(textoSepa(t.concepto || "Pago factura", 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${id}</MsgId>
      <CreDtTm>${creado.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${suma}</CtrlSum>
      <InitgPty>
        <Nm>${ordenante}</Nm>
        <Id><OrgId><Othr><Id>${ORDENANTE.cif}${ORDENANTE.sufijo}</Id></Othr></OrgId></Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${id}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${suma}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${fechaEjecucion}</ReqdExctnDt>
      <Dbtr><Nm>${ordenante}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${ORDENANTE.iban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>${ORDENANTE.bic}</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${lineas}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

export function nombreFicheroSepa(fecha: string, n: number): string {
  return `TRANSFERENCIAS CARPA DIEM ${fecha} (${n}).xml`;
}
