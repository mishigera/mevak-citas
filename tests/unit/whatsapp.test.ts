/**
 * El recordatorio por WhatsApp. No hay backend de notificaciones: se abre WhatsApp con
 * el texto escrito. Lo delicado es el teléfono, que se teclea a mano en la ficha.
 */
import { aNumeroWhatsApp, enlaceRecordatorio, textoRecordatorio } from "@/lib/whatsapp";

describe("aNumeroWhatsApp", () => {
  it.each([
    ["555-111-2222", "525551112222"],
    ["(55) 5111 2222", "525551112222"],
    ["5551112222", "525551112222"],
    ["55 5111 2222", "525551112222"],
  ])("limpia %s y le pone la lada", (entrada, esperado) => {
    expect(aNumeroWhatsApp(entrada)).toBe(esperado);
  });

  it("respeta el país si ya viene", () => {
    expect(aNumeroWhatsApp("+52 55 5111 2222")).toBe("525551112222");
  });

  it("no duplica la lada de un número que ya la trae", () => {
    expect(aNumeroWhatsApp("525551112222")).toBe("525551112222");
  });

  it.each([["", null], ["   ", null], ["123", null], ["55-11", null]])(
    "descarta %s",
    (entrada, esperado) => {
      expect(aNumeroWhatsApp(entrada)).toBe(esperado);
    },
  );
});

describe("textoRecordatorio", () => {
  it("saluda por el nombre de pila", () => {
    const texto = textoRecordatorio({ nombre: "María Fernanda López", fecha: "viernes 18 de septiembre", hora: "10:00" });

    expect(texto).toContain("Hola María");
    expect(texto).toContain("viernes 18 de septiembre");
    expect(texto).toContain("10:00");
  });

  it("sin nombre saluda igual, sin quedarse a medias", () => {
    expect(textoRecordatorio({ nombre: "  ", fecha: "hoy", hora: "10:00" })).toMatch(/^Hola, /);
  });
});

describe("enlaceRecordatorio", () => {
  it("compone una URL de wa.me con el texto codificado", () => {
    const enlace = enlaceRecordatorio({
      telefono: "555-111-2222", nombre: "Ana", fecha: "viernes 18", hora: "10:00",
    })!;

    expect(enlace.startsWith("https://wa.me/525551112222?text=")).toBe(true);
    expect(decodeURIComponent(enlace.split("text=")[1])).toContain("Hola Ana");
  });

  it("null si el teléfono no sirve, para poder avisar en vez de abrir una URL rota", () => {
    expect(enlaceRecordatorio({ telefono: "", fecha: "hoy", hora: "10:00" })).toBeNull();
  });
});
