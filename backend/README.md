# Backend

El backend sigue una organizacion hexagonal: dominio y casos de uso no dependen
de Express, PostgreSQL, bcryptjs ni jsonwebtoken. `src/index.js` compone los
puertos con sus adaptadores.

## Estructura

- `src/domain/entities`: entidades `User` e `Incident` y sus reglas.
- `src/domain/services`: reglas puras de transiciones de estado.
- `src/domain/ports`: contratos de repositorios, hash de contrasenas y tokens.
- `src/application/use-cases`: registro, login, usuario actual e incidencias.
- `src/infrastructure`: Express, controladores HTTP, middleware JWT,
  repositorios PostgreSQL, migraciones y adaptadores de seguridad.

Express traduce las peticiones y delega en casos de uso. Por ejemplo,
`TeamController` pasa la identidad autenticada y los datos a `ManageTeam`,
que aplica las reglas de `TeamValidation` y usa el repositorio inyectado.
`src/index.js` conecta ese puerto a `PostgresTeamRepository`. La lógica de
triaje se conserva en `IncidentTriageEngine` y `CreateTriagedIncident`, con sus
pruebas. El alta HTTP sigue usando `CreateIncident`.

React y n8n son adaptadores de entrada de la misma API. En el navegador,
`frontend/src/application/submitIncident.js` coordina el alta y el reintento
de fotos mediante operaciones inyectadas. `frontend/src/incidentServices.js`
conecta esas operaciones a los adaptadores HTTP de `frontend/src/api`.
El flujo de Telegram usa los mismos endpoints autenticados y no se conecta
a PostgreSQL. Consulta [el despliegue del bot](../n8n/README.md#producción).

## Ejecucion local

1. Copia el `.env.example` de la raiz a `.env` y reemplaza sus valores de
   desarrollo antes de cualquier despliegue.
2. Inicia PostgreSQL desde la raiz con `docker compose up -d db`, o inicia la
   base y el backend con `docker compose up --build`.
3. Para desarrollo local desde WSL, instala las dependencias de `backend` y
   `frontend` con `npm ci` en cada carpeta y ejecuta `npm run dev:all` desde la
   raiz. El backend carga el `.env` raiz y escucha en el puerto 3001.

Las migraciones se ejecutan normalmente como paso separado con
`npm run migrate`; el servidor no cambia el esquema en cada inicio. El comando
local `npm run dev:all` activa `MIGRATE_ON_START` para preparar la base de
desarrollo antes de comprobar su disponibilidad. `npm start` inicia la API sin
ejecutar migraciones.

Si tus cuentas e incidencias ya están en PostgreSQL de Windows, configura
`DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` en `.env`. Desde la raíz, usa
`docker compose -f docker-compose.yml -f docker-compose.windows-db.yml up -d --no-deps --wait backend frontend`.
El backend usará la base de Windows a través de `host.docker.internal` y
aplicará las migraciones pendientes. Los datos del volumen PostgreSQL de Docker
siguen disponibles para ejecuciones con el Compose principal.

## Primera inicializacion de cuentas

En un entorno nuevo, levanta la base y aplica las migraciones. Define
`SUPERADMIN1_PASSWORD` y `SUPERADMIN2_PASSWORD` en el entorno con contraseñas de
8 a 72 bytes; después ejecuta:

```bash
npm run seed:superadmins --prefix backend
```

El comando garantiza que existen las dos cuentas reservadas, actualiza sus
hashes bcrypt de forma idempotente y nunca muestra las contraseñas. No hay ruta
HTTP para crear o promover superadministradores. Desde `/staff`, estos pueden
crear cuentas de administrador. El login público en `/` es solo para
ciudadanos; el personal inicia sesión por separado en `/staff`.

## Categorías, historial y evidencias de incidencias

La migración `006_add_incident_categories_history_and_evidence.sql` agrega el
catálogo de categorías (`bache`, `alumbrado`, `basura`), el historial de
estatus y las evidencias, además del índice espacial GIST. Las incidencias
existentes conservan `category_code = NULL`; una restricción de inserción exige
categoría para cada incidencia nueva. Los reportes de prueba se pueden cargar
manualmente después de migrar:

```bash
PGPASSWORD="$DB_PASSWORD" psql \
  --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --dbname "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f src/infrastructure/database/seeds/development_incidents.sql
```

La API y el formulario aceptan las tres categorías. El historial registra el
estatus inicial y cada cambio, con el usuario responsable, dentro de la misma
transacción que guarda la incidencia. Se conservan los valores existentes de
rol (`citizen`, `admin`, `superadmin`) y estatus (`abierta`, `en_proceso`,
`resuelta`, `cerrada`) para no romper autenticación ni reportes guardados. La
regla de transición equivalente es `abierta → en_proceso → resuelta → cerrada`.
La tabla `evidences` guarda referencias a fotos locales (`local:<uuid>.webp`),
sin bytes de imagen en PostgreSQL ni copias en la nube. La API permite hasta
10 fotos por incidencia, de máximo 2 MiB (2,097,152 bytes) cada una. Acepta
JPG, PNG y WebP estáticos de hasta 25 megapíxeles, valida y decodifica los
archivos, elimina metadatos y optimiza a WebP con un máximo de 1920 píxeles
por lado. Los ciudadanos pueden consultar y gestionar fotos de sus propios
reportes; admin y superadmin pueden hacerlo para cualquier reporte.

El formulario permite adjuntar, recortar, girar, reemplazar y quitar fotos.
Las fotos se pueden gestionar después desde las tarjetas o la tabla. Si una
subida falla después de crear el reporte, el formulario conserva el reporte y
las fotos pendientes para reintentar sin crear otra incidencia.

Por defecto los archivos se guardan en `backend/uploads/photos`, excluido de
Git. `PHOTO_STORAGE_DIR` permite elegir un directorio persistente absoluto.
Docker Compose conserva las fotos en el volumen `incident_photos`; no borres
ese volumen si necesitas conservarlas. No existe respaldo en AWS ni otro
servicio. Las imágenes no se exponen como archivos estáticos: requieren JWT.

Endpoints autenticados:
- `GET /api/incidents/:id/photos`: lista referencias de fotos locales.
- `POST /api/incidents/:id/photos`: agrega una foto; cuerpo binario con
  `Content-Type: application/octet-stream`, máximo 2 MiB.
- `PUT /api/incidents/:id/photos/:photoId`: reemplaza una foto (mismo formato).
- `GET /api/incidents/:id/photos/:photoId`: imagen WebP; `?thumbnail=1` devuelve
  una versión pequeña. Respuestas privadas sin caché compartida.
- `DELETE /api/incidents/:id/photos/:photoId`: elimina referencia y archivo.

Al reemplazar o eliminar fotos de incidencias activas, se limpian los
archivos asociados. Un cierre abrupto entre escritura y transacción o un fallo
del disco puede dejar archivos huérfanos; los fallos de limpieza se registran
para revisión. Si el servidor pierde su disco/volumen, se perderán las fotos.

Archivar una incidencia conserva sus fotos, avisos e historial de estados.
Las fotos de expedientes archivados solo pueden ser consultadas por personal.

## Conexión PostgreSQL

`src/infrastructure/database/connection.js` expone una única instancia del
pool `pg.Pool`, compartida por los adaptadores PostgreSQL y las tareas de
migración/arranque. La configuración local usa `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER` y `DB_PASSWORD`; los secretos reales van únicamente en el `.env`
ignorado. En despliegues existentes siguen aceptándose `DATABASE_URL` y las
variables `PG*`.

## Preparacion para despliegue

Para AWS con fotos locales persistentes, sigue `../DESPLIEGUE_AWS.md`: incluye
EC2, EBS sin respaldo de fotos, RDS privado, ALB HTTPS y plantillas CloudFormation.
La verificación y sus límites se documentan en `../REVISION_AWS.md`.

- Publica `backend/Dockerfile` como un servicio Node y `frontend/Dockerfile`
  como un servicio web, en una red privada compartida si se usa el proxy Nginx
  incluido. Ejecuta `npm run migrate` como tarea de release del contenedor
  backend antes de desplegar la nueva version. El frontend debe ser el unico
  servicio expuesto publicamente si se usa el proxy Nginx; usa HTTPS en el
  ingreso administrado por tu plataforma.
- Configura el servicio backend con `NODE_ENV=production`, `PORT` (el que
  asigne la plataforma), `DATABASE_URL` de una base PostgreSQL administrada,
  `DATABASE_SSL=true`, `JWT_SECRET` aleatorio y privado de al menos 32 bytes,
  `FRONTEND_ORIGIN=https://tu-dominio-frontend` y
  `TRUST_PROXY_HOPS=1` solo si hay exactamente un proxy de confianza delante
  del backend. Para varios origenes, separalos con comas.
- Inyecta secretos desde el gestor de secretos de la plataforma; no subas `.env`
  ni uses los valores del ejemplo en produccion. La configuracion exige HTTPS
  para CORS y TLS validado para PostgreSQL en produccion.
- Ejecuta `npm run migrate` como tarea de release/una sola vez antes de cambiar
  el trafico a una nueva version. No ejecutes migraciones desde cada replica.
- Ajusta `DB_POOL_MAX` al limite de conexiones de la base dividido entre el
  numero maximo de replicas. `DB_CONNECTION_TIMEOUT_MS` configura el tiempo de
  conexion. `DATABASE_SSL_CA` es opcional si el proveedor requiere una CA
  concreta. El pool valida certificados por defecto.
- Configura el escalado para que la suma de conexiones de todas las replicas
  no supere el limite de PostgreSQL; el JWT no depende de sesiones en memoria.
- El backend aplica Helmet para las cabeceras HTTP de seguridad. Configura
  limites de solicitudes para login y registro en el gateway/WAF de la
  plataforma antes de exponer el servicio publicamente.
- Usa `GET /health` para liveness, `GET /ready` para readiness y
  `GET /api/health` para comprobar PostgreSQL. El proceso escucha en `0.0.0.0`, limita el JSON por defecto a
  `1mb` (`JSON_BODY_LIMIT`) y cierra HTTP y el pool ante `SIGTERM`.
- Construye el frontend con `VITE_API_URL=https://tu-api.example.com/api` si
  frontend y backend se alojan en servicios separados. Si comparten red,
  conserva `/api` y el proxy Nginx reenvia las solicitudes al servicio `backend`.
- `docker compose up --build` es para desarrollo/preview con PostgreSQL local.
  En produccion usa una base administrada; configura el servicio backend y el
  frontend por separado con los contenedores publicados y configura `DATABASE_URL`
  con la conexion de esa base administrada. La imagen frontend usa `/api` y
  reenvia al hostname `backend`; si los servicios no comparten red, construyela
  con `VITE_API_URL=https://tu-api.example.com/api`. No expongas PostgreSQL
  publicamente.

Usa referencias de imagen inmutables (digest) en los despliegues finales para
fijar las versiones base de Node y Nginx ya validadas.

El limite de escalado depende del proveedor; configura tambien su proxy/WAF
para limites de solicitudes en login/registro antes de habilitar trafico
publico.

## Endpoints

- `GET /health`: estado de la API.
- `POST /api/auth/register`: registro con `name`, `email` y `password`.
- `POST /api/auth/login`: login con `email` y `password`.
- `POST /api/staff/auth/login`: login separado para `admin` y `superadmin`.
- `GET /api/auth/me`: usuario autenticado; requiere `Authorization: Bearer <token>`.
- `GET /api/incidents`: ciudadanos ven solo sus reportes; el personal ve todos.
  Requiere JWT.
- `POST /api/incidents`: crea una incidencia con `title`, `description` y
  coordenadas opcionales `latitude`/`longitude` (requiere JWT).
- `PATCH /api/incidents/:id/status`: actualiza el estado a `abierta`,
  `en_proceso`, `resuelta` o `cerrada`; solo `admin` y `superadmin`.
- `GET /api/analytics/heatmap`: obtiene latitud, longitud y peso de incidencias
  geolocalizadas; solo `admin` y `superadmin`.
- `GET /api/notifications` y `PATCH /api/notifications/:id/read`: consulta y
  marca como leídas las notificaciones del ciudadano autenticado.
- Socket.IO emite `new_notification` y `incident_status_updated` a la sala privada
  del propietario después de confirmar la transacción. El handshake requiere
  `{ auth: { token } }` con un JWT vigente; el proxy reenvía `/socket.io/`.
  Al reconectar, el panel vuelve a consultar las notificaciones y los reportes.
- `GET /api/telegram/notifications` y `PUT /api/telegram/notifications` leen y
  guardan el consentimiento de avisos del ciudadano autenticado. El cambio
  recibe `{ "enabled": true }` o `{ "enabled": false }`.
- `PUT /api/incidents/:id`: edita reportes
  existentes; solo `admin` y `superadmin`.
- `POST /api/incidents/:id/archive`: archiva un expediente con `{ "reason": "…" }`.
  Guarda el primer motivo, actor y fecha y devuelve `204`; solo personal.
- `GET /api/incidents/archived`: lista expedientes archivados y sus metadatos;
  solo personal. Las listas operativas y la analítica muestran expedientes activos.
- `GET /api/incidents/assignments`: tablero de asignación y plazos para el personal.
- `PUT /api/incidents/:id/assignment`: asigna un contacto activo con
  `{ "contactId": "…" }`. La reasignación conserva el plazo original.
- `GET /api/incidents/:id/assignment-history`: historial de cuadrillas, fechas
  y responsables; solo personal.
- `GET /api/admins` y `POST /api/admins`: administra cuentas de administradores;
  solo `superadmin`. La API siempre asigna `admin`, aunque se envie otro rol.

El registro devuelve `data.user` y `data.token`. Las contrasenas deben tener
entre 8 y 72 bytes y se guardan con bcrypt; nunca se devuelve el hash. Los
tokens JWT expiran en una hora. Los errores de validacion responden `400`, las
credenciales invalidas `401` y el correo duplicado `409`.

Ejecuta `npm test` para correr las pruebas.

Para el piloto, `INCIDENT_DUE_HOURS` vale 48 horas desde la recepción y
`INCIDENT_ESCALATION_HOURS` vale 0 horas adicionales. El escalamiento aparece
como una señal en el tablero del personal. El primero se conserva al asignar
el folio. El municipio puede ajustar ambos valores antes del piloto.

## Solución de problemas

- Si el backend no aparece en el puerto 3001, revisa su salida de arranque. El
  `.env` se carga siempre desde la raíz. Configura `DATABASE_URL` o
  `PGDATABASE`/`PGUSER` y una base PostgreSQL accesible; en desarrollo también
  se aceptan `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD`.
- Confirma la conectividad con `curl -i http://localhost:3001/api/health`.
  Un `200` JSON indica que PostgreSQL responde; `503` JSON significa que no
  está disponible. Los errores de Express y las rutas desconocidas también
  responden JSON.
- Si Node se ejecuta en WSL y PostgreSQL en Windows, configura `DB_HOST` con el
  gateway WSL (`ip route show default`) y permite esa conexión en PostgreSQL y
  el firewall. `localhost` dentro de WSL se refiere a WSL.
- No mezcles `node_modules` de Windows y WSL. Usa Node.js Linux dentro de WSL
  y `npm ci` en cada paquete, conservando los archivos `package-lock.json`.
