jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

/**
 * El tablero de inicio, por rol (plan p008).
 *
 * El reloj se fija el lunes 21 de septiembre de 2026 a las 10:35 con temporizadores
 * falsos que avanzan solos (`advanceTimers`): así "ahora" es siempre el mismo y
 * `waitFor` sigue funcionando. Las citas van en hora local sin zona, como las guarda la API.
 */
import React from "react";
import { Alert, Linking } from "react-native";
import { screen, fireEvent, waitFor, within } from "@testing-library/react-native";
import HomeScreen from "@/app/(tabs)/index";
import { claveDiaLocal } from "@/lib/fecha";
import type { Role } from "../../setup/auth-mock";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, pressIcon, setViewport, VIEWPORTS,
  __setAuthUser, __resetAuth, fixtures,
} from "../../setup/screen-harness";

const LUNES = "2026-09-21";
const MARTES = "2026-09-22";
const DOMINGO = "2026-09-20";
const SABADO = "2026-09-19";

const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday, open: weekday !== 0, opensAt: "09:00", closesAt: weekday === 6 ? "15:00" : "19:00",
}));

const STAFF = [
  { id: "u1", name: "Dueña", role: "OWNER" },
  { id: "u2", name: "Lucía", role: "FACIALIST" },
];

const citaEl = (dia: string, id: string, desde: string, hasta: string, cliente: string, over: Record<string, unknown> = {}) => ({
  ...fixtures.cita({ id, staffId: "u1", type: "LASER" }),
  dateTimeStart: `${dia}T${desde}:00`,
  dateTimeEnd: `${dia}T${hasta}:00`,
  client: fixtures.cliente({ id: `c-${id}`, fullName: cliente }),
  staff: { id: "u1", name: "Dueña" },
  services: [],
  ...over,
});

const cita = (id: string, desde: string, hasta: string, cliente: string, over: Record<string, unknown> = {}) =>
  citaEl(LUNES, id, desde, hasta, cliente, over);

const lucia = { staffId: "u2", type: "FACIAL", staff: { id: "u2", name: "Lucía" } };

/** A las 10:35: la de la dueña en curso, la de Lucía a las 11, y dos más. */
const AGENDA = [
  cita("laser", "10:00", "11:00", "Ana López", { services: [{ name: "Axila" }] }),
  cita("facial", "11:00", "12:00", "Sofía Ruiz", lucia),
  cita("espera", "12:30", "13:30", "Marta Gil", { ...lucia, status: "ARRIVED" }),
  cita("tarde", "17:00", "18:00", "Carla Díaz"),
];

const CAJA = {
  total: 4300, ownerNet: 3500, facialistNet: 800, count: 5,
  porMetodo: { CASH: 2800, CARD: 1500, INCLUDED: 0 },
  porConcepto: { CITA: 4300, PAQUETE: 0 },
  pendienteFacialista: 800,
};

function entrar(role: Role = "OWNER", id = "u1") {
  __setAuthUser({ id, name: "María Fernanda López", email: "a@m.test", role });
}

/** La misma ruta responde según el día que se pida. */
const porDia = (dias: Record<string, unknown[]>) =>
  (_: unknown, { search }: { search: string }) => dias[new URLSearchParams(search).get("date") ?? ""] ?? [];

/**
 * Las citas que se pasan como lista son las de hoy: el inicio también pide las de
 * mañana, y sin esto le llegarían las mismas.
 */
function api(rutas: Record<string, unknown> = {}) {
  const citas = rutas["/api/appointments"] ?? AGENDA;
  mockApi({
    "/api/appointments": Array.isArray(citas) ? porDia({ [claveDiaLocal(new Date())]: citas }) : citas,
    "/api/blocks": [],
    "/api/center-hours": HORARIO,
    "/api/users/staff": STAFF,
    "/api/clients": [],
    "/api/payments/pending-facialist": [],
    "/api/reports/income": CAJA,
    "/api/client-packages/idle": [],
    ...Object.fromEntries(Object.entries(rutas).filter(([ruta]) => ruta !== "/api/appointments")),
  });
}

async function abrir() {
  renderScreen(<HomeScreen />);
  await waitFor(() => expect(screen.queryByTestId("inicio")).toBeTruthy());
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(`${LUNES}T10:35:00`), advanceTimers: true });
  resetApi();
  __resetAuth();
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.useRealTimers();
});

