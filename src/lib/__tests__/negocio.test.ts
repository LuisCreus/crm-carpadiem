import { describe, expect, it } from "vitest";
import {
  avisarSeguro, diaSemana, estadoPago, fechaLimiteSeguro, importeReserva, limpiarNombre,
  nombreArchivoPresupuesto, nombreHojaMontaje, rutaCarpetaCliente, textoFechaEvento,
} from "../negocio";

describe("nombres de carpetas", () => {
  it("fecha exacta (ejemplo real)", () => {
    expect(rutaCarpetaCliente("dia", "2027-05-08", "Carlota Durán"))
      .toBe("CARPA DIEM/01. CLIENTES/2027/05. MAYO/08-05 CARLOTA DURÁN");
  });

  it("solo mes y año: XX-MM dentro del mes previsto", () => {
    expect(rutaCarpetaCliente("mes", "2027-06-01", "Elena Guinea"))
      .toBe("CARPA DIEM/01. CLIENTES/2027/06. JUNIO/XX-06 ELENA GUINEA");
  });

  it("sin fecha: carpeta POR DEFINIR", () => {
    expect(rutaCarpetaCliente("por_definir", null, "Familia Ortega"))
      .toBe("CARPA DIEM/01. CLIENTES/POR DEFINIR/FAMILIA ORTEGA");
  });

  it("meses con tilde y de dos dígitos", () => {
    expect(rutaCarpetaCliente("dia", "2026-12-05", "x")).toContain("/2026/12. DICIEMBRE/05-12 X");
  });

  it("quita caracteres que SharePoint no admite", () => {
    expect(limpiarNombre('  Boda  "Oriol / Barberá"?  ')).toBe("Boda Oriol Barberá");
    expect(rutaCarpetaCliente("dia", "2026-06-13", "Oriol / Barberá")).toMatch(/13-06 ORIOL BARBERÁ$/);
  });
});

describe("nombres de archivos", () => {
  it("presupuesto con número de 3 dígitos y versión de 2", () => {
    expect(nombreArchivoPresupuesto(78, "Carlota Durán", 1, "pdf")).toBe("PRESUPUESTO CD 078 CARLOTA DURÁN V01.pdf");
    expect(nombreArchivoPresupuesto(78, "Carlota Durán", 2, "docx")).toBe("PRESUPUESTO CD 078 CARLOTA DURÁN V02.docx");
    expect(nombreArchivoPresupuesto(13, "ana", 10, "pdf")).toBe("PRESUPUESTO CD 013 ANA V10.pdf");
  });

  it("hoja de montaje", () => {
    expect(nombreHojaMontaje(78, "Carlota Durán")).toBe("HOJA DE MONTAJE CD 078 CARLOTA DURÁN.pdf");
  });
});

describe("seguro de lluvia", () => {
  it("fecha límite = evento − 10 días", () => {
    expect(fechaLimiteSeguro("2027-05-08")).toBe("2027-04-28");
    expect(fechaLimiteSeguro("2026-03-05")).toBe("2026-02-23");
    expect(fechaLimiteSeguro("2028-03-05")).toBe("2028-02-24"); // año bisiesto
  });

  it("avisa desde 3 días antes del límite hasta el límite", () => {
    expect(avisarSeguro("2027-05-08", "2027-04-24")).toBe(false);
    expect(avisarSeguro("2027-05-08", "2027-04-25")).toBe(true);
    expect(avisarSeguro("2027-05-08", "2027-04-28")).toBe(true);
    expect(avisarSeguro("2027-05-08", "2027-04-29")).toBe(false);
  });

  it("los días son configurables", () => {
    expect(fechaLimiteSeguro("2027-05-08", 7)).toBe("2027-05-01");
  });
});

describe("estados de pago", () => {
  it("importe de la reserva", () => {
    expect(importeReserva(13246, 30)).toBe(3973.8);
    expect(importeReserva(null, 30)).toBeNull();
  });

  it("Aceptado / Reserva pagada / Pagado 100 %", () => {
    expect(estadoPago(13246, 30, 0)).toBe("aceptado");
    expect(estadoPago(13246, 30, 3973.79)).toBe("aceptado");
    expect(estadoPago(13246, 30, 3973.8)).toBe("reserva_pagada");
    expect(estadoPago(13246, 30, 13245.99)).toBe("reserva_pagada");
    expect(estadoPago(13246, 30, 13246)).toBe("pagado");
    expect(estadoPago(13246, 30, 14000)).toBe("pagado");
  });

  it("sin % de reserva, cualquier cobro cuenta como reserva", () => {
    expect(estadoPago(1000, null, 1)).toBe("reserva_pagada");
  });
});

describe("textos de fecha", () => {
  it("exacta, rango, solo mes y por definir", () => {
    expect(textoFechaEvento("dia", "2027-05-08")).toBe("08/05/2027");
    expect(textoFechaEvento("dia", "2027-05-08", "2027-05-09")).toBe("08/05/2027 – 09/05/2027");
    expect(textoFechaEvento("mes", "2027-06-01")).toBe("junio de 2027");
    expect(textoFechaEvento("por_definir", null)).toBe("Por definir");
  });

  it("día de la semana", () => {
    expect(diaSemana("2027-05-08")).toBe("sábado");
  });
});
