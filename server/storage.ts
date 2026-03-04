import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { ensureDbReady, loadEntity, saveEntity } from "./db";

export type Role = "ADMIN" | "OWNER" | "RECEPTION" | "FACIALIST";
export type AppointmentType = "FACIAL" | "LASER";
export type AppointmentStatus = "SCHEDULED" | "ARRIVED" | "NO_SHOW" | "DONE" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "INCLUDED";
export type PackageStatus = "ACTIVE" | "FINISHED" | "PAUSED";
export type Sex = "M" | "F";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Client {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  birthDate?: string;
  sex?: Sex;
  occupation?: string;
  createdAt: string;
}

export interface ClinicalProfile {
  id: string;
  clientId: string;
  allergiesFlag: boolean;
  allergiesText?: string;
  conditionsJson: Record<string, boolean | string>;
  medsText?: string;
  surgeriesText?: string;
  phototype?: number;
  eyeColor?: string;
  hairColor?: string;
}

export interface Service {
  id: string;
  name: string;
  type: AppointmentType;
  price: number;
  isActive: boolean;
}

export interface Package {
  id: string;
  name: string;
  type: "LASER";
  totalSessions: number;
  price: number;
  isActive: boolean;
}

export interface LaserArea {
  id: string;
  name: string;
  bodySide: "front" | "back" | "both";
  bodyRegion?: string;
  svgKey: string;
  isActive: boolean;
}

export interface ClientLaserSelection {
  id: string;
  clientId: string;
  areaId: string;
}

export interface ClientPackage {
  id: string;
  clientId: string;
  packageId: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  startDate: string;
  status: PackageStatus;
}

export interface Appointment {
  id: string;
  dateTimeStart: string;
  dateTimeEnd: string;
  clientId: string;
  staffId: string;
  type: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
}

export interface AppointmentService {
  id: string;
  appointmentId: string;
  serviceId: string;
}

export interface LaserSession {
  id: string;
  appointmentId: string;
  clientPackageId?: string;
  sessionNumber?: number;
  areasSnapshotJson?: string[];
  powerByArea?: Record<string, string | number>;
  notes?: string;
}

export interface Payment {
  id: string;
  appointmentId: string;
  method: PaymentMethod;
  totalAmount: number;
  ownerNetAmount: number;
  facialistNetAmount: number;
  facialistPaidFlag: boolean;
  createdAt: string;
}

export interface AvailabilityBlock {
  id: string;
  userId: string;
  startDateTime: string;
  endDateTime: string;
  reason?: string;
}

export interface AuthToken {
  userId: string;
  role: Role;
}

class PersistentMap<T extends { id: string }> extends Map<string, T> {
  constructor(
    private readonly entity: string,
    private readonly onChange: (entity: string) => void,
  ) {
    super();
  }

  set(key: string, value: T): this {
    const out = super.set(key, value);
    this.onChange(this.entity);
    return out;
  }

  delete(key: string): boolean {
    const out = super.delete(key);
    if (out) this.onChange(this.entity);
    return out;
  }

  clear(): void {
    super.clear();
    this.onChange(this.entity);
  }

  replaceAll(items: T[]) {
    super.clear();
    items.forEach((item) => super.set(item.id, item));
  }

  snapshotValues(): T[] {
    return Array.from(this.values());
  }
}

class TokenMap extends Map<string, AuthToken> {
  constructor(private readonly onChange: () => void) {
    super();
  }

  set(key: string, value: AuthToken): this {
    const out = super.set(key, value);
    this.onChange();
    return out;
  }

  delete(key: string): boolean {
    const out = super.delete(key);
    if (out) this.onChange();
    return out;
  }

  clear(): void {
    super.clear();
    this.onChange();
  }

  replaceAll(tokens: Record<string, AuthToken>) {
    super.clear();
    Object.entries(tokens).forEach(([key, value]) => super.set(key, value));
  }

  snapshot(): Record<string, AuthToken> {
    return Object.fromEntries(this.entries());
  }
}