describe("la cabecera", () => {
  it("saluda por el primer nombre y dice qué día es hoy", async () => {
    entrar();
    api();
    await abrir();

    expect(screen.getByText("Hola, María")).toBeTruthy();
    expect(screen.getByText(/^Hoy, lunes/)).toBeTruthy();
  });

  it("el + crea una cita nueva", async () => {
    entrar();
    api();
    await abrir();

    pressIcon("add");

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/new");
  });

  it("pide las citas de hoy, no las de otro día", async () => {
    entrar();
    api();
    await abrir();

    await waitFor(() => {
      const citas = apiCalls().find((c) => c.path === "/api/appointments");
      expect(citas?.search).toBe(`?date=${LUNES}`);
    });
  });
});

describe("ahora y siguiente", () => {
  it("la cita en curso con lo que le falta, y la siguiente con lo que falta para ella", async () => {
    entrar();
    api();
    await abrir();

    await waitFor(() => expect(screen.getByText("Ana López")).toBeTruthy());
    const enCurso = within(screen.getByTestId("inicio-cita-laser"));
    expect(enCurso.getByText("Termina en 25 min")).toBeTruthy();
    expect(enCurso.getByText("10:00 – 11:00")).toBeTruthy();
    expect(enCurso.getByText(/Axila/)).toBeTruthy();

    const siguiente = within(screen.getByTestId("inicio-cita-facial"));
    expect(siguiente.getByText("Sofía Ruiz")).toBeTruthy();
    expect(siguiente.getByText("En 25 min")).toBeTruthy();
    // Recepción y la dueña ven todo el centro: hay que decir de quién es.
    expect(siguiente.getByText(/Lucía/)).toBeTruthy();
  });

  it("cuenta las que quedan y lleva a la agenda", async () => {
    entrar();
    api();
    await abrir();

    await waitFor(() => expect(screen.getByText(/Y 2 citas más hoy/)).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Ver la agenda de hoy"));

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/calendar");
  });

  it("\"Llegó\" marca la llegada sin salir del inicio", async () => {
    entrar("RECEPTION", "u-recepcion");
    api({ "PATCH /api/appointments/laser": { ok: true } });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Marcar que llegó Ana López")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Marcar que llegó Ana López"));

    await waitFor(() => {
      const patch = apiCalls().find((c) => c.method === "PATCH");
      expect(patch).toMatchObject({ path: "/api/appointments/laser", body: { status: "ARRIVED" } });
    });
  });

  it("si no se puede marcar la llegada, lo dice", async () => {
    entrar();
    api({ "PATCH /api/appointments/laser": { __status: 409, message: "La cita ya está cerrada" } });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Marcar que llegó Ana López")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Marcar que llegó Ana López"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("No se pudo marcar la llegada", "La cita ya está cerrada"),
    );
  });

  it("a la que ya llegó se la cobra desde su detalle", async () => {
    entrar();
    api({ "/api/appointments": [cita("laser", "10:00", "11:00", "Ana López", { status: "ARRIVED" })] });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Cobrar a Ana López")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Cobrar a Ana López"));

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/laser");
  });

  it("\"Ver cita\" abre el detalle", async () => {
    entrar();
    api();
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Ver la cita de Sofía Ruiz")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Ver la cita de Sofía Ruiz"));

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/facial");
  });

  it("sin citas hoy lo dice", async () => {
    entrar();
    api({ "/api/appointments": [] });
    await abrir();

    await waitFor(() => expect(screen.getByText("Hoy no hay citas.")).toBeTruthy());
  });

  it("si ya pasaron todas, dice que no quedan", async () => {
    entrar();
    api({ "/api/appointments": [cita("temprano", "09:00", "10:00", "Ana López", { status: "DONE" })] });
    await abrir();

    await waitFor(() => expect(screen.getByText("Ya no quedan citas hoy.")).toBeTruthy());
  });

  it("si el servidor falla, lo dice en vez de fingir que no hay citas", async () => {
    entrar();
    api({ "/api/appointments": { __status: 500, message: "Boom" } });
    await abrir();

    await waitFor(() => expect(screen.getByText(/No se pudieron cargar las citas de hoy/)).toBeTruthy());
    expect(screen.queryByText("Hoy no hay citas.")).toBeNull();
  });
});

