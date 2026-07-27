# wms-server

WMS (Warehouse Management System). Etapas construidas:
- **Etapa 1**: modelo de datos + módulo Inbound (Recepción + Putaway).
- **Etapa 2**: módulo Outbound/Picking (allocation engine FEFO/FIFO con prioridad de zona,
  wave/batch picking con ruta en "S", confirmación por doble escaneo, y el caso borde
  "Falta en Posición" con re-enrutamiento automático).
- **Etapa 3**: RBAC completo (ABM de usuarios, `/auth/me`) + `wms-client` (frontend de supervisión).
- **Etapa 4**: cola de picking (`/picking-tasks/claim-next`, auto-asignación por operario) +
  `wms-pwa` (PWA de colectoras para escaneo real).

Proyecto independiente, sin relación con otros repos del workspace.

## Múltiples frontends y cookies cross-origin

`wms-client` (puerto 3000) y `wms-pwa` (puerto 3001) son proyectos Next.js separados que
autentican contra este backend vía cookies httpOnly cross-origin (ver `CORS_ORIGIN` +
`credentials: true`). En dev, ambos corren en `localhost` con puertos distintos — las cookies con
`sameSite=lax` viajan igual porque el "site" a efectos de cookies es el host (`localhost`), no el
puerto. En producción, si se agrega un frontend nuevo hay que: (1) agregar su origen a
`CORS_ORIGIN`, y (2) que corra bajo un subdominio del mismo dominio raíz que `COOKIE_DOMAIN` (ej.
`app.wms.example.com` y `pwa.wms.example.com` con `COOKIE_DOMAIN=.wms.example.com`) — si corriera en
un dominio raíz distinto, las cookies no viajarían y no hay forma de evitarlo sin cambiar de
mecanismo de auth (tokens en header, no cookies).

## Flujo Outbound (resumen)

```
POST /api/v1/integrations/outbound-orders   # ERP crea la orden (CREATED)
POST /api/v1/outbound-orders/release        # { orderIds: [...] } -> arma la wave y las tareas (ALLOCATED)
POST /api/v1/picking-tasks/claim-next       # cola de picking: asigna la próxima tarea disponible al operario (PWA)
POST /api/v1/outbound-orders/:orderId/picking-tasks/:taskId/scan   # ubicación + barcode (-> IN_PICKING)
POST /api/v1/outbound-orders/:orderId/picking-tasks/:taskId/report-shortage  # "falta en posición"
POST /api/v1/outbound-orders/:id/pack       # requiere todas las tareas en estado terminal
POST /api/v1/outbound-orders/:id/ship       # { trackingNumber? } -> SHIPPED
```

Nota de diseño: el paso "Categoría/Rotación" del algoritmo de putaway (Etapa 1) no discrimina por
ocupación — siempre gana sobre el paso "Slot Vacío" mientras exista alguna ubicación STORAGE_RESERVE
sin bloquear. Esto significa que, en la práctica, `reason: "EMPTY_SLOT"` casi nunca es el resultado
final de una sugerencia de putaway (queda "sombreado" por CATEGORY). El fix de Etapa 2 a la query de
slot vacío sigue siendo correcto, pero su efecto observable es limitado por este diseño ya aprobado
en Etapa 1. Si en algún momento se quiere que "Categoría" también discrimine por ocupación, es un
cambio a evaluar aparte (afecta comportamiento ya validado de Inbound).

## Desarrollo local

```bash
docker compose up -d db
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

API disponible en `http://localhost:4000/api/v1`.

## Tests

```bash
npm test
```

Requiere Postgres corriendo (usa `DATABASE_URL` de `.env`) para los tests e2e. Los tests e2e
truncan las tablas (`resetDb`) — no correr contra una base con datos que importen, y recordar
correr `npm run prisma:seed` de nuevo después si vas a seguir probando manualmente.

## Troubleshooting: "Authentication failed" contra Postgres en Windows/Docker Desktop

En algunos setups de Docker Desktop para Windows (especialmente con proxy configurado), la conexión
por el puerto reenviado (`localhost:5432` / `127.0.0.1:5432`) corrompe la autenticación por password,
aunque el contenedor esté sano y las credenciales sean correctas (se puede confirmar con
`docker compose exec db psql -U wms -d wms_dev`, que sí funciona vía el socket/red interna).

Workaround para desarrollo local en ese caso: usar la IP de la VM de WSL2 en vez de `localhost`:

```bash
wsl -d docker-desktop sh -c "ip -4 addr show eth0"   # ej: 172.20.244.241
```

y poner esa IP en `DATABASE_URL` dentro de `.env`. Es una IP dinámica (cambia si se reinicia Docker
Desktop/WSL), así que hay que volver a consultarla cuando deje de conectar. Alternativa más estable:
correr todo el stack con `docker compose up` (el contenedor `api` habla con `db` por la red interna
de Docker, sin pasar por el puerto reenviado del host, así que no le afecta este problema).
