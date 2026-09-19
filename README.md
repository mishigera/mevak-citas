# Mevak Beauty Center

Primera versión productiva con backend en Docker + PostgreSQL.

## Qué cambió para producción

- Persistencia de toda la app en PostgreSQL (no en memoria).
- Seed inicial mínimo:
  - Una cuenta de dueña (`OWNER`), con el correo y la contraseña de `.env`.
  - Catálogo de áreas láser para el monito.
  - Horario del centro: lunes a viernes 9–19, sábado 9–15, domingo cerrado.
- Login sin cuentas demo visibles.
- Flujo de logout estabilizado.
- Branding/íconos actualizado a **Mevak Beauty Center**.

## Variables importantes

- `DATABASE_URL` (obligatoria)
- `ADMIN_EMAIL` y `ADMIN_PASSWORD` (obligatorias con Docker): la primera cuenta, la de
  la dueña. Solo se usan si la base no tiene ningún usuario.
- `TZ` (default `America/Mexico_City`): el día de la app se calcula en hora local.
- `TOKEN_TTL_DAYS` (default `30`): días que dura una sesión.
- `APP_BASE_URL` (opcional para build estático, ej. `https://app.tudominio.com`)
- `PORT` (opcional, default `5000`)

## Ejecutar con Docker (recomendado)

1. Crea tu archivo de variables:

```bash
cp .env.example .env
```

2. Levanta servicios:

```bash
docker compose up --build -d
```

Backend disponible en:

- `http://localhost:5000`

## Credenciales iniciales

Las que pongas en `ADMIN_EMAIL` y `ADMIN_PASSWORD` antes del primer arranque. Esa cuenta
es la de la dueña: desde ella se dan de alta la recepcionista y la facialista, y se
configuran servicios, paquetes y el horario del centro.

> Cambia la contraseña desde la app en cuanto entres por primera vez.

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