describe("qué ve cada rol", () => {
  /**
   * Deuda §27: la recepcionista nunca es la profesional de una cita, y con el filtro
   * viejo su inicio salía siempre vacío. Ve todo el centro, pero nada de dinero.
   */
  it("RECEPTION ve las citas de las dos profesionales y ningún importe", async () => {
    entrar("RECEPTION", "u-recepcion");
    api();
    await abrir();

    await waitFor(() => expect(screen.getByText("Ana López")).toBeTruthy());
    expect(screen.getByText("Sofía Ruiz")).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByTestId("inicio-caja")).toBeNull();
    const rutas = apiCalls().map((c) => c.path);
    expect(rutas).not.toContain("/api/reports/income");
    expect(rutas).not.toContain("/api/payments/pending-facialist");
  });

  it("FACIALIST solo ve lo suyo: ni citas ni huecos de la dueña", async () => {
    entrar("FACIALIST", "u2");
    api();
    await abrir();

    await waitFor(() => expect(screen.getByText("Sofía Ruiz")).toBeTruthy());
    expect(screen.queryByText("Ana López")).toBeNull();
    expect(screen.queryByText("Carla Díaz")).toBeNull();
    // Sus huecos, sin nombre delante: solo hay una fila y es la suya.
    await waitFor(() => expect(screen.getByLabelText("Agendar con Lucía a las 12:00")).toBeTruthy());
    expect(screen.queryByLabelText(/Agendar con Dueña/)).toBeNull();
    expect(screen.queryByTestId("inicio-caja")).toBeNull();
  });

  it("OWNER ve lo cobrado hoy, en efectivo y en tarjeta, y va al corte", async () => {
    entrar();
    api();
    await abrir();

    await waitFor(() => expect(screen.getByText("$4,300")).toBeTruthy());
    expect(screen.getByText("Efectivo $2,800 · Tarjeta $1,500")).toBeTruthy();
    expect(apiCalls().find((c) => c.path === "/api/reports/income")?.search).toBe(`?date=${LUNES}`);

    fireEvent.press(screen.getByLabelText("Ver el corte de caja"));
    expect(mockRouter.push).toHaveBeenCalledWith("/admin/reports");
  });
});

describe("hoy", () => {
  it("cuenta las citas, las atendidas, las que faltan y las que no llegaron", async () => {
    entrar();
    api({
      "/api/appointments": [
        ...AGENDA,
        cita("cobrada", "09:00", "10:00", "Rosa Paz", { status: "DONE" }),
        cita("falto", "09:00", "09:30", "Eva Sol", { ...lucia, status: "NO_SHOW" }),
        cita("cancelada", "15:00", "16:00", "Lía Mar", { status: "CANCELLED" }),
      ],
    });
    await abrir();

    const resumen = await waitFor(() => within(screen.getByTestId("inicio-resumen")));
    expect(resumen.getByLabelText("Citas: 6")).toBeTruthy();
    expect(resumen.getByLabelText("Atendida: 1")).toBeTruthy();
    expect(resumen.getByLabelText("Por atender: 4")).toBeTruthy();
    expect(resumen.getByText("1 no llegó")).toBeTruthy();
  });
});

describe("por atender", () => {
  it("quién espera, con enlace a su cita; la que empieza pronto ya está en Siguiente", async () => {
    entrar();
    api();
    await abrir();

    const lista = await waitFor(() => within(screen.getByTestId("inicio-por-atender")));
    expect(lista.getByText("Marta Gil está esperando")).toBeTruthy();
    // La de las 11:00 es "próxima" en la campana; aquí sobraría.
    expect(lista.queryByText(/Cita en/)).toBeNull();

    fireEvent.press(lista.getByText("Marta Gil está esperando"));
    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/espera");
  });

  it("a la dueña le recuerda lo que falta por liquidar", async () => {
    entrar();
    api({
      "/api/payments/pending-facialist": [{
        id: "pay1", facialistNetAmount: 500, createdAt: `${LUNES}T09:00:00`,
        staff: { name: "Lucía" }, client: { fullName: "Rosa Paz" },
      }],
    });
    await abrir();

    await waitFor(() => expect(screen.getByText("Falta liquidar a Lucía")).toBeTruthy());
  });

  it("una lista larga enseña cinco y ofrece el resto", async () => {
    entrar();
    const esperando = Array.from({ length: 7 }, (_, i) =>
      cita(`e${i}`, `1${3 + (i % 5)}:00`, `1${3 + (i % 5)}:30`, `Clienta ${i}`, { status: "ARRIVED" }));
    api({ "/api/appointments": esperando });
    await abrir();

    const lista = await waitFor(() => within(screen.getByTestId("inicio-por-atender")));
    expect(lista.getAllByText(/está esperando/)).toHaveLength(5);

    fireEvent.press(screen.getByLabelText("Ver 2 más"));
    expect(lista.getAllByText(/está esperando/)).toHaveLength(7);
  });

  it("sin nada pendiente, la sección no sale", async () => {
    entrar();
    api({ "/api/appointments": [cita("laser", "10:00", "11:00", "Ana López")] });
    await abrir();

    await waitFor(() => expect(screen.getByText("Ana López")).toBeTruthy());
    expect(screen.queryByTestId("inicio-por-atender")).toBeNull();
  });
});