class DbStorage {
  users = new PersistentMap<User>("users", this.schedulePersist.bind(this));
  clients = new PersistentMap<Client>("clients", this.schedulePersist.bind(this));
  clinicalProfiles = new PersistentMap<ClinicalProfile>("clinicalProfiles", this.schedulePersist.bind(this));
  services = new PersistentMap<Service>("services", this.schedulePersist.bind(this));
  packages = new PersistentMap<Package>("packages", this.schedulePersist.bind(this));
  laserAreas = new PersistentMap<LaserArea>("laserAreas", this.schedulePersist.bind(this));
  clientLaserSelections = new PersistentMap<ClientLaserSelection>("clientLaserSelections", this.schedulePersist.bind(this));
  clientPackages = new PersistentMap<ClientPackage>("clientPackages", this.schedulePersist.bind(this));
  appointments = new PersistentMap<Appointment>("appointments", this.schedulePersist.bind(this));
  appointmentServices = new PersistentMap<AppointmentService>("appointmentServices", this.schedulePersist.bind(this));
  laserSessions = new PersistentMap<LaserSession>("laserSessions", this.schedulePersist.bind(this));
  payments = new PersistentMap<Payment>("payments", this.schedulePersist.bind(this));
  availabilityBlocks = new PersistentMap<AvailabilityBlock>("availabilityBlocks", this.schedulePersist.bind(this));
  tokens = new TokenMap(this.scheduleTokensPersist.bind(this));

