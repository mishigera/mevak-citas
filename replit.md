# Beauty Center - Sistema de Gestión

## Overview
A full-featured beauty center management system built as a mobile-first app (Expo + Express). Supports appointment scheduling, client management, clinical histories, laser area tracking, package control, and payment management with multi-role access.

## Architecture
- **Frontend**: Expo Router (React Native), TypeScript, Nunito font, custom rose/pink theme
- **Backend**: Express.js with session-based auth (express-session + bcryptjs)
- **State Management**: React Query for server state, React Context for auth
- **Storage**: In-memory storage (MemStorage) — ready to migrate to Postgres

## Roles
- **ADMIN**: Full access, user management, services, reports
- **OWNER** (Laserista): Calendar, laser appointments, package tracking, pending facialist payments
- **RECEPTION**: Calendar, create appointments/clients, no clinical profile access
- **FACIALIST**: Calendar, facial appointments, own availability blocks

## Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@beauty.com | admin123 |
| Owner/Laserista | owner@beauty.com | owner123 |
| Recepcionista | recep@beauty.com | recep123 |
| Facialista | fac@beauty.com | fac123 |

## Key Features
- Login with role-based access
- Today's appointments dashboard
- Week calendar view with day detail
- Client list with search, client detail (4 tabs)
- Clinical profile with phototype selector (6 skin types)
- Appointment detail: facial (service selection) and laser (package tracking)
- Payment registration (cash/card/included) with 50/50 split for facials
- Pending facialist payments management
- Availability blocks creation/deletion
- Admin: services, packages, users management
- Income reports by month

## Project Structure
```
app/
  _layout.tsx          # Root layout with fonts, auth, QueryClient
  index.tsx            # Auth redirect
  login.tsx            # Login screen
  (tabs)/
    _layout.tsx        # Liquid glass / BlurView tab bar
    index.tsx          # Today's appointments (home)
    calendar.tsx       # Week calendar + day appointments
    clients.tsx        # Client search and list
    more.tsx           # Profile, settings, admin links
  appointment/
    [id].tsx           # Appointment detail (facial & laser flows)
    new.tsx            # Create appointment
  client/
    [id].tsx           # Client detail (4 tabs)
    new.tsx            # Create client
  blocks.tsx           # Availability blocks
  admin/
    payments.tsx       # Pending facialist payments
    reports.tsx        # Monthly income reports
    services.tsx       # Services catalog CRUD
    packages.tsx       # Laser packages CRUD
    users.tsx          # User management

server/
  index.ts             # Express app setup
  routes.ts            # All API routes + session auth
  storage.ts           # In-memory storage with seed data

contexts/
  auth.tsx             # Auth context with role helpers
constants/
  colors.ts            # Beauty center rose/pink theme
```

## Running
- Backend: `npm run server:dev` (port 5000)
- Frontend: `npm run expo:dev` (port 8081)
