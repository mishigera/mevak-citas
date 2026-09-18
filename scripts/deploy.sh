#!/usr/bin/env bash
#
# Despliegue desde el propio servidor. Sin GitHub Actions ni agentes.
#
#   ./scripts/deploy.sh              despliega si hay commits nuevos en el remoto
#   ./scripts/deploy.sh --force      despliega aunque no haya nada nuevo
#   ./scripts/deploy.sh --check      solo valida, no toca los contenedores
#   ./scripts/deploy.sh --rollback   vuelve al commit anterior y reconstruye
#
# Orden deliberado: TODAS las comprobaciones corren antes de tocar nada de producción.
# Si algo falla, los contenedores siguen sirviendo la versión anterior sin enterarse.

set -euo pipefail

RAMA="${DEPLOY_BRANCH:-main}"
URL_SALUD="${DEPLOY_HEALTH_URL:-http://127.0.0.1:5000/api/auth/me}"
ESPERA_SALUD="${DEPLOY_HEALTH_TIMEOUT:-120}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

DIR_ESTADO="${DEPLOY_STATE_DIR:-$RAIZ/.deploy}"
mkdir -p "$DIR_ESTADO"
BLOQUEO="$DIR_ESTADO/lock"
ULTIMO_BUENO="$DIR_ESTADO/ultimo-commit-bueno"
BITACORA="$DIR_ESTADO/deploy.log"

# ---------------------------------------------------------------- salida
rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