  private persistQueue = new Set<string>();
  private tokensPersistQueued = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
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
      this.loadTokens(),
    ]);

    await this.seedIfNeeded();
  }

  private async loadCollection<T extends { id: string }>(entity: string, map: PersistentMap<T>) {
    const items = await loadEntity<T>(entity);
    map.replaceAll(items);
  }

  private async loadTokens() {
    const rows = await loadEntity<{ key: string; value: AuthToken }>("tokens");
    const tokenRecord: Record<string, AuthToken> = {};
    rows.forEach((row) => {
      if (row?.key && row?.value) tokenRecord[row.key] = row.value;
    });
    this.tokens.replaceAll(tokenRecord);
  }

  private async seedIfNeeded() {
    if (!this.users.size) {
      const defaultAdminEmail = process.env.ADMIN_EMAIL || "admin@mevakbeautycenter.com";
      const defaultAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
      const adminHash = await bcrypt.hash(defaultAdminPassword, 10);
      const admin: User = {
        id: randomUUID(),
        name: "Admin",
        email: defaultAdminEmail,
        passwordHash: adminHash,
        role: "ADMIN",
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      this.users.set(admin.id, admin);
    }

    if (!this.laserAreas.size) {
      const laserAreas: LaserArea[] = [
        { id: randomUUID(), name: "Cuello", bodySide: "front", bodyRegion: "torso", svgKey: "cuello", isActive: true },
        { id: randomUUID(), name: "Nuca", bodySide: "back", bodyRegion: "torso", svgKey: "nuca", isActive: true },
        { id: randomUUID(), name: "Axila", bodySide: "both", bodyRegion: "torso", svgKey: "axila", isActive: true },
        { id: randomUUID(), name: "Brazos", bodySide: "both", bodyRegion: "arms", svgKey: "brazos", isActive: true },
        { id: randomUUID(), name: "Abdomen", bodySide: "front", bodyRegion: "torso", svgKey: "abdomen", isActive: true },
        { id: randomUUID(), name: "Línea de abdomen", bodySide: "front", bodyRegion: "torso", svgKey: "linea_abdomen", isActive: true },
        { id: randomUUID(), name: "Manos", bodySide: "both", bodyRegion: "arms", svgKey: "manos", isActive: true },
        { id: randomUUID(), name: "Muslo", bodySide: "both", bodyRegion: "legs", svgKey: "muslo", isActive: true },
        { id: randomUUID(), name: "Área del bikini", bodySide: "front", bodyRegion: "pelvis", svgKey: "area_bikini", isActive: true },
        { id: randomUUID(), name: "Media pierna", bodySide: "both", bodyRegion: "legs", svgKey: "media_pierna", isActive: true },
        { id: randomUUID(), name: "Pies", bodySide: "both", bodyRegion: "legs", svgKey: "pies", isActive: true },
        { id: randomUUID(), name: "Espalda", bodySide: "back", bodyRegion: "torso", svgKey: "espalda", isActive: true },
        { id: randomUUID(), name: "Espalda baja", bodySide: "back", bodyRegion: "torso", svgKey: "espalda_baja", isActive: true },
        { id: randomUUID(), name: "Línea interglútea", bodySide: "back", bodyRegion: "pelvis", svgKey: "linea_interglutea", isActive: true },
        { id: randomUUID(), name: "Glúteos", bodySide: "back", bodyRegion: "pelvis", svgKey: "gluteos", isActive: true },
        { id: randomUUID(), name: "Frente", bodySide: "front", bodyRegion: "face", svgKey: "frente", isActive: true },
        { id: randomUUID(), name: "Entrecejo", bodySide: "front", bodyRegion: "face", svgKey: "entrecejo", isActive: true },
        { id: randomUUID(), name: "Mejillas", bodySide: "front", bodyRegion: "face", svgKey: "mejillas", isActive: true },
        { id: randomUUID(), name: "Media cara", bodySide: "front", bodyRegion: "face", svgKey: "media_cara", isActive: true },
        { id: randomUUID(), name: "Mentón", bodySide: "front", bodyRegion: "face", svgKey: "menton", isActive: true },
        { id: randomUUID(), name: "Oídos", bodySide: "front", bodyRegion: "face", svgKey: "oidos", isActive: true },
        { id: randomUUID(), name: "Patillas", bodySide: "front", bodyRegion: "face", svgKey: "patillas", isActive: true },
        { id: randomUUID(), name: "Bigote", bodySide: "front", bodyRegion: "face", svgKey: "bigote", isActive: true },
      ];
      laserAreas.forEach((area) => this.laserAreas.set(area.id, area));
    }

    await this.flushNow();
  }

  private schedulePersist(entity: string) {
    this.persistQueue.add(entity);
    this.scheduleFlush();
  }

  private scheduleTokensPersist() {
    this.tokensPersistQueued = true;
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow().catch((error) => {
        console.error("Error persistiendo estado en DB", error);
      });
    }, 25);
  }

  private async flushNow() {
    const entities = Array.from(this.persistQueue);
    this.persistQueue.clear();

    const tasks: Promise<unknown>[] = [];
    entities.forEach((entity) => {
      switch (entity) {
        case "users": tasks.push(saveEntity("users", this.users.snapshotValues())); break;
        case "clients": tasks.push(saveEntity("clients", this.clients.snapshotValues())); break;
        case "clinicalProfiles": tasks.push(saveEntity("clinicalProfiles", this.clinicalProfiles.snapshotValues())); break;
        case "services": tasks.push(saveEntity("services", this.services.snapshotValues())); break;
        case "packages": tasks.push(saveEntity("packages", this.packages.snapshotValues())); break;
        case "laserAreas": tasks.push(saveEntity("laserAreas", this.laserAreas.snapshotValues())); break;
        case "clientLaserSelections": tasks.push(saveEntity("clientLaserSelections", this.clientLaserSelections.snapshotValues())); break;
        case "clientPackages": tasks.push(saveEntity("clientPackages", this.clientPackages.snapshotValues())); break;
        case "appointments": tasks.push(saveEntity("appointments", this.appointments.snapshotValues())); break;
        case "appointmentServices": tasks.push(saveEntity("appointmentServices", this.appointmentServices.snapshotValues())); break;
        case "laserSessions": tasks.push(saveEntity("laserSessions", this.laserSessions.snapshotValues())); break;
        case "payments": tasks.push(saveEntity("payments", this.payments.snapshotValues())); break;
        case "availabilityBlocks": tasks.push(saveEntity("availabilityBlocks", this.availabilityBlocks.snapshotValues())); break;
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
}

export const storage = new DbStorage();
