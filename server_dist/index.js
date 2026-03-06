"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/index.ts
var import_express = __toESM(require("express"));

// server/routes.ts
var import_node_http = require("node:http");
var import_bcryptjs2 = __toESM(require("bcryptjs"));
var import_crypto2 = require("crypto");

// server/storage.ts
var import_crypto = require("crypto");
var import_bcryptjs = __toESM(require("bcryptjs"));

// server/db.ts
var import_pg = require("pg");
var _pool = null;
function getDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL no est\xE1 configurada");
  }
  return dbUrl;
}
function getDbPool() {
  if (_pool) return _pool;
  _pool = new import_pg.Pool({
    connectionString: getDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 3e4
  });
  return _pool;
}
async function ensureDbReady() {
  const pool = getDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_entity_state (
      entity TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
async function loadEntity(entity) {
  const pool = getDbPool();
  const result = await pool.query(
    "SELECT payload FROM app_entity_state WHERE entity = $1",
    [entity]
  );
  if (!result.rows.length) return [];
  const payload = result.rows[0].payload;
  if (!Array.isArray(payload)) return [];
  return payload;
}
async function saveEntity(entity, values) {
  const pool = getDbPool();
  const payload = JSON.stringify(Array.from(values));
  await pool.query(
    `
      INSERT INTO app_entity_state (entity, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (entity)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [entity, payload]
  );
}

// server/storage.ts
var PersistentMap = class extends Map {
  constructor(entity, onChange) {
    super();
    this.entity = entity;
    this.onChange = onChange;
  }
  set(key, value) {
    const out = super.set(key, value);
    this.onChange(this.entity);
    return out;
  }
  delete(key) {
    const out = super.delete(key);
    if (out) this.onChange(this.entity);
    return out;
  }
  clear() {
    super.clear();
    this.onChange(this.entity);
  }
  replaceAll(items) {
    super.clear();
    items.forEach((item) => super.set(item.id, item));
  }
  snapshotValues() {
    return Array.from(this.values());
  }
};
var TokenMap = class extends Map {
  constructor(onChange) {
    super();
    this.onChange = onChange;
  }
  set(key, value) {
    const out = super.set(key, value);
    this.onChange();
    return out;
  }
  delete(key) {
    const out = super.delete(key);
    if (out) this.onChange();
    return out;
  }
  clear() {
    super.clear();
    this.onChange();
  }
  replaceAll(tokens) {
    super.clear();
    Object.entries(tokens).forEach(([key, value]) => super.set(key, value));
  }
  snapshot() {
    return Object.fromEntries(this.entries());
  }
};
var DbStorage = class {
  users = new PersistentMap("users", this.schedulePersist.bind(this));
  clients = new PersistentMap("clients", this.schedulePersist.bind(this));
  clinicalProfiles = new PersistentMap("clinicalProfiles", this.schedulePersist.bind(this));
  services = new PersistentMap("services", this.schedulePersist.bind(this));
  packages = new PersistentMap("packages", this.schedulePersist.bind(this));
  laserAreas = new PersistentMap("laserAreas", this.schedulePersist.bind(this));
  clientLaserSelections = new PersistentMap("clientLaserSelections", this.schedulePersist.bind(this));
  clientPackages = new PersistentMap("clientPackages", this.schedulePersist.bind(this));
  appointments = new PersistentMap("appointments", this.schedulePersist.bind(this));
  appointmentServices = new PersistentMap("appointmentServices", this.schedulePersist.bind(this));
  laserSessions = new PersistentMap("laserSessions", this.schedulePersist.bind(this));
  payments = new PersistentMap("payments", this.schedulePersist.bind(this));
  availabilityBlocks = new PersistentMap("availabilityBlocks", this.schedulePersist.bind(this));
  tokens = new TokenMap(this.scheduleTokensPersist.bind(this));
  persistQueue = /* @__PURE__ */ new Set();
  tokensPersistQueued = false;
  flushTimer = null;
  ready;
  constructor() {
    this.ready = this.init();
  }
  async init() {
    await ensureDbReady();
    await Promise.all([
      this.loadCollection("users", this.users),
      this.loadCollection("clients", this.clients),
      this.loadCollection("clinicalProfiles", this.clinicalProfiles),
      this.loadCollection("services", this.services),
      this.loadCollection("packages", this.packages),
      this.loadCollection("laserAreas", this.laserAreas),
      this.loadCollection("clientLaserSelections", this.clientLaserSelections),
      this.loadCollection("clientPackages", this.clientPackages),
      this.loadCollection("appointments", this.appointments),
      this.loadCollection("appointmentServices", this.appointmentServices),
      this.loadCollection("laserSessions", this.laserSessions),
      this.loadCollection("payments", this.payments),
      this.loadCollection("availabilityBlocks", this.availabilityBlocks),
      this.loadTokens()
    ]);
    await this.seedIfNeeded();
  }
  async loadCollection(entity, map) {
    const items = await loadEntity(entity);
    map.replaceAll(items);
  }
  async loadTokens() {
    const rows = await loadEntity("tokens");
    const tokenRecord = {};
    rows.forEach((row) => {
      if (row?.key && row?.value) tokenRecord[row.key] = row.value;
    });
    this.tokens.replaceAll(tokenRecord);
  }
  async seedIfNeeded() {
    if (!this.users.size) {
      const defaultAdminEmail = process.env.ADMIN_EMAIL || "admin@mevakbeautycenter.com";
      const defaultAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
      const adminHash = await import_bcryptjs.default.hash(defaultAdminPassword, 10);
      const admin = {
        id: (0, import_crypto.randomUUID)(),
        name: "Admin",
        email: defaultAdminEmail,
        passwordHash: adminHash,
        role: "ADMIN",
        isActive: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.users.set(admin.id, admin);
    }
    if (!this.laserAreas.size) {
      const laserAreas = [
        { id: (0, import_crypto.randomUUID)(), name: "Cuello", bodySide: "front", bodyRegion: "torso", svgKey: "cuello", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Nuca", bodySide: "back", bodyRegion: "torso", svgKey: "nuca", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Axila", bodySide: "both", bodyRegion: "torso", svgKey: "axila", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Brazos", bodySide: "both", bodyRegion: "arms", svgKey: "brazos", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Abdomen", bodySide: "front", bodyRegion: "torso", svgKey: "abdomen", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "L\xEDnea de abdomen", bodySide: "front", bodyRegion: "torso", svgKey: "linea_abdomen", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Manos", bodySide: "both", bodyRegion: "arms", svgKey: "manos", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Muslo", bodySide: "both", bodyRegion: "legs", svgKey: "muslo", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "\xC1rea del bikini", bodySide: "front", bodyRegion: "pelvis", svgKey: "area_bikini", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Media pierna", bodySide: "both", bodyRegion: "legs", svgKey: "media_pierna", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Pies", bodySide: "both", bodyRegion: "legs", svgKey: "pies", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Espalda", bodySide: "back", bodyRegion: "torso", svgKey: "espalda", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Espalda baja", bodySide: "back", bodyRegion: "torso", svgKey: "espalda_baja", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "L\xEDnea intergl\xFAtea", bodySide: "back", bodyRegion: "pelvis", svgKey: "linea_interglutea", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Gl\xFAteos", bodySide: "back", bodyRegion: "pelvis", svgKey: "gluteos", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Frente", bodySide: "front", bodyRegion: "face", svgKey: "frente", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Entrecejo", bodySide: "front", bodyRegion: "face", svgKey: "entrecejo", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Mejillas", bodySide: "front", bodyRegion: "face", svgKey: "mejillas", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Media cara", bodySide: "front", bodyRegion: "face", svgKey: "media_cara", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Ment\xF3n", bodySide: "front", bodyRegion: "face", svgKey: "menton", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "O\xEDdos", bodySide: "front", bodyRegion: "face", svgKey: "oidos", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Patillas", bodySide: "front", bodyRegion: "face", svgKey: "patillas", isActive: true },
        { id: (0, import_crypto.randomUUID)(), name: "Bigote", bodySide: "front", bodyRegion: "face", svgKey: "bigote", isActive: true }
      ];
      laserAreas.forEach((area) => this.laserAreas.set(area.id, area));
    }
    await this.flushNow();
  }
  schedulePersist(entity) {
    this.persistQueue.add(entity);
    this.scheduleFlush();
  }
  scheduleTokensPersist() {
    this.tokensPersistQueued = true;
    this.scheduleFlush();
  }
  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow().catch((error) => {
        console.error("Error persistiendo estado en DB", error);
      });
    }, 25);
  }
  async flushNow() {
    const entities = Array.from(this.persistQueue);
    this.persistQueue.clear();
    const tasks = [];
    entities.forEach((entity) => {
      switch (entity) {
        case "users":
          tasks.push(saveEntity("users", this.users.snapshotValues()));
          break;
        case "clients":
          tasks.push(saveEntity("clients", this.clients.snapshotValues()));
          break;
        case "clinicalProfiles":
          tasks.push(saveEntity("clinicalProfiles", this.clinicalProfiles.snapshotValues()));
          break;
        case "services":
          tasks.push(saveEntity("services", this.services.snapshotValues()));
          break;
        case "packages":
          tasks.push(saveEntity("packages", this.packages.snapshotValues()));
          break;
        case "laserAreas":
          tasks.push(saveEntity("laserAreas", this.laserAreas.snapshotValues()));
          break;
        case "clientLaserSelections":
          tasks.push(saveEntity("clientLaserSelections", this.clientLaserSelections.snapshotValues()));
          break;
        case "clientPackages":
          tasks.push(saveEntity("clientPackages", this.clientPackages.snapshotValues()));
          break;
        case "appointments":
          tasks.push(saveEntity("appointments", this.appointments.snapshotValues()));
          break;
        case "appointmentServices":
          tasks.push(saveEntity("appointmentServices", this.appointmentServices.snapshotValues()));
          break;
        case "laserSessions":
          tasks.push(saveEntity("laserSessions", this.laserSessions.snapshotValues()));
          break;
        case "payments":
          tasks.push(saveEntity("payments", this.payments.snapshotValues()));
          break;
        case "availabilityBlocks":
          tasks.push(saveEntity("availabilityBlocks", this.availabilityBlocks.snapshotValues()));
          break;
        default:
          break;
      }
    });
    if (this.tokensPersistQueued) {
      this.tokensPersistQueued = false;
      const tokenRows = Object.entries(this.tokens.snapshot()).map(([key, value]) => ({ key, value }));
      tasks.push(saveEntity("tokens", tokenRows.map((row) => ({ id: row.key, ...row }))));
    }
    if (tasks.length) await Promise.all(tasks);
  }
};
var storage = new DbStorage();

// server/routes.ts
function getToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}
function paramId(req) {
  const raw = req.params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return raw || "";
}
function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const session = storage.tokens.get(token);
  if (!session) return res.status(401).json({ message: "Unauthorized" });
  req.userId = session.userId;
  req.userRole = session.role;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
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
function enrichClientPackage(clientPackage) {
  if (!clientPackage) return null;
  const pkg = storage.packages.get(clientPackage.packageId);
  return {
    ...clientPackage,
    package: pkg ? {
      id: pkg.id,
      name: pkg.name,
      totalSessions: pkg.totalSessions,
      price: pkg.price
    } : null
  };
}
async function registerRoutes(app2) {
  await storage.ready;
  app2.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const users = Array.from(storage.users.values());
    const user = users.find((u) => u.email === email && u.isActive);
    if (!user) return res.status(401).json({ message: "Credenciales incorrectas" });
    const valid = await import_bcryptjs2.default.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Credenciales incorrectas" });
    const token = (0, import_crypto2.randomUUID)();
    storage.tokens.set(token, { userId: user.id, role: user.role });
    res.json({ token, id: user.id, name: user.name, email: user.email, role: user.role });
  });
  app2.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = getToken(req);
    storage.tokens.delete(token);
    res.json({ ok: true });
  });
  app2.get("/api/auth/me", requireAuth, (req, res) => {
    const user = storage.users.get(req.userId);
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });
  app2.get("/api/users", requireAuth, (req, res) => {
    const users = Array.from(storage.users.values()).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt
    }));
    res.json(users);
  });
  app2.get("/api/users/staff", requireAuth, (req, res) => {
    const staff = Array.from(storage.users.values()).filter((u) => (u.role === "OWNER" || u.role === "FACIALIST") && u.isActive).map((u) => ({ id: u.id, name: u.name, role: u.role }));
    res.json(staff);
  });
  app2.post("/api/users", requireRole("ADMIN"), async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: "Faltan campos" });
    const exists = Array.from(storage.users.values()).find((u) => u.email === email);
    if (exists) return res.status(400).json({ message: "Email ya registrado" });
    const hash = await import_bcryptjs2.default.hash(password, 10);
    const user = { id: (0, import_crypto2.randomUUID)(), name, email, passwordHash: hash, role, isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    storage.users.set(user.id, user);
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  });
  app2.patch("/api/users/:id", requireRole("ADMIN"), async (req, res) => {
    const user = storage.users.get(paramId(req));
    if (!user) return res.status(404).json({ message: "Not found" });
    const { name, email, role, isActive, password } = req.body;
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (isActive !== void 0) user.isActive = isActive;
    if (password) user.passwordHash = await import_bcryptjs2.default.hash(password, 10);
    storage.users.set(user.id, user);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  });
  app2.get("/api/clients", requireAuth, (req, res) => {
    const { search } = req.query;
    let clients = Array.from(storage.clients.values());
    if (search) {
      const q = search.toLowerCase();
      clients = clients.filter((c) => c.fullName.toLowerCase().includes(q) || c.phone.includes(search));
    }
    clients.sort((a, b) => a.fullName.localeCompare(b.fullName));
    res.json(clients);
  });
  app2.get("/api/clients/:id", requireAuth, (req, res) => {
    const client = storage.clients.get(paramId(req));
    if (!client) return res.status(404).json({ message: "Not found" });
    res.json(client);
  });
  app2.post("/api/clients", requireAuth, (req, res) => {
    const { fullName, phone, email, birthDate, sex, occupation } = req.body;
    if (!fullName || !phone) return res.status(400).json({ message: "fullName y phone son requeridos" });
    const client = { id: (0, import_crypto2.randomUUID)(), fullName, phone, email, birthDate, sex, occupation, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    storage.clients.set(client.id, client);
    res.status(201).json(client);
  });
  app2.patch("/api/clients/:id", requireAuth, (req, res) => {
    const client = storage.clients.get(paramId(req));
    if (!client) return res.status(404).json({ message: "Not found" });
    Object.assign(client, req.body);
    storage.clients.set(client.id, client);
    res.json(client);
  });
  app2.get("/api/clients/:id/clinical", requireRole("ADMIN", "OWNER"), (req, res) => {
    const profiles = Array.from(storage.clinicalProfiles.values());
    const profile = profiles.find((p) => p.clientId === paramId(req));
    res.json(profile || null);
  });
  app2.put("/api/clients/:id/clinical", requireRole("ADMIN", "OWNER"), (req, res) => {
    const clientId = paramId(req);
    const profiles = Array.from(storage.clinicalProfiles.values());
    const profile = profiles.find((p) => p.clientId === clientId);
    if (profile) {
      Object.assign(profile, req.body, { clientId });
      storage.clinicalProfiles.set(profile.id, profile);
      return res.json(profile);
    } else {
      const createdProfile = { id: (0, import_crypto2.randomUUID)(), clientId, ...req.body };
      storage.clinicalProfiles.set(createdProfile.id, createdProfile);
      return res.json(createdProfile);
    }
  });
  app2.get("/api/laser-areas", requireAuth, (req, res) => {
    res.json(Array.from(storage.laserAreas.values()).filter((a) => a.isActive));
  });
  app2.get("/api/clients/:id/laser-areas", requireAuth, (req, res) => {
    res.json(Array.from(storage.clientLaserSelections.values()).filter((s) => s.clientId === paramId(req)));
  });
  app2.put("/api/clients/:id/laser-areas", requireRole("ADMIN", "OWNER"), (req, res) => {
    const clientId = paramId(req);
    const { areaIds } = req.body;
    Array.from(storage.clientLaserSelections.values()).filter((s) => s.clientId === clientId).forEach((s) => storage.clientLaserSelections.delete(s.id));
    const newSelections = areaIds.map((areaId) => {
      const sel = { id: (0, import_crypto2.randomUUID)(), clientId, areaId };
      storage.clientLaserSelections.set(sel.id, sel);
      return sel;
    });
    res.json(newSelections);
  });
  app2.get("/api/clients/:id/packages", requireAuth, (req, res) => {
    const clientId = paramId(req);
    const packages = Array.from(storage.clientPackages.values()).filter((p) => p.clientId === clientId).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((p) => enrichClientPackage(p));
    res.json(packages);
  });
  app2.post("/api/clients/:id/packages", requireRole("ADMIN", "OWNER"), (req, res) => {
    const clientId = paramId(req);
    const client = storage.clients.get(clientId);
    if (!client) return res.status(404).json({ message: "Cliente no encontrado" });
    const pkg = storage.packages.get(req.body.packageId);
    if (!pkg || !pkg.isActive) return res.status(404).json({ message: "Paquete no encontrado" });
    const cp = { id: (0, import_crypto2.randomUUID)(), clientId, packageId: pkg.id, totalSessions: pkg.totalSessions, usedSessions: 0, remainingSessions: pkg.totalSessions, startDate: (/* @__PURE__ */ new Date()).toISOString(), status: "ACTIVE" };
    storage.clientPackages.set(cp.id, cp);
    res.status(201).json(enrichClientPackage(cp));
  });
  app2.get("/api/services", requireAuth, (req, res) => {
    const { type } = req.query;
    let services = Array.from(storage.services.values()).filter((s) => s.isActive);
    if (type) services = services.filter((s) => s.type === type);
    res.json(services);
  });
  app2.post("/api/services", requireRole("ADMIN"), (req, res) => {
    const { name, type, price } = req.body;
    if (!name || !type || price === void 0) return res.status(400).json({ message: "Faltan campos" });
    const svc = { id: (0, import_crypto2.randomUUID)(), name, type, price: Number(price), isActive: true };
    storage.services.set(svc.id, svc);
    res.status(201).json(svc);
  });
  app2.patch("/api/services/:id", requireRole("ADMIN"), (req, res) => {
    const svc = storage.services.get(paramId(req));
    if (!svc) return res.status(404).json({ message: "Not found" });
    Object.assign(svc, req.body);
    storage.services.set(svc.id, svc);
    res.json(svc);
  });
  app2.get("/api/packages", requireAuth, (req, res) => {
    res.json(Array.from(storage.packages.values()).filter((p) => p.isActive));
  });
  app2.post("/api/packages", requireRole("ADMIN"), (req, res) => {
    const { name, totalSessions, price } = req.body;
    if (!name || !totalSessions || price === void 0) return res.status(400).json({ message: "Faltan campos" });
    const pkg = { id: (0, import_crypto2.randomUUID)(), name, type: "LASER", totalSessions: Number(totalSessions), price: Number(price), isActive: true };
    storage.packages.set(pkg.id, pkg);
    res.status(201).json(pkg);
  });
  app2.get("/api/appointments", requireAuth, (req, res) => {
    const { date, staffId, clientId } = req.query;
    let appts = Array.from(storage.appointments.values());
    if (date) appts = appts.filter((a) => a.dateTimeStart.startsWith(date));
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
  app2.get("/api/appointments/:id", requireAuth, (req, res) => {
    const appt = storage.appointments.get(paramId(req));
    if (!appt) return res.status(404).json({ message: "Not found" });
    const client = storage.clients.get(appt.clientId);
    const staff = storage.users.get(appt.staffId);
    const services = Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === appt.id).map((s) => storage.services.get(s.serviceId)).filter(Boolean);
    const payment = Array.from(storage.payments.values()).find((p) => p.appointmentId === appt.id);
    const laserSession = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === appt.id);
    const clientPackage = enrichClientPackage(
      laserSession?.clientPackageId ? storage.clientPackages.get(laserSession.clientPackageId) : null
    );
    res.json({ ...appt, client, staff: staff ? { id: staff.id, name: staff.name, role: staff.role } : null, services, payment, laserSession, clientPackage });
  });
  app2.post("/api/appointments", requireAuth, (req, res) => {
    const { dateTimeStart, dateTimeEnd, clientId, staffId, type, notes } = req.body;
    if (!dateTimeStart || !dateTimeEnd || !clientId || !staffId || !type) return res.status(400).json({ message: "Faltan campos" });
    const conflict = Array.from(storage.appointments.values()).find((a) => {
      if (a.staffId !== staffId || a.status === "CANCELLED") return false;
      const start = new Date(dateTimeStart).getTime();
      const end = new Date(dateTimeEnd).getTime();
      const aStart = new Date(a.dateTimeStart).getTime();
      const aEnd = new Date(a.dateTimeEnd).getTime();
      return start < aEnd && end > aStart;
    });
    if (conflict) return res.status(409).json({ message: "Conflicto de horario con otra cita" });
    const block = Array.from(storage.availabilityBlocks.values()).find((b) => {
      if (b.userId !== staffId) return false;
      const start = new Date(dateTimeStart).getTime();
      const end = new Date(dateTimeEnd).getTime();
      const bStart = new Date(b.startDateTime).getTime();
      const bEnd = new Date(b.endDateTime).getTime();
      return start < bEnd && end > bStart;
    });
    if (block) return res.status(409).json({ message: "El staff tiene un bloqueo en ese horario" });
    const appt = { id: (0, import_crypto2.randomUUID)(), dateTimeStart, dateTimeEnd, clientId, staffId, type, status: "SCHEDULED", notes };
    storage.appointments.set(appt.id, appt);
    res.status(201).json(appt);
  });
  app2.patch("/api/appointments/:id", requireAuth, (req, res) => {
    const appt = storage.appointments.get(paramId(req));
    if (!appt) return res.status(404).json({ message: "Not found" });
    const { dateTimeStart, dateTimeEnd, staffId, status, notes, clientId, type } = req.body;
    if ((dateTimeStart || dateTimeEnd) && (staffId || appt.staffId)) {
      const checkStaff = staffId || appt.staffId;
      const checkStart = dateTimeStart || appt.dateTimeStart;
      const checkEnd = dateTimeEnd || appt.dateTimeEnd;
      const conflict = Array.from(storage.appointments.values()).find((a) => {
        if (a.id === appt.id || a.staffId !== checkStaff || a.status === "CANCELLED") return false;
        const start = new Date(checkStart).getTime();
        const end = new Date(checkEnd).getTime();
        const aStart = new Date(a.dateTimeStart).getTime();
        const aEnd = new Date(a.dateTimeEnd).getTime();
        return start < aEnd && end > aStart;
      });
      if (conflict) return res.status(409).json({ message: "Conflicto de horario con otra cita" });
    }
    if (dateTimeStart) appt.dateTimeStart = dateTimeStart;
    if (dateTimeEnd) appt.dateTimeEnd = dateTimeEnd;
    if (staffId) appt.staffId = staffId;
    if (status) appt.status = status;
    if (notes !== void 0) appt.notes = notes;
    if (clientId) appt.clientId = clientId;
    if (type) appt.type = type;
    storage.appointments.set(appt.id, appt);
    res.json(appt);
  });
  app2.put("/api/appointments/:id/services", requireAuth, (req, res) => {
    const appointmentId = paramId(req);
    const { serviceIds } = req.body;
    Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === appointmentId).forEach((s) => storage.appointmentServices.delete(s.id));
    const newSvcs = serviceIds.map((serviceId) => {
      const svc = { id: (0, import_crypto2.randomUUID)(), appointmentId, serviceId };
      storage.appointmentServices.set(svc.id, svc);
      return svc;
    });
    res.json(newSvcs);
  });
  app2.get("/api/appointments/:id/laser-session", requireAuth, (req, res) => {
    const session = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === paramId(req));
    res.json(session || null);
  });
  app2.put("/api/appointments/:id/laser-session", requireRole("ADMIN", "OWNER"), (req, res) => {
    const appointmentId = paramId(req);
    const existing = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === appointmentId);
    if (existing) {
      Object.assign(existing, req.body, { appointmentId });
      storage.laserSessions.set(existing.id, existing);
      res.json(existing);
    } else {
      const session = { id: (0, import_crypto2.randomUUID)(), appointmentId, ...req.body };
      storage.laserSessions.set(session.id, session);
      res.json(session);
    }
  });
  app2.get("/api/appointments/:id/payment", requireAuth, (req, res) => {
    res.json(Array.from(storage.payments.values()).find((p) => p.appointmentId === paramId(req)) || null);
  });
  app2.post("/api/appointments/:id/payment", requireAuth, (req, res) => {
    const appointmentId = paramId(req);
    const { method, totalAmount } = req.body;
    const appt = storage.appointments.get(appointmentId);
    if (!appt) return res.status(404).json({ message: "Cita no encontrada" });
    const existing = Array.from(storage.payments.values()).find((p) => p.appointmentId === appointmentId);
    if (existing) return res.status(409).json({ message: "Ya existe un pago" });
    const selectedClientPackageId = req.body.clientPackageId;
    if (method === "INCLUDED" && !selectedClientPackageId) {
      return res.status(400).json({ message: "Debes seleccionar un paquete para pago incluido" });
    }
    if (selectedClientPackageId && appt.type !== "LASER") {
      return res.status(400).json({ message: "Solo las citas l\xE1ser pueden usar paquete" });
    }
    let consumedSessionNumber;
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
    const resolvedMethod = selectedClientPackageId ? "INCLUDED" : method;
    if (!["CASH", "CARD", "INCLUDED"].includes(resolvedMethod)) {
      return res.status(400).json({ message: "M\xE9todo de pago inv\xE1lido" });
    }
    const total = resolvedMethod === "INCLUDED" ? 0 : Number(totalAmount) || 0;
    const isFacial = appt.type === "FACIAL";
    const payment = { id: (0, import_crypto2.randomUUID)(), appointmentId, method: resolvedMethod, totalAmount: total, ownerNetAmount: isFacial ? Math.floor(total / 2) : total, facialistNetAmount: isFacial ? Math.ceil(total / 2) : 0, facialistPaidFlag: false, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    storage.payments.set(payment.id, payment);
    appt.status = "DONE";
    storage.appointments.set(appt.id, appt);
    if (appt.type === "LASER") {
      const clientSelectionAreaIds = Array.from(storage.clientLaserSelections.values()).filter((selection) => selection.clientId === appt.clientId).map((selection) => selection.areaId);
      const areasSnapshotJson = clientSelectionAreaIds.map((areaId) => storage.laserAreas.get(areaId)?.svgKey).filter(Boolean);
      const existingSession = Array.from(storage.laserSessions.values()).find((session) => session.appointmentId === appt.id);
      if (existingSession) {
        existingSession.areasSnapshotJson = areasSnapshotJson;
        if (selectedClientPackageId) existingSession.clientPackageId = selectedClientPackageId;
        if (consumedSessionNumber !== void 0) existingSession.sessionNumber = consumedSessionNumber;
        storage.laserSessions.set(existingSession.id, existingSession);
      } else {
        const session = {
          id: (0, import_crypto2.randomUUID)(),
          appointmentId: appt.id,
          clientPackageId: selectedClientPackageId,
          sessionNumber: consumedSessionNumber,
          areasSnapshotJson
        };
        storage.laserSessions.set(session.id, session);
      }
    }
    res.status(201).json(payment);
  });
  app2.patch("/api/payments/:id/facialist-paid", requireRole("ADMIN", "OWNER"), (req, res) => {
    const payment = storage.payments.get(paramId(req));
    if (!payment) return res.status(404).json({ message: "Not found" });
    payment.facialistPaidFlag = req.body.paid ?? true;
    storage.payments.set(payment.id, payment);
    res.json(payment);
  });
  app2.get("/api/payments/pending-facialist", requireRole("ADMIN", "OWNER"), (req, res) => {
    const pending = Array.from(storage.payments.values()).filter((p) => !p.facialistPaidFlag && p.facialistNetAmount > 0).map((p) => {
      const appt = storage.appointments.get(p.appointmentId);
      const staff = appt ? storage.users.get(appt.staffId) : null;
      const client = appt ? storage.clients.get(appt.clientId) : null;
      return { ...p, appointment: appt, staff, client };
    });
    res.json(pending);
  });
  app2.get("/api/reports/income", requireRole("ADMIN", "OWNER"), (req, res) => {
    const { month, year } = req.query;
    let payments = Array.from(storage.payments.values());
    if (month && year) {
      payments = payments.filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() + 1 === Number(month) && d.getFullYear() === Number(year);
      });
    }
    const total = payments.reduce((s, p) => s + p.totalAmount, 0);
    const ownerNet = payments.reduce((s, p) => s + p.ownerNetAmount, 0);
    const facialistNet = payments.reduce((s, p) => s + p.facialistNetAmount, 0);
    res.json({ total, ownerNet, facialistNet, count: payments.length });
  });
  app2.get("/api/blocks", requireAuth, (req, res) => {
    const userId = req.userId;
    const role = req.userRole;
    let blocks = Array.from(storage.availabilityBlocks.values());
    if (role !== "ADMIN") blocks = blocks.filter((b) => b.userId === userId);
    const enriched = blocks.map((b) => {
      const user = storage.users.get(b.userId);
      return { ...b, user: user ? { id: user.id, name: user.name } : null };
    });
    res.json(enriched);
  });
  app2.post("/api/blocks", requireRole("ADMIN", "OWNER", "FACIALIST"), (req, res) => {
    const { startDateTime, endDateTime, reason } = req.body;
    if (!startDateTime || !endDateTime) return res.status(400).json({ message: "Faltan fechas" });
    const start = new Date(startDateTime).getTime();
    const end = new Date(endDateTime).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return res.status(400).json({ message: "Formato de fecha inv\xE1lido" });
    if (end <= start) return res.status(400).json({ message: "La fecha/hora de fin debe ser mayor a inicio" });
    const block = { id: (0, import_crypto2.randomUUID)(), userId: req.userId, startDateTime, endDateTime, reason };
    storage.availabilityBlocks.set(block.id, block);
    res.status(201).json(block);
  });
  app2.delete("/api/blocks/:id", requireRole("ADMIN", "OWNER", "FACIALIST"), (req, res) => {
    const blockId = paramId(req);
    const block = storage.availabilityBlocks.get(blockId);
    if (!block) return res.status(404).json({ message: "Not found" });
    if (block.userId !== req.userId && req.userRole !== "ADMIN") return res.status(403).json({ message: "No puedes eliminar bloqueos de otro usuario" });
    storage.availabilityBlocks.delete(blockId);
    res.json({ ok: true });
  });
  app2.get("/api/clients/:id/appointments", requireAuth, (req, res) => {
    const appts = Array.from(storage.appointments.values()).filter((a) => a.clientId === paramId(req)).sort((a, b) => b.dateTimeStart.localeCompare(a.dateTimeStart)).map((a) => {
      const staff = storage.users.get(a.staffId);
      const services = Array.from(storage.appointmentServices.values()).filter((s) => s.appointmentId === a.id).map((s) => storage.services.get(s.serviceId)).filter(Boolean);
      const payment = Array.from(storage.payments.values()).find((p) => p.appointmentId === a.id);
      const laserSession = Array.from(storage.laserSessions.values()).find((s) => s.appointmentId === a.id) || null;
      const clientPackage = enrichClientPackage(
        laserSession?.clientPackageId ? storage.clientPackages.get(laserSession.clientPackageId) : null
      );
      return { ...a, staff: staff ? { id: staff.id, name: staff.name } : null, services, payment, laserSession, clientPackage };
    });
    res.json(appts);
  });
  const httpServer = (0, import_node_http.createServer)(app2);
  return httpServer;
}

// server/index.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var app = (0, import_express.default)();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((originValue) => {
        const origin2 = originValue.trim();
        if (!origin2) return;
        origins.add(origin2);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:") || origin?.startsWith("https://localhost:") || origin?.startsWith("https://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    import_express.default.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(import_express.default.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function configureStaticWeb(app2) {
  const assetsPath = path.resolve(process.cwd(), "assets");
  const staticBuildPath = path.resolve(process.cwd(), "static-build");
  const indexPath = path.join(staticBuildPath, "index.html");
  app2.use("/assets", import_express.default.static(assetsPath));
  if (fs.existsSync(staticBuildPath)) {
    app2.use(import_express.default.static(staticBuildPath));
  }
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (!fs.existsSync(indexPath)) {
      return res.status(503).json({
        message: "No se encontr\xF3 static-build/index.html. Ejecuta npm run expo:static:build antes de iniciar server:prod"
      });
    }
    return res.sendFile(indexPath);
  });
  log("Static web routing enabled from static-build/");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureStaticWeb(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
