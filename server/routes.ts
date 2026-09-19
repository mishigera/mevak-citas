import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { storage, type Role, type AppointmentStatus, type PaymentMethod, type ClientPackage } from "./storage";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: Role;
    }
  }
}

function getToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function paramId(req: Request): string {
  const raw = (req.params as Record<string, string | string[] | undefined>).id;
  if (Array.isArray(raw)) return raw[0] || "";
  return raw || "";
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const session = storage.tokens.get(token);
  if (!session) return res.status(401).json({ message: "Unauthorized" });
  req.userId = session.userId;
  req.userRole = session.role;
  next();
}

function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    const session = storage.tokens.get(token);
    if (!session) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(session.role)) return res.status(403).json({ message: "Forbidden" });
    req.userId = session.userId;
    req.userRole = session.role;
    next();
  };
}

function enrichClientPackage(clientPackage: ClientPackage | null | undefined) {
  if (!clientPackage) return null;
  const pkg = storage.packages.get(clientPackage.packageId);
  return {
    ...clientPackage,
    package: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          totalSessions: pkg.totalSessions,
          price: pkg.price,
        }
      : null,
  };
}

/**
 * La forma que la app manda y la base guarda: `YYYY-MM-DD`, con hora opcional y zona
 * opcional. Comprobar la forma **antes** de parsear no es paranoia: el parser de V8 es
 * generoso y `new Date("mañana a las 10")` devuelve una fecha real del año 2001.
 */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Milisegundos de una fecha-hora bien formada, o `null`. */