describe("huecos de hoy", () => {
  it("por profesional; tocar uno abre Nueva cita con todo puesto", async () => {
    entrar("RECEPTION", "u-recepcion");
    api();
    await abrir();

    const huecos = await waitFor(() => within(screen.getByTestId("inicio-huecos")));
    expect(huecos.getByText("Dueña")).toBeTruthy();
    expect(huecos.getByText("Lucía")).toBeTruthy();
    // Lucía: 11-12 y 12:30-13:30 ocupadas; de 12:00 a 12:30 justo llega a media hora.
    expect(huecos.getByText("12:00 – 12:30")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Agendar con Lucía a las 12:00"));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/appointment/new",
      params: { staffId: "u2", staffName: "Lucía", date: LUNES, hora: "12:00", type: "FACIAL" },
    });
  });

  it("un bloqueo del centro tapa los huecos de todas", async () => {
    entrar();
    api({
      "/api/appointments": [],
      "/api/blocks": [{ id: "b1", userId: null, startDateTime: `${LUNES}T10:00:00`, endDateTime: `${LUNES}T19:00:00` }],
    });
    await abrir();

    const huecos = await waitFor(() => within(screen.getByTestId("inicio-huecos")));
    expect(huecos.getAllByText("Sin huecos")).toHaveLength(2);
  });

  it("el día que el centro no abre, lo dice", async () => {
    jest.setSystemTime(new Date(`${DOMINGO}T11:00:00`));
    entrar();
    api({ "/api/appointments": [] });
    await abrir();

    await waitFor(() => expect(screen.getByText("Hoy el centro no abre.")).toBeTruthy());
  });
});

describe("cumpleaños", () => {
  const clientas = [
    fixtures.cliente({ id: "c9", fullName: "Paola Ríos", phone: "5559998888", birthDate: "1990-09-21" }),
    fixtures.cliente({ id: "c8", fullName: "Irene Luna", phone: "", birthDate: "1985-09-24" }),
    fixtures.cliente({ id: "c7", fullName: "Sin Fecha" }),
  ];

  it("los de esta semana, con la edad que cumplen", async () => {
    entrar();
    api({ "/api/clients": clientas });
    await abrir();

    const lista = await waitFor(() => within(screen.getByTestId("inicio-cumpleanos")));
    expect(lista.getByText("Hoy cumple 36")).toBeTruthy();
    expect(lista.getByText("El jueves cumple 41")).toBeTruthy();
    expect(lista.queryByText("Sin Fecha")).toBeNull();
  });

  it("felicita por WhatsApp con el mensaje ya escrito", async () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    entrar();
    api({ "/api/clients": clientas });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Felicitar a Paola Ríos por WhatsApp")).toBeTruthy());
    // Sin teléfono no se ofrece.
    expect(screen.queryByLabelText("Felicitar a Irene Luna por WhatsApp")).toBeNull();

    fireEvent.press(screen.getByLabelText("Felicitar a Paola Ríos por WhatsApp"));

    expect(openSpy).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/525559998888\?text=.*Feliz/));
    openSpy.mockRestore();
  });

  it("tocar a la clienta abre su ficha", async () => {
    entrar();
    api({ "/api/clients": clientas });
    await abrir();

    await waitFor(() => expect(screen.getByText("Paola Ríos")).toBeTruthy());
    fireEvent.press(screen.getByText("Paola Ríos"));

    expect(mockRouter.push).toHaveBeenCalledWith("/client/c9");
  });

  it("en pantalla ancha van en su propia columna, junto a lo de hoy", async () => {
    setViewport(VIEWPORTS.ipadApaisado);
    entrar();
    api({ "/api/clients": clientas });
    await abrir();

    await waitFor(() => expect(screen.getByTestId("inicio-cumpleanos")).toBeTruthy());
    expect(screen.getByText("Ana López")).toBeTruthy();
  });
});