registrar() { printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$BITACORA"; }

morir() {
  rojo "✗ $*"
  registrar "FALLO: $*"
  exit 1
}

# ---------------------------------------------------------------- un solo despliegue a la vez
if ! mkdir "$BLOQUEO" 2>/dev/null; then
  gris "Ya hay un despliegue en curso ($BLOQUEO). Saliendo."
  exit 0
fi
trap 'rmdir "$BLOQUEO" 2>/dev/null || true' EXIT

MODO="${1:-}"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

esperar_salud() {
  paso "Esperando a que el servicio responda"
  local fin=$((SECONDS + ESPERA_SALUD))
  while [ $SECONDS -lt $fin ]; do
    local codigo
    codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL_SALUD" 2>/dev/null || echo 000)
    # 401 es la respuesta correcta: Express responde y el storage cargó desde Postgres.
    if [ "$codigo" = "401" ]; then
      verde "  ✓ sano (HTTP 401 en $URL_SALUD)"
      return 0
    fi
    gris "  … HTTP $codigo, reintentando"
    sleep 3
  done
  return 1
}

desplegar_contenedores() {
  paso "Levantando contenedores"
  compose up -d --build --remove-orphans
}

# ---------------------------------------------------------------- rollback
if [ "$MODO" = "--rollback" ]; then
  [ -f "$ULTIMO_BUENO" ] || morir "No hay ningún commit bueno registrado en $ULTIMO_BUENO"
  ANTERIOR=$(cat "$ULTIMO_BUENO")
  paso "Volviendo a $ANTERIOR"
  git reset --hard "$ANTERIOR"
  desplegar_contenedores
  esperar_salud || morir "El rollback tampoco levanta. Revisa: compose logs app"
  verde "✓ Rollback completado en $ANTERIOR"
  registrar "ROLLBACK a $ANTERIOR"
  exit 0
fi

# ---------------------------------------------------------------- comprobaciones previas
paso "Comprobaciones previas"

command -v git >/dev/null   || morir "git no está instalado"
command -v node >/dev/null  || morir "node no está instalado"
command -v curl >/dev/null  || morir "curl no está instalado"
compose version >/dev/null 2>&1 || morir "docker compose no está disponible"

[ -f .env ] || morir ".env no existe. Cópialo de .env.example y rellena DATABASE_URL."

ACTUAL=$(git rev-parse --abbrev-ref HEAD)
[ "$ACTUAL" = "$RAMA" ] || morir "Estás en '$ACTUAL' y se despliega '$RAMA'. Cambia de rama."

# El árbol debe estar limpio: si no, un `git reset` del rollback se llevaría cambios por delante.
# Los archivos sin rastrear no estorban (el build los ignora vía .dockerignore),
# pero un archivo rastreado y modificado sí: el rollback se lo llevaría por delante.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  morir "Hay cambios sin commitear en archivos rastreados. El servidor debe reflejar exactamente lo que está en $RAMA."
fi

PREVIO=$(git rev-parse HEAD)
gris "  commit actual: $(git rev-parse --short HEAD)"

# ---------------------------------------------------------------- traer cambios
paso "Buscando cambios en origin/$RAMA"
git fetch origin "$RAMA" --quiet
REMOTO=$(git rev-parse "origin/$RAMA")

if [ "$PREVIO" = "$REMOTO" ] && [ "$MODO" != "--force" ] && [ "$MODO" != "--check" ]; then
  verde "✓ Ya está al día ($(git rev-parse --short HEAD)). Nada que hacer."
  exit 0
fi

if [ "$PREVIO" != "$REMOTO" ]; then
  gris "  $(git log --oneline "$PREVIO..$REMOTO" | wc -l | tr -d ' ') commit(s) nuevo(s):"
  git log --oneline "$PREVIO..$REMOTO" | head -10 | sed 's/^/    /'
  git merge --ff-only "origin/$RAMA" || morir "No se puede avanzar sin merge. Resuélvelo a mano."
  verde "  ✓ actualizado a $(git rev-parse --short HEAD)"
fi

# Si algo falla de aquí en adelante, el árbol vuelve a donde estaba: así el servidor
# nunca queda con código que no pasó las pruebas, aunque los contenedores sigan vivos.
volver_atras() {
  if [ "$(git rev-parse HEAD)" != "$PREVIO" ]; then
    gris "  Devolviendo el árbol a $(git rev-parse --short "$PREVIO")"
    git reset --hard "$PREVIO" --quiet
  fi
}

# ---------------------------------------------------------------- validación
paso "Instalando dependencias"
npm ci || { volver_atras; morir "npm ci falló"; }

paso "Comprobando tipos"
npx tsc --noEmit || { volver_atras; morir "Hay errores de TypeScript"; }
verde "  ✓ sin errores de tipos"

paso "Lint"
if ! npx expo lint; then
  volver_atras
  morir "El lint encontró errores"
fi
verde "  ✓ lint ok"

paso "Tests y cobertura"
if ! npm run test:cov; then
  volver_atras
  morir "Los tests o el umbral de cobertura fallaron. Producción no se ha tocado."
fi
verde "  ✓ tests ok"

if [ "$MODO" = "--check" ]; then
  verde "\n✓ Todo pasa. (--check: no se tocaron los contenedores)"
  exit 0
fi

# ---------------------------------------------------------------- despliegue
NUEVO=$(git rev-parse HEAD)
registrar "DESPLIEGUE $(git rev-parse --short "$PREVIO") → $(git rev-parse --short "$NUEVO")"

desplegar_contenedores || {
  rojo "El build de Docker falló. Volviendo atrás."
  git reset --hard "$PREVIO" --quiet
  desplegar_contenedores || true
  morir "Fallo al construir la imagen. Se restauró $(git rev-parse --short "$PREVIO")."
}

if ! esperar_salud; then
  rojo "El servicio no respondió en ${ESPERA_SALUD}s. Últimas líneas del log:"
  compose logs --tail 40 app || true
  rojo "Volviendo a $(git rev-parse --short "$PREVIO")"
  git reset --hard "$PREVIO" --quiet
  desplegar_contenedores || true
  esperar_salud && rojo "Rollback ok, sigue la versión anterior." || rojo "Ni la anterior levanta: revisa a mano."
  morir "Despliegue abortado."
fi

echo "$NUEVO" > "$ULTIMO_BUENO"
registrar "OK $(git rev-parse --short "$NUEVO")"

paso "Limpieza"
docker image prune -f >/dev/null 2>&1 || true

verde "\n✓ Desplegado $(git rev-parse --short "$NUEVO") — $(git log -1 --pretty=%s)"
gris "  Bitácora: $BITACORA"