function instante(valor: unknown): number | null {
  if (typeof valor !== "string" || !FORMATO_FECHA.test(valor.trim())) return null;
  const t = new Date(valor).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Valida un intervalo antes de guardarlo.
 *
 * Existía ya en `POST /api/blocks` y **faltaba en las citas**: una fecha mal tecleada
 * daba `NaN`, y como toda comparación con `NaN` es `false`, la detección de solapes se
 * desactivaba en silencio y la cita se guardaba con una fecha basura que no aparecía en
 * ningún día. Deuda §30.
 */
function validarIntervalo(inicio: unknown, fin: unknown): { start: number; end: number } | string {
  const start = instante(inicio);
  const end = instante(fin);
  if (start === null || end === null) return "Formato de fecha inválido";
  if (end <= start) return "La fecha/hora de fin debe ser mayor a inicio";
  return { start, end };
}

/**
 * El día local de un ISO con zona. El servidor corre con la `TZ` del centro (ADR-0004),
 * así que `getFullYear/Month/Date` ya dan el día que la recepción llamaría "hoy".
 */
function diaLocalDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function seSolapan(aInicio: number, aFin: number, bInicio: unknown, bFin: unknown): boolean {
  const start = instante(bInicio);
  const end = instante(bFin);
  if (start === null || end === null) return false;
  return aInicio < end && aFin > start;
}

/** La cita choca con otra del mismo staff. `exceptoId` salta la cita que se está moviendo. */
function citaEnConflicto(staffId: string, start: number, end: number, exceptoId?: string) {
  return Array.from(storage.appointments.values()).find((a) => {
    if (a.id === exceptoId || a.staffId !== staffId || a.status === "CANCELLED") return false;
    return seSolapan(start, end, a.dateTimeStart, a.dateTimeEnd);
  });
}

/**
 * La cita cae en un bloqueo. Un bloqueo con `userId: null` es de centro y afecta a todas
 * las agendas (ADR-0005 dejó tres roles; el centro no es ninguno de ellos).
 */
function bloqueoEnConflicto(staffId: string, start: number, end: number) {
  return Array.from(storage.availabilityBlocks.values()).find((b) => {
    if (b.userId !== null && b.userId !== staffId) return false;
    return seSolapan(start, end, b.startDateTime, b.endDateTime);
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  await storage.ready;

  // AUTH
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const users = Array.from(storage.users.values());
    const user = users.find((u) => u.email === email && u.isActive);
    if (!user) return res.status(401).json({ message: "Credenciales incorrectas" });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Credenciales incorrectas" });
    const token = randomUUID();
    storage.tokens.set(token, { userId: user.id, role: user.role });
    res.json({ token, id: user.id, name: user.name, email: user.email, role: user.role });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = getToken(req)!;
    storage.tokens.delete(token);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = storage.users.get(req.userId!);
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });

  // USERS
  app.get("/api/users", requireAuth, (req, res) => {
    const users = Array.from(storage.users.values()).map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt,
    }));
    res.json(users);
  });

  app.get("/api/users/staff", requireAuth, (req, res) => {
    const staff = Array.from(storage.users.values())
      .filter((u) => (u.role === "OWNER" || u.role === "FACIALIST") && u.isActive)
      .map((u) => ({ id: u.id, name: u.name, role: u.role }));
    res.json(staff);
  });

  app.post("/api/users", requireRole("OWNER"), async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: "Faltan campos" });
    const exists = Array.from(storage.users.values()).find((u) => u.email === email);
    if (exists) return res.status(400).json({ message: "Email ya registrado" });
    const hash = await bcrypt.hash(password, 10);
    const user = { id: randomUUID(), name, email, passwordHash: hash, role, isActive: true, createdAt: new Date().toISOString() };
    storage.users.set(user.id, user);
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  });

  app.patch("/api/users/:id", requireRole("OWNER"), async (req, res) => {
    const user = storage.users.get(paramId(req));
    if (!user) return res.status(404).json({ message: "Not found" });
    const { name, email, role, isActive, password } = req.body;
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);
    storage.users.set(user.id, user);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  });

  // CLIENTS
  app.get("/api/clients", requireAuth, (req, res) => {
    const { search } = req.query;
    let clients = Array.from(storage.clients.values());
    if (search) {
      const q = (search as string).toLowerCase();
      clients = clients.filter((c) => c.fullName.toLowerCase().includes(q) || c.phone.includes(search as string));
    }
    clients.sort((a, b) => a.fullName.localeCompare(b.fullName));
    res.json(clients);
  });

  app.get("/api/clients/:id", requireAuth, (req, res) => {
    const client = storage.clients.get(paramId(req));
    if (!client) return res.status(404).json({ message: "Not found" });
    res.json(client);
  });

  app.post("/api/clients", requireAuth, (req, res) => {
    const { fullName, phone, email, birthDate, sex, occupation } = req.body;
    if (!fullName || !phone) return res.status(400).json({ message: "fullName y phone son requeridos" });
    const client = { id: randomUUID(), fullName, phone, email, birthDate, sex, occupation, createdAt: new Date().toISOString() };
    storage.clients.set(client.id, client);
    res.status(201).json(client);
  });

  app.patch("/api/clients/:id", requireAuth, (req, res) => {
    const client = storage.clients.get(paramId(req));
    if (!client) return res.status(404).json({ message: "Not found" });
    Object.assign(client, req.body);
    storage.clients.set(client.id, client);
    res.json(client);
  });

  // CLINICAL PROFILE
  app.get("/api/clients/:id/clinical", requireRole("OWNER"), (req, res) => {
    const profiles = Array.from(storage.clinicalProfiles.values());
    const profile = profiles.find((p) => p.clientId === paramId(req));
    res.json(profile || null);
  });

  app.put("/api/clients/:id/clinical", requireRole("OWNER"), (req, res) => {
    const clientId = paramId(req);
    const profiles = Array.from(storage.clinicalProfiles.values());
    const profile = profiles.find((p) => p.clientId === clientId);
    if (profile) {
      Object.assign(profile, req.body, { clientId });
      storage.clinicalProfiles.set(profile.id, profile);
      return res.json(profile);
    } else {
      const createdProfile = { id: randomUUID(), clientId, ...req.body };
      storage.clinicalProfiles.set(createdProfile.id, createdProfile);
      return res.json(createdProfile);
    }
  });

  // LASER AREAS
  app.get("/api/laser-areas", requireAuth, (req, res) => {
    res.json(Array.from(storage.laserAreas.values()).filter((a) => a.isActive));
  });

  app.get("/api/clients/:id/laser-areas", requireAuth, (req, res) => {
    res.json(Array.from(storage.clientLaserSelections.values()).filter((s) => s.clientId === paramId(req)));
  });

  app.put("/api/clients/:id/laser-areas", requireRole("OWNER"), (req, res) => {
    const clientId = paramId(req);
    const { areaIds } = req.body as { areaIds: string[] };
    Array.from(storage.clientLaserSelections.values()).filter((s) => s.clientId === clientId).forEach((s) => storage.clientLaserSelections.delete(s.id));
    const newSelections = areaIds.map((areaId) => { const sel = { id: randomUUID(), clientId, areaId }; storage.clientLaserSelections.set(sel.id, sel); return sel; });
    res.json(newSelections);
  });

  // CLIENT PACKAGES
  app.get("/api/clients/:id/packages", requireAuth, (req, res) => {
    const clientId = paramId(req);
    const packages = Array.from(storage.clientPackages.values())
      .filter((p) => p.clientId === clientId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((p) => enrichClientPackage(p));
    res.json(packages);
  });

  /**
   * Vender un paquete registra el cobro.
   *
   * Antes solo creaba el `ClientPackage`, así que el importe no entraba en ningún lado:
   * el reporte sumaba cero por todo el láser, porque cada sesión se cobra luego como
   * `INCLUDED` a 0. Deuda §31, ADR-0006.
   */
  app.post("/api/clients/:id/packages", requireRole("OWNER", "RECEPTION"), (req, res) => {
    const clientId = paramId(req);
    const client = storage.clients.get(clientId);
    if (!client) return res.status(404).json({ message: "Cliente no encontrado" });
    const pkg = storage.packages.get(req.body.packageId);
    if (!pkg || !pkg.isActive) return res.status(404).json({ message: "Paquete no encontrado" });

    const method = (req.body.method ?? "CASH") as PaymentMethod;
    if (!["CASH", "CARD"].includes(method)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    // Sin importe explícito vale el del catálogo, que es el caso normal; se permite
    // otro por si se aplica un ajuste al vender.
    const totalAmount = req.body.totalAmount === undefined ? pkg.price : Number(req.body.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return res.status(400).json({ message: "Importe inválido" });
    }

    const cp = { id: randomUUID(), clientId, packageId: pkg.id, totalSessions: pkg.totalSessions, usedSessions: 0, remainingSessions: pkg.totalSessions, startDate: new Date().toISOString(), status: "ACTIVE" as const };
    storage.clientPackages.set(cp.id, cp);

    const payment = {
      id: randomUUID(),
      clientId,
      clientPackageId: cp.id,
      concept: "PAQUETE" as const,
      method,
      totalAmount,
      // Un paquete de láser es de la dueña entera; la facialista no entra en esto.
      ownerNetAmount: totalAmount,
      facialistNetAmount: 0,
      facialistPaidFlag: false,
      createdAt: new Date().toISOString(),
    };
    storage.payments.set(payment.id, payment);

    res.status(201).json({ ...enrichClientPackage(cp), payment });
  });

  // SERVICES
  app.get("/api/services", requireAuth, (req, res) => {
    const { type } = req.query;
    let services = Array.from(storage.services.values()).filter((s) => s.isActive);
    if (type) services = services.filter((s) => s.type === type);
    res.json(services);
  });

  app.post("/api/services", requireRole("OWNER"), (req, res) => {
    const { name, type, price } = req.body;
    if (!name || !type || price === undefined) return res.status(400).json({ message: "Faltan campos" });
    const svc = { id: randomUUID(), name, type, price: Number(price), isActive: true };
    storage.services.set(svc.id, svc);
    res.status(201).json(svc);
  });

  app.patch("/api/services/:id", requireRole("OWNER"), (req, res) => {
    const svc = storage.services.get(paramId(req));
    if (!svc) return res.status(404).json({ message: "Not found" });
    Object.assign(svc, req.body);
    storage.services.set(svc.id, svc);
    res.json(svc);
  });

  // PACKAGES
  app.get("/api/packages", requireAuth, (req, res) => {
    res.json(Array.from(storage.packages.values()).filter((p) => p.isActive));
  });

  app.post("/api/packages", requireRole("OWNER"), (req, res) => {
    const { name, totalSessions, price } = req.body;
    if (!name || !totalSessions || price === undefined) return res.status(400).json({ message: "Faltan campos" });
    const pkg = { id: randomUUID(), name, type: "LASER" as const, totalSessions: Number(totalSessions), price: Number(price), isActive: true };
    storage.packages.set(pkg.id, pkg);
    res.status(201).json(pkg);
  });

  // APPOINTMENTS
  app.get("/api/appointments", requireAuth, (req, res) => {
    const { date, staffId, clientId } = req.query;
    let appts = Array.from(storage.appointments.values());
    if (date) appts = appts.filter((a) => a.dateTimeStart.startsWith(date as string));
    if (staffId) appts = appts.filter((a) => a.staffId === staffId);
    if (clientId) appts = appts.filter((a) => a.clientId === clientId);
    appts.sort((a, b) => a.dateTimeStart.localeCompare(b.dateTimeStart));
    const enriched = appts.map((a) => {
      const client = storage.clients.get(a.clientId);
      const staff = storage.users.get(a.staffId);
      const services = Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === a.id).map((s) => storage.services.get(s.serviceId)).filter(Boolean);
      return { ...a, client, staff: staff ? { id: staff.id, name: staff.name, role: staff.role } : null, services };
    });
    res.json(enriched);
  });

  app.get("/api/appointments/:id", requireAuth, (req, res) => {
    const appt = storage.appointments.get(paramId(req));
    if (!appt) return res.status(404).json({ message: "Not found" });
    const client = storage.clients.get(appt.clientId);
    const staff = storage.users.get(appt.staffId);
    const services = Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === appt.id).map((s) => storage.services.get(s.serviceId)).filter(Boolean);
    const payment = Array.from(storage.payments.values()).find((p) => p.appointmentId === appt.id);
    const laserSession = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === appt.id);
    const clientPackage = enrichClientPackage(
      laserSession?.clientPackageId ? storage.clientPackages.get(laserSession.clientPackageId) : null,
    );
    res.json({ ...appt, client, staff: staff ? { id: staff.id, name: staff.name, role: staff.role } : null, services, payment, laserSession, clientPackage });
  });

  app.post("/api/appointments", requireAuth, (req, res) => {
    const { dateTimeStart, dateTimeEnd, clientId, staffId, type, notes } = req.body;
    if (!dateTimeStart || !dateTimeEnd || !clientId || !staffId || !type) return res.status(400).json({ message: "Faltan campos" });
    const intervalo = validarIntervalo(dateTimeStart, dateTimeEnd);
    if (typeof intervalo === "string") return res.status(400).json({ message: intervalo });
    const { start, end } = intervalo;
    if (citaEnConflicto(staffId, start, end)) return res.status(409).json({ message: "Conflicto de horario con otra cita" });
    const block = bloqueoEnConflicto(staffId, start, end);
    if (block) {
      return res.status(409).json({
        message: block.userId === null ? "El centro está cerrado en ese horario" : "El staff tiene un bloqueo en ese horario",
      });
    }
    const appt = { id: randomUUID(), dateTimeStart, dateTimeEnd, clientId, staffId, type, status: "SCHEDULED" as const, notes };
    storage.appointments.set(appt.id, appt);
    res.status(201).json(appt);
  });

  app.patch("/api/appointments/:id", requireAuth, (req, res) => {
    const appt = storage.appointments.get(paramId(req));
    if (!appt) return res.status(404).json({ message: "Not found" });
    const { dateTimeStart, dateTimeEnd, staffId, status, notes, clientId, type } = req.body;
    // Reprogramar valida lo mismo que crear: antes el PATCH solo miraba las otras citas
    // y mover una encima de un bloqueo pasaba sin error (deuda §8).
    if (dateTimeStart || dateTimeEnd || staffId) {
      const checkStaff = staffId || appt.staffId;
      const intervalo = validarIntervalo(dateTimeStart || appt.dateTimeStart, dateTimeEnd || appt.dateTimeEnd);
      if (typeof intervalo === "string") return res.status(400).json({ message: intervalo });
      const { start, end } = intervalo;
      if (citaEnConflicto(checkStaff, start, end, appt.id)) return res.status(409).json({ message: "Conflicto de horario con otra cita" });
      const block = bloqueoEnConflicto(checkStaff, start, end);
      if (block) {
        return res.status(409).json({
          message: block.userId === null ? "El centro está cerrado en ese horario" : "El staff tiene un bloqueo en ese horario",
        });
      }
    }
    if (dateTimeStart) appt.dateTimeStart = dateTimeStart;
    if (dateTimeEnd) appt.dateTimeEnd = dateTimeEnd;
    if (staffId) appt.staffId = staffId;
    if (status) appt.status = status;
    if (notes !== undefined) appt.notes = notes;
    if (clientId) appt.clientId = clientId;
    if (type) appt.type = type;
    storage.appointments.set(appt.id, appt);
    res.json(appt);
  });

  // APPOINTMENT SERVICES
  app.put("/api/appointments/:id/services", requireAuth, (req, res) => {
    const appointmentId = paramId(req);
    const { serviceIds } = req.body as { serviceIds: string[] };
    Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === appointmentId).forEach((s) => storage.appointmentServices.delete(s.id));
    const newSvcs = serviceIds.map((serviceId) => { const svc = { id: randomUUID(), appointmentId, serviceId }; storage.appointmentServices.set(svc.id, svc); return svc; });
    res.json(newSvcs);
  });

  // LASER SESSIONS
  app.get("/api/appointments/:id/laser-session", requireAuth, (req, res) => {
    const session = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === paramId(req));
    res.json(session || null);
  });

  app.put("/api/appointments/:id/laser-session", requireRole("OWNER"), (req, res) => {
    const appointmentId = paramId(req);
    const existing = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === appointmentId);
    if (existing) {
      Object.assign(existing, req.body, { appointmentId });
      storage.laserSessions.set(existing.id, existing);
      res.json(existing);
    } else {
      const session = { id: randomUUID(), appointmentId, ...req.body };
      storage.laserSessions.set(session.id, session);
      res.json(session);
    }
  });

  // PAYMENTS
  app.get("/api/appointments/:id/payment", requireAuth, (req, res) => {
    res.json(Array.from(storage.payments.values()).find((p) => p.appointmentId === paramId(req)) || null);
  });

  app.post("/api/appointments/:id/payment", requireAuth, (req, res) => {
    const appointmentId = paramId(req);
    const { method, totalAmount } = req.body;
    const appt = storage.appointments.get(appointmentId);
    if (!appt) return res.status(404).json({ message: "Cita no encontrada" });
    const existing = Array.from(storage.payments.values()).find((p) => p.appointmentId === appointmentId);
    if (existing) return res.status(409).json({ message: "Ya existe un pago" });

    const selectedClientPackageId = req.body.clientPackageId as string | undefined;
    if (method === "INCLUDED" && !selectedClientPackageId) {
      return res.status(400).json({ message: "Debes seleccionar un paquete para pago incluido" });
    }
    if (selectedClientPackageId && appt.type !== "LASER") {
      return res.status(400).json({ message: "Solo las citas láser pueden usar paquete" });
    }

    let consumedSessionNumber: number | undefined;
    if (selectedClientPackageId) {
      const cp = storage.clientPackages.get(selectedClientPackageId);
      if (!cp || cp.clientId !== appt.clientId) {
        return res.status(400).json({ message: "El paquete no pertenece al cliente de la cita" });
      }
      if (cp.status !== "ACTIVE" || cp.remainingSessions <= 0) {
        return res.status(400).json({ message: "El paquete ya no tiene sesiones disponibles" });
      }

      cp.usedSessions += 1;
      cp.remainingSessions = Math.max(cp.totalSessions - cp.usedSessions, 0);
      if (cp.remainingSessions <= 0) cp.status = "FINISHED";
      storage.clientPackages.set(cp.id, cp);
      consumedSessionNumber = cp.usedSessions;
    }

    const resolvedMethod = (selectedClientPackageId ? "INCLUDED" : method) as PaymentMethod;
    if (!["CASH", "CARD", "INCLUDED"].includes(resolvedMethod)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    const total = resolvedMethod === "INCLUDED" ? 0 : Number(totalAmount) || 0;
    const isFacial = appt.type === "FACIAL";
    const payment = { id: randomUUID(), appointmentId, clientId: appt.clientId, concept: "CITA" as const, method: resolvedMethod, totalAmount: total, ownerNetAmount: isFacial ? Math.floor(total / 2) : total, facialistNetAmount: isFacial ? Math.ceil(total / 2) : 0, facialistPaidFlag: false, createdAt: new Date().toISOString() };
    storage.payments.set(payment.id, payment);
    appt.status = "DONE";
    storage.appointments.set(appt.id, appt);

    if (appt.type === "LASER") {
      const clientSelectionAreaIds = Array.from(storage.clientLaserSelections.values())
        .filter((selection) => selection.clientId === appt.clientId)
        .map((selection) => selection.areaId);

      const areasSnapshotJson = clientSelectionAreaIds
        .map((areaId) => storage.laserAreas.get(areaId)?.svgKey)
        .filter(Boolean) as string[];

      const existingSession = Array.from(storage.laserSessions.values()).find((session) => session.appointmentId === appt.id);
      if (existingSession) {
        existingSession.areasSnapshotJson = areasSnapshotJson;
        if (selectedClientPackageId) existingSession.clientPackageId = selectedClientPackageId;
        if (consumedSessionNumber !== undefined) existingSession.sessionNumber = consumedSessionNumber;
        storage.laserSessions.set(existingSession.id, existingSession);
      } else {
        const session = {
          id: randomUUID(),
          appointmentId: appt.id,
          clientPackageId: selectedClientPackageId,
          sessionNumber: consumedSessionNumber,
          areasSnapshotJson,
        };
        storage.laserSessions.set(session.id, session);
      }
    }
    res.status(201).json(payment);
  });

  /**
   * Anula un pago: devuelve la sesión al paquete si la consumió y reabre la cita.
   *
   * Antes no existía y registrar el pago cerraba la cita sin vuelta atrás, así que un
   * cobro mal capturado solo se arreglaba tocando la base a mano. Deuda §11.
   */
  app.delete("/api/payments/:id", requireRole("OWNER"), (req, res) => {
    const payment = storage.payments.get(paramId(req));
    if (!payment) return res.status(404).json({ message: "Not found" });
    if (payment.facialistPaidFlag) {
      return res.status(409).json({ message: "No se puede anular un pago ya liquidado a la facialista" });
    }

    // Una venta de paquete solo se anula si no se ha gastado ninguna sesión: si ya se
    // aplicó, devolver el dinero deja un paquete a medias que nadie pagó.
    if (payment.concept === "PAQUETE" && payment.clientPackageId) {
      const cp = storage.clientPackages.get(payment.clientPackageId);
      if (cp && cp.usedSessions > 0) {
        return res.status(409).json({ message: "El paquete ya tiene sesiones usadas" });
      }
      if (cp) storage.clientPackages.delete(cp.id);
    }

    if (payment.appointmentId) {
      const sesion = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === payment.appointmentId);
      // Devolver la sesión consumida al paquete.
      if (sesion?.clientPackageId) {
        const cp = storage.clientPackages.get(sesion.clientPackageId);
        if (cp) {
          cp.usedSessions = Math.max(cp.usedSessions - 1, 0);
          cp.remainingSessions = Math.max(cp.totalSessions - cp.usedSessions, 0);
          if (cp.remainingSessions > 0) cp.status = "ACTIVE";
          storage.clientPackages.set(cp.id, cp);
        }
        sesion.clientPackageId = undefined;
        sesion.sessionNumber = undefined;
        storage.laserSessions.set(sesion.id, sesion);
      }
      // La cita vuelve a "llegó": la clienta estuvo, lo que falta es cobrarle bien.
      const appt = storage.appointments.get(payment.appointmentId);
      if (appt) {
        appt.status = "ARRIVED";
        storage.appointments.set(appt.id, appt);
      }
    }

    storage.payments.delete(payment.id);
    res.json({ ok: true });
  });

  app.patch("/api/payments/:id/facialist-paid", requireRole("OWNER"), (req, res) => {
    const payment = storage.payments.get(paramId(req));
    if (!payment) return res.status(404).json({ message: "Not found" });
    payment.facialistPaidFlag = req.body.paid ?? true;
    storage.payments.set(payment.id, payment);
    res.json(payment);
  });

  app.get("/api/payments/pending-facialist", requireRole("OWNER"), (req, res) => {
    const pending = Array.from(storage.payments.values())
      .filter((p) => !p.facialistPaidFlag && p.facialistNetAmount > 0)
      .map((p) => {
        const appt = p.appointmentId ? storage.appointments.get(p.appointmentId) : null;
        const staff = appt ? storage.users.get(appt.staffId) : null;
        const client = appt ? storage.clients.get(appt.clientId) : p.clientId ? storage.clients.get(p.clientId) : null;
        return { ...p, appointment: appt, staff, client };
      });
    res.json(pending);
  });

  /**
   * Ingresos de un mes o de un día.
   *
   * Desglosa por método y por concepto porque el corte de caja al cerrar necesita las
   * dos cosas: cuánto hay que tener en el cajón (efectivo) y de dónde vino.
   *
   * El día se compara **en local**: `createdAt` es un ISO con `Z`, y su prefijo es el
   * día en UTC, que después de las 18:00 en México ya es el siguiente (ADR-0004).
   */
  app.get("/api/reports/income", requireRole("OWNER"), (req, res) => {
    const { month, year, date } = req.query;
    let payments = Array.from(storage.payments.values());

    if (date) {
      payments = payments.filter((p) => diaLocalDe(p.createdAt) === date);
    } else if (month && year) {
      payments = payments.filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() + 1 === Number(month) && d.getFullYear() === Number(year);
      });
    }

    const suma = (lista: typeof payments, campo: "totalAmount" | "ownerNetAmount" | "facialistNetAmount") =>
      lista.reduce((acc, p) => acc + p[campo], 0);
    const porMetodo = (metodo: PaymentMethod) => suma(payments.filter((p) => p.method === metodo), "totalAmount");
    const porConcepto = (concepto: "CITA" | "PAQUETE") => suma(payments.filter((p) => p.concept === concepto), "totalAmount");

    res.json({
      total: suma(payments, "totalAmount"),
      ownerNet: suma(payments, "ownerNetAmount"),
      facialistNet: suma(payments, "facialistNetAmount"),
      count: payments.length,
      porMetodo: { CASH: porMetodo("CASH"), CARD: porMetodo("CARD"), INCLUDED: porMetodo("INCLUDED") },
      porConcepto: { CITA: porConcepto("CITA"), PAQUETE: porConcepto("PAQUETE") },
      pendienteFacialista: suma(payments.filter((p) => !p.facialistPaidFlag), "facialistNetAmount"),
    });
  });

  // AVAILABILITY BLOCKS
  /**
   * Todos los bloqueos, de todo el mundo.
   *
   * Antes cada quien veía solo los suyos, así que **quien agenda no veía ninguno**: la
   * recepcionista se enteraba de que la laserista no estaba por un 409 al guardar la
   * cita. Deuda §29.
   */
  app.get("/api/blocks", requireAuth, (req, res) => {
    const enriched = Array.from(storage.availabilityBlocks.values()).map((b) => {
      const user = b.userId ? storage.users.get(b.userId) : null;
      return { ...b, user: user ? { id: user.id, name: user.name } : null };
    });
    enriched.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
    res.json(enriched);
  });

  /** Quién puede bloquear la agenda de otra persona, o la del centro entero. */
  function gestionaAgenda(role: Role | undefined) {
    return role === "OWNER" || role === "RECEPTION";
  }

  app.post("/api/blocks", requireRole("OWNER", "RECEPTION", "FACIALIST"), (req, res) => {
    const { startDateTime, endDateTime, reason, scope, userId } = req.body as {
      startDateTime?: string; endDateTime?: string; reason?: string;
      scope?: "SELF" | "CENTER"; userId?: string;
    };
    if (!startDateTime || !endDateTime) return res.status(400).json({ message: "Faltan fechas" });
    const intervalo = validarIntervalo(startDateTime, endDateTime);
    if (typeof intervalo === "string") return res.status(400).json({ message: intervalo });

    // `null` = el centro cierra. Antes no existía: un bloqueo siempre se asignaba a quien
    // lo creaba, así que para un festivo cada una tenía que crear el suyo.
    let dueño: string | null;
    if (scope === "CENTER") {
      if (!gestionaAgenda(req.userRole)) return res.status(403).json({ message: "Solo la dueña o recepción cierran el centro" });
      dueño = null;
    } else if (userId && userId !== req.userId) {
      if (!gestionaAgenda(req.userRole)) return res.status(403).json({ message: "No puedes bloquear la agenda de otra persona" });
      const destino = storage.users.get(userId);
      if (!destino || !destino.isActive) return res.status(404).json({ message: "Usuario no encontrado" });
      dueño = destino.id;
    } else {
      dueño = req.userId!;
    }

    const block = { id: randomUUID(), userId: dueño, startDateTime, endDateTime, reason };
    storage.availabilityBlocks.set(block.id, block);
    res.status(201).json(block);
  });

  app.delete("/api/blocks/:id", requireRole("OWNER", "RECEPTION", "FACIALIST"), (req, res) => {
    const blockId = paramId(req);
    const block = storage.availabilityBlocks.get(blockId);
    if (!block) return res.status(404).json({ message: "Not found" });
    if (block.userId !== req.userId && !gestionaAgenda(req.userRole)) {
      return res.status(403).json({ message: "No puedes eliminar bloqueos de otro usuario" });
    }
    storage.availabilityBlocks.delete(blockId);
    res.json({ ok: true });
  });

  // CLIENT APPOINTMENT HISTORY
  app.get("/api/clients/:id/appointments", requireAuth, (req, res) => {
    const appts = Array.from(storage.appointments.values())
      .filter((a) => a.clientId === paramId(req))
      .sort((a, b) => b.dateTimeStart.localeCompare(a.dateTimeStart))
      .map((a) => {
        const staff = storage.users.get(a.staffId);
        const services = Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === a.id).map((s) => storage.services.get(s.serviceId)).filter(Boolean);
        const payment = Array.from(storage.payments.values()).find((p) => p.appointmentId === a.id);
        const laserSession = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === a.id) || null;
        const clientPackage = enrichClientPackage(
          laserSession?.clientPackageId ? storage.clientPackages.get(laserSession.clientPackageId) : null,
        );
        return { ...a, staff: staff ? { id: staff.id, name: staff.name } : null, services, payment, laserSession, clientPackage };
      });
    res.json(appts);
  });

  const httpServer = createServer(app);
  return httpServer;
}
