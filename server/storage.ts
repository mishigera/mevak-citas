import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

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

class MemStorage {
  users: Map<string, User> = new Map();
  clients: Map<string, Client> = new Map();
  clinicalProfiles: Map<string, ClinicalProfile> = new Map();
  services: Map<string, Service> = new Map();
  packages: Map<string, Package> = new Map();
  laserAreas: Map<string, LaserArea> = new Map();
  clientLaserSelections: Map<string, ClientLaserSelection> = new Map();
  clientPackages: Map<string, ClientPackage> = new Map();
  appointments: Map<string, Appointment> = new Map();
  appointmentServices: Map<string, AppointmentService> = new Map();
  laserSessions: Map<string, LaserSession> = new Map();
  payments: Map<string, Payment> = new Map();
  availabilityBlocks: Map<string, AvailabilityBlock> = new Map();
  tokens: Map<string, AuthToken> = new Map();

  constructor() {
    this.seed();
  }

  private async seed() {
    const adminHash = await bcrypt.hash("admin123", 10);
    const ownerHash = await bcrypt.hash("owner123", 10);
    const recepHash = await bcrypt.hash("recep123", 10);
    const facHash = await bcrypt.hash("fac123", 10);

    const admin: User = { id: randomUUID(), name: "Admin", email: "admin@beauty.com", passwordHash: adminHash, role: "ADMIN", isActive: true, createdAt: new Date().toISOString() };
    const owner: User = { id: randomUUID(), name: "Laura (Laserista)", email: "owner@beauty.com", passwordHash: ownerHash, role: "OWNER", isActive: true, createdAt: new Date().toISOString() };
    const recep: User = { id: randomUUID(), name: "Sofia (Recepción)", email: "recep@beauty.com", passwordHash: recepHash, role: "RECEPTION", isActive: true, createdAt: new Date().toISOString() };
    const fac: User = { id: randomUUID(), name: "Valeria (Facialista)", email: "fac@beauty.com", passwordHash: facHash, role: "FACIALIST", isActive: true, createdAt: new Date().toISOString() };

    [admin, owner, recep, fac].forEach(u => this.users.set(u.id, u));

    const services: Service[] = [
      { id: randomUUID(), name: "Limpieza Facial Profunda", type: "FACIAL", price: 600, isActive: true },
      { id: randomUUID(), name: "Tratamiento Hidratante", type: "FACIAL", price: 500, isActive: true },
      { id: randomUUID(), name: "Peeling Químico", type: "FACIAL", price: 800, isActive: true },
      { id: randomUUID(), name: "Microdermoabrasión", type: "FACIAL", price: 750, isActive: true },
      { id: randomUUID(), name: "Radiofrecuencia Facial", type: "FACIAL", price: 900, isActive: true },
      { id: randomUUID(), name: "Sesión Láser Suelta", type: "LASER", price: 400, isActive: true },
    ];
    services.forEach(s => this.services.set(s.id, s));

    const pkg: Package = { id: randomUUID(), name: "Paquete Láser 10 Sesiones", type: "LASER", totalSessions: 10, price: 3500, isActive: true };
    this.packages.set(pkg.id, pkg);

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
    laserAreas.forEach(a => this.laserAreas.set(a.id, a));

    const clients: Client[] = [
      { id: randomUUID(), fullName: "María García", phone: "555-1234", email: "maria@example.com", birthDate: "1990-05-15", sex: "F", occupation: "Maestra", createdAt: new Date().toISOString() },
      { id: randomUUID(), fullName: "Ana López", phone: "555-5678", email: "ana@example.com", birthDate: "1985-08-22", sex: "F", createdAt: new Date().toISOString() },
      { id: randomUUID(), fullName: "Carolina Martínez", phone: "555-9012", birthDate: "1995-03-10", sex: "F", occupation: "Médico", createdAt: new Date().toISOString() },
    ];
    clients.forEach(c => this.clients.set(c.id, c));

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const appt1: Appointment = { id: randomUUID(), dateTimeStart: `${todayStr}T09:00:00.000Z`, dateTimeEnd: `${todayStr}T10:00:00.000Z`, clientId: clients[0].id, staffId: fac.id, type: "FACIAL", status: "SCHEDULED", notes: "Acné en frente" };
    const appt2: Appointment = { id: randomUUID(), dateTimeStart: `${todayStr}T11:00:00.000Z`, dateTimeEnd: `${todayStr}T12:00:00.000Z`, clientId: clients[1].id, staffId: owner.id, type: "LASER", status: "SCHEDULED" };
    const appt3: Appointment = { id: randomUUID(), dateTimeStart: `${todayStr}T13:00:00.000Z`, dateTimeEnd: `${todayStr}T14:00:00.000Z`, clientId: clients[2].id, staffId: fac.id, type: "FACIAL", status: "ARRIVED" };
    [appt1, appt2, appt3].forEach(a => this.appointments.set(a.id, a));

    const appSvc1: AppointmentService = { id: randomUUID(), appointmentId: appt1.id, serviceId: services[0].id };
    this.appointmentServices.set(appSvc1.id, appSvc1);

    const cp: ClientPackage = { id: randomUUID(), clientId: clients[1].id, packageId: pkg.id, totalSessions: 10, usedSessions: 3, remainingSessions: 7, startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), status: "ACTIVE" };
    this.clientPackages.set(cp.id, cp);

    const ls: LaserSession = {
      id: randomUUID(),
      appointmentId: appt2.id,
      clientPackageId: cp.id,
      sessionNumber: 4,
      areasSnapshotJson: ["axila", "media_pierna", "bigote"],
    };
    this.laserSessions.set(ls.id, ls);

    const clinical: ClinicalProfile = { id: randomUUID(), clientId: clients[1].id, allergiesFlag: false, conditionsJson: { diabetes: false, hipertension: true, renales: false, cardiacas: false, circulatorias: false, digestivas: false, pulmonares: false, endocrinas: false, neurologicas: false, hematologicas: false, dermatologicas: false, otrosText: "" }, phototype: 2, eyeColor: "café", hairColor: "negro" };
    this.clinicalProfiles.set(clinical.id, clinical);
  }
}

export const storage = new MemStorage();
