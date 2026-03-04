# Mevak Beauty Center

Primera versión productiva con backend en Docker + PostgreSQL.

## Qué cambió para producción

- Persistencia de toda la app en PostgreSQL (no en memoria).
- Seed inicial mínimo:
  - Solo usuario `ADMIN`.
  - Catálogo de áreas láser para el monito.
- Login sin cuentas demo visibles.
- Flujo de logout estabilizado.
- Branding/íconos actualizado a **Mevak Beauty Center**.

## Variables importantes

- `DATABASE_URL` (obligatoria)
- `ADMIN_EMAIL` (opcional, default `admin@mevakbeautycenter.com`)
- `ADMIN_PASSWORD` (opcional, default `admin123`)
- `PORT` (opcional, default `5000`)

## Ejecutar con Docker (recomendado)

```bash
docker compose up --build -d
```

Backend disponible en:

- `http://localhost:5000`

## Credenciales iniciales

- Email: `admin@mevakbeautycenter.com` (o la de `ADMIN_EMAIL`)
- Password: `admin123` (o la de `ADMIN_PASSWORD`)

> Al entrar con admin, desde la app puedes crear usuarios reales, servicios, paquetes y demás datos.

## Reiniciar completamente datos

Esto elimina todo lo persistido en PostgreSQL:

```bash
docker compose down -v
docker compose up --build -d
```

## Ejecutar sin Docker (local)

1. Levanta PostgreSQL y crea base de datos.
2. Define `DATABASE_URL`.
3. Corre backend:

```bash
npm run server:dev
```

4. En otra terminal corre frontend:

```bash
npm run expo:dev
```

## Notas de despliegue

- La imagen Docker construye:
  - `static-build` de Expo web
  - `server_dist` (Express)
- El contenedor runtime sirve API y build estático desde `server_dist/index.js`.