describe("confirmar las de mañana", () => {
  const MANANA = [
    citaEl(MARTES, "m1", "10:00", "11:00", "Rosa Paz", { confirmedAt: "2026-09-21T15:00:00.000Z" }),
    citaEl(MARTES, "m2", "12:00", "13:00", "Eva Sol", { ...lucia, client: fixtures.cliente({ fullName: "Eva Sol", phone: "5551112222" }) }),
    citaEl(MARTES, "m3", "16:00", "17:00", "Lía Mar", { status: "CANCELLED" }),
  ];

  const fechasPedidas = () =>
    apiCalls().filter((c) => c.path === "/api/appointments").map((c) => new URLSearchParams(c.search).get("date"));

  it("las del día siguiente, con cuántas están confirmadas; las canceladas no", async () => {
    entrar("RECEPTION", "u-recepcion");
    api({ "/api/appointments": porDia({ [LUNES]: AGENDA, [MARTES]: MANANA }) });
    await abrir();

    const lista = await waitFor(() => within(screen.getByTestId("inicio-confirmar")));
    expect(lista.getByText("Confirmar mañana")).toBeTruthy();
    expect(lista.getByText("1 de 2 confirmadas")).toBeTruthy();
    expect(lista.getByText("Rosa Paz")).toBeTruthy();
    expect(lista.getByText("12:00 · Facial · Lucía")).toBeTruthy();
    expect(lista.queryByText("Lía Mar")).toBeNull();
    expect(fechasPedidas()).toContain(MARTES);
  });

  it("\"Confirmar\" la marca en el servidor", async () => {
    entrar();
    api({ "/api/appointments": porDia({ [MARTES]: MANANA }), "PATCH /api/appointments/m2": { ok: true } });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Marcar confirmada la cita de Eva Sol")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Marcar confirmada la cita de Eva Sol"));

    await waitFor(() => {
      const patch = apiCalls().find((c) => c.method === "PATCH");
      expect(patch).toMatchObject({ path: "/api/appointments/m2", body: { confirmed: true } });
    });
  });

  it("quitar una confirmación pregunta antes", async () => {
    entrar();
    api({ "/api/appointments": porDia({ [MARTES]: MANANA }), "PATCH /api/appointments/m1": { ok: true } });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Quitar la confirmación de Rosa Paz")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Quitar la confirmación de Rosa Paz"));

    expect(alertSpy).toHaveBeenCalledWith("¿Quitar la confirmación?", expect.stringContaining("Rosa Paz"), expect.any(Array));
    expect(apiCalls().filter((c) => c.method === "PATCH")).toHaveLength(0);

    const botones = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    botones.find((b) => b.text === "Quitar")!.onPress!();

    await waitFor(() => {
      const patch = apiCalls().find((c) => c.method === "PATCH");
      expect(patch).toMatchObject({ path: "/api/appointments/m1", body: { confirmed: false } });
    });
  });

  it("WhatsApp abre el mensaje que pide confirmar, con el día y la hora", async () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    entrar();
    api({ "/api/appointments": porDia({ [MARTES]: MANANA }) });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Escribir a Eva Sol por WhatsApp")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Escribir a Eva Sol por WhatsApp"));

    const url = openSpy.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/wa\.me\/525551112222\?text=/);
    expect(decodeURIComponent(url.split("text=")[1])).toBe(
      "Hola Eva, te escribimos de Mevak Beauty Center: tienes cita mañana a las 12:00. " +
      "¿Nos confirmas que vienes? Si necesitas cambiarla, contéstanos por aquí.",
    );
    openSpy.mockRestore();
  });

  it("un sábado son las del lunes: el domingo no abre", async () => {
    jest.setSystemTime(new Date(`${SABADO}T10:00:00`));
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    entrar();
    api({ "/api/appointments": porDia({ [LUNES]: [citaEl(LUNES, "l1", "09:00", "10:00", "Rosa Paz")] }) });
    await abrir();

    const lista = await waitFor(() => within(screen.getByTestId("inicio-confirmar")));
    expect(lista.getByText("Confirmar el lunes")).toBeTruthy();
    expect(fechasPedidas()).not.toContain(DOMINGO);

    fireEvent.press(screen.getByLabelText("Escribir a Rosa Paz por WhatsApp"));
    expect(decodeURIComponent(openSpy.mock.calls[0][0] as string)).toContain("tienes cita el lunes 21 de septiembre a las 09:00");
    openSpy.mockRestore();
  });

  it("la facialista no la ve ni la pide", async () => {
    entrar("FACIALIST", "u2");
    api({ "/api/appointments": porDia({ [LUNES]: AGENDA, [MARTES]: MANANA }) });
    await abrir();

    await waitFor(() => expect(screen.getByText("Sofía Ruiz")).toBeTruthy());
    expect(screen.queryByTestId("inicio-confirmar")).toBeNull();
    expect(fechasPedidas()).not.toContain(MARTES);
  });

  it("sin citas mañana, la sección no sale", async () => {
    entrar();
    api({ "/api/appointments": porDia({ [LUNES]: AGENDA }) });
    await abrir();

    await waitFor(() => expect(fechasPedidas()).toContain(MARTES));
    expect(screen.queryByTestId("inicio-confirmar")).toBeNull();
  });
});

