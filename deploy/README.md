# Despliegue

Este proyecto **no usa CI en la nube**. Todo ocurre en el servidor: se trae el código,
se valida, y solo si todo pasa se reconstruyen los contenedores.

```
git pull → npm ci → tsc → lint → tests+cobertura → docker compose up → healthcheck
                                      │                                     │
                                      └── si falla: producción              └── si falla:
                                          no se toca, el árbol                   rollback
                                          vuelve atrás                           automático
```

## Uso

```bash
./scripts/deploy.sh              # despliega si hay commits nuevos en origin/main
./scripts/deploy.sh --force      # despliega aunque no haya nada nuevo
./scripts/deploy.sh --check      # solo valida, no toca los contenedores
./scripts/deploy.sh --rollback   # vuelve al último commit que quedó sano
```

Si no hay commits nuevos, sale en silencio con código 0. Es seguro llamarlo cada pocos
minutos desde un temporizador.

## Qué garantiza

- **Producción no se toca hasta que todo pasa.** Tipos, lint y los 603 tests corren sobre
  el código nuevo mientras los contenedores siguen sirviendo el anterior.
- **Si la validación falla**, el árbol vuelve al commit anterior. El servidor nunca se
  queda con código que no pasó las pruebas.
- **Si el contenedor no levanta o no responde**, hace rollback solo y te deja las últimas
  40 líneas del log.
- **Un despliegue a la vez**: usa un directorio de bloqueo, así que dos ejecuciones
  simultáneas no se pisan.
- **Exige árbol limpio** en archivos rastreados: si alguien editó algo a mano en el
  servidor, se planta antes de hacer nada.

La señal de salud es `GET /api/auth/me` devolviendo **401**. No es un truco: significa que
Express responde *y* que `storage.ready` se resolvió, lo que a su vez exige que Postgres
estuviera disponible y las entidades cargadas. Un 200 o un 000 son ambos fallo.

## Instalación en el servidor

```bash
# 1. Clonar donde vaya a vivir
sudo git clone https://github.com/mishigera/mevak-citas.git /opt/mevak
sudo chown -R mevak:mevak /opt/mevak
cd /opt/mevak

# 2. Variables de entorno (NO se versiona)
cp .env.example .env
$EDITOR .env          # DATABASE_URL, POSTGRES_PASSWORD, ADMIN_PASSWORD, APP_BASE_URL

# 3. Primer despliegue a mano, para ver la salida completa
./scripts/deploy.sh --force
```

### Desatendido (systemd)

```bash
sudo cp deploy/systemd/mevak-deploy.{service,timer} /etc/systemd/system/
sudo $EDITOR /etc/systemd/system/mevak-deploy.service   # ajusta User y WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now mevak-deploy.timer
```

Comprobar:

```bash
systemctl list-timers mevak-deploy.timer   # cuándo toca el próximo
journalctl -u mevak-deploy.service -f      # seguir un despliegue en vivo
sudo systemctl start mevak-deploy.service  # forzar uno ahora
cat .deploy/deploy.log                     # histórico de despliegues
```

### Alternativa con cron

```cron
*/5 * * * * cd /opt/mevak && ./scripts/deploy.sh >> /var/log/mevak-deploy.log 2>&1
```

## Variables que acepta el script

| Variable | Por defecto | Para qué |
|---|---|---|
| `DEPLOY_BRANCH` | `main` | Rama que se despliega |
| `DEPLOY_HEALTH_URL` | `http://127.0.0.1:5000/api/auth/me` | Dónde comprobar la salud |
| `DEPLOY_HEALTH_TIMEOUT` | `120` | Segundos de espera antes de dar por muerto el despliegue |
| `DEPLOY_STATE_DIR` | `.deploy` | Dónde guardar bloqueo, bitácora y último commit sano |

## Cuando algo va mal

| Síntoma | Qué hacer |
|---|---|
| "Ya hay un despliegue en curso" y no lo hay | Se quedó un bloqueo huérfano: `rmdir .deploy/lock` |
| "Hay cambios sin commitear" | Alguien editó en el servidor. `git diff` para ver qué, y decide: `git checkout <archivo>` o llévatelo al repo |
| El despliegue hizo rollback solo | `docker compose logs app` y `cat .deploy/deploy.log`. La versión anterior sigue sirviendo |
| Quieres volver atrás a mano | `./scripts/deploy.sh --rollback` |
| Cambió el esquema de datos | No hay migraciones (la persistencia es JSONB). Haz copia del volumen antes: `docker compose exec db pg_dump -U mevak mevak > respaldo.sql` |

## Lo que este montaje NO hace

- **No hay despliegue sin caída.** `docker compose up --build` reinicia el contenedor:
  hay unos segundos sin servicio. Para un centro de belleza es asumible; si dejara de
  serlo, habría que levantar la nueva imagen en paralelo y cambiar el puerto.
- **No respalda la base antes de desplegar.** Añádelo al script si el riesgo lo pide.
- **No valida en los pull requests**, porque no hay CI en la nube. Quien abra una rama
  debería correr `./.ai/scripts/verificar.sh --cov` antes de fusionar, o bien
  `./scripts/deploy.sh --check` en el servidor.
