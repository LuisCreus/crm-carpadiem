import { describe, expect, it } from "vitest";
import { leerMaterial, piezasParaMontar, textoCantidades } from "../material";

describe("material a grosso modo", () => {
  it("lee los textos reales de los presupuestos", () => {
    expect(leerMaterial("2 carpas beduinas 12x15")).toEqual({ beduinas: 2, modulares: 0, tarima_m2: 0, sombrillas: 0 });
    expect(leerMaterial("1 carpa 12x15 + Tarima 180 m2 + 3 Carpas modulares")).toEqual({ beduinas: 1, modulares: 3, tarima_m2: 180, sombrillas: 0 });
    expect(leerMaterial("2 carpas beduinas 12x15 y una carpa beduina 9x12")).toMatchObject({ beduinas: 3 });
    expect(leerMaterial("2 carpas beduinas + guirnaldas")).toMatchObject({ beduinas: 2 });
    expect(leerMaterial("1 carpa modular")).toMatchObject({ modulares: 1, beduinas: 0 });
    expect(leerMaterial("1 carpa modular 6x6")).toMatchObject({ modulares: 1 });
    expect(leerMaterial("Tarima 8x8")).toMatchObject({ tarima_m2: 64 });
    expect(leerMaterial("4 sombrillas")).toMatchObject({ sombrillas: 4 });
    expect(leerMaterial("Dos carpas beduinas, tarima de 72 m²")).toEqual({ beduinas: 2, modulares: 0, tarima_m2: 72, sombrillas: 0 });
    expect(leerMaterial("2 carpas beduinas 12x15 y 12x9")).toMatchObject({ beduinas: 2 });
    expect(leerMaterial("2 carpas beduinas 15x12 , dos carpas modulares 6x6, solución de carpa con tela en truss")).toMatchObject({ beduinas: 2, modulares: 2 });
    expect(leerMaterial("Carpa dos aguas 12x10 Moñita")).toMatchObject({ beduinas: 1 });
    expect(leerMaterial("")).toEqual({ beduinas: 0, modulares: 0, tarima_m2: 0, sombrillas: 0 });
  });

  it("texto corto", () => {
    expect(textoCantidades({ beduinas: 2, modulares: 1, tarima_m2: 72, sombrillas: 0 })).toBe("2 beduinas · 1 modular · 72 m² de tarima");
  });

  it("piezas para montar: por unidad, hacia arriba y avisando si faltan", () => {
    const kit = [
      { recurso: "beduinas" as const, inventarioId: "p", material: "Postes de madera 3 metros", porUnidad: 23 / 3, stock: 23, grupo: "Carpas beduinas" },
      { recurso: "tarima_m2" as const, inventarioId: "t", material: "Plancha 2x1", porUnidad: 0.5, stock: 36, grupo: "Tarima" },
    ];
    expect(piezasParaMontar({ beduinas: 2, modulares: 0, tarima_m2: 80, sombrillas: 0 }, kit)).toEqual([
      { material: "Postes de madera 3 metros", grupo: "Carpas beduinas", cantidad: 16, falta: 0 },
      { material: "Plancha 2x1", grupo: "Tarima", cantidad: 40, falta: 4 },
    ]);
    expect(piezasParaMontar({ beduinas: 3, modulares: 0, tarima_m2: 0, sombrillas: 0 }, kit)[0].cantidad).toBe(23);
  });
});