describe("para reagendar", () => {
  const SIN_AGENDAR = [
    {
      id: "cp1", clientId: "ana", totalSessions: 6, remainingSessions: 4, startDate: "2026-06-01T00:00:00",
      client: { id: "ana", fullName: "Ana López", phone: "5551112222" },
      package: { name: "Láser 6 sesiones" }, lastVisit: "2026-08-31T10:00:00",
    },
    {
      id: "cp2", clientId: "eva", totalSessions: 6, remainingSessions: 1, startDate: "2026-09-01T00:00:00",
      client: { id: "eva", fullName: "Eva Sol", phone: "5553334444" },
      package: { name: "Láser 6 sesiones" }, lastVisit: null,
    },
  ];

  it("las sesiones pagadas sin agendar, con lo que queda y cuándo vino", async () => {
    entrar("RECEPTION", "u-recepcion");
    api({ "/api/appointments": [], "/api/client-packages/idle": SIN_AGENDAR });
    await abrir();

    const lista = await waitFor(() => within(screen.getByTestId("inicio-reagendar")));
    expect(lista.getByText("Le quedan 4 de 6 · vino hace 3 semanas")).toBeTruthy();
    expect(lista.getByText("Le quedan 1 de 6 · aún no ha venido")).toBeTruthy();
  });

  it("\"Agendar\" abre Nueva cita de láser con la clienta y la laserista", async () => {
    entrar();
    api({ "/api/appointments": [], "/api/client-packages/idle": SIN_AGENDAR });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Agendar a Eva Sol")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Agendar a Eva Sol"));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/appointment/new",
      params: { clientId: "eva", clientName: "Eva Sol", type: "LASER", staffId: "u1", staffName: "Dueña" },
    });
  });

  it("WhatsApp le dice cuántas sesiones le quedan", async () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    entrar();
    api({ "/api/appointments": [], "/api/client-packages/idle": SIN_AGENDAR });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Escribir a Ana López para reagendar")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Escribir a Ana López para reagendar"));
    fireEvent.press(screen.getByLabelText("Escribir a Eva Sol para reagendar"));

    const textos = openSpy.mock.calls.map(([url]) => decodeURIComponent(String(url).split("text=")[1]));
    expect(textos[0]).toContain("te quedan 4 sesiones de tu paquete");
    expect(textos[1]).toContain("te queda 1 sesión de tu paquete");
    openSpy.mockRestore();
  });

  it("tocar a la clienta abre su ficha", async () => {
    entrar();
    api({ "/api/appointments": [], "/api/client-packages/idle": SIN_AGENDAR });
    await abrir();

    await waitFor(() => expect(screen.getByLabelText("Ver la ficha de Ana López")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Ver la ficha de Ana López"));

    expect(mockRouter.push).toHaveBeenCalledWith("/client/ana");
  });

  it("la facialista no la ve ni la pide", async () => {
    entrar("FACIALIST", "u2");
    api({ "/api/client-packages/idle": SIN_AGENDAR });
    await abrir();

    await waitFor(() => expect(screen.getByText("Sofía Ruiz")).toBeTruthy());
    expect(screen.queryByTestId("inicio-reagendar")).toBeNull();
    expect(apiCalls().map((c) => c.path)).not.toContain("/api/client-packages/idle");
  });
});
