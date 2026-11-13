# Frontend

Aplicacion React + Vite para ciudadanos y personal de administracion.

## Desarrollo local

`npm run dev` desde esta carpeta también inicia el backend y comprueba PostgreSQL
antes de abrir la interfaz. Desde la raíz puedes usar `npm run dev`, `npm start`
o `npm run dev:all`: los tres inician el proyecto completo. Si la API o Vite ya
están activos, se reutilizan. Mantén abierta la terminal mientras uses la app;
Ctrl+C detiene los procesos iniciados por ese comando. PostgreSQL debe estar activo.

1. Desde la raíz, copia `.env.example` a `.env` si aún no existe y configura
   PostgreSQL. `VITE_API_URL` debe ser la URL completa de la API local,
   normalmente `http://localhost:3001/api`.
2. Instala dependencias por separado en `backend` y `frontend` desde WSL con
   `npm ci`. No reutilices `node_modules` instalado desde Windows: los paquetes
   nativos de Vite/Rolldown dependen del sistema operativo y la arquitectura.
3. Inicia PostgreSQL/PostGIS y ejecuta `npm run dev:all` desde la raíz. El
   backend aplica migraciones, verifica `/api/health` y solo entonces arranca
   Vite. La aplicación estará disponible en `http://localhost:5175`.

## Solución de problemas

- **«No se pudo conectar con el backend» al iniciar sesión:** confirma que
  `npm run dev:all` sigue activo y prueba
  `curl -i http://localhost:3001/api/health`. Debe responder `200` con JSON y
  `"database":"connected"`. El script no abre Vite hasta que la API y
  PostgreSQL estén listos.
- **El backend no inicia:** revisa el mensaje en la terminal. La configuración
  se carga desde el `.env` de la raíz; valida `JWT_SECRET`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD` y `POSTGRES_DB` (o las variables `PG*`). Para usar
  PostgreSQL de Windows desde WSL, define `PGHOST` con la dirección del gateway
  mostrada por `ip route show default` en WSL, y verifica que el servidor
  PostgreSQL y el firewall permitan conexiones desde WSL.
  En `dev:all`, si `DB_HOST` (o `PGHOST`/`POSTGRES_HOST`) es localhost,
  127.0.0.1 o ::1 en WSL, se usa automáticamente el gateway de Windows.
  Esto permite conectar al PostgreSQL instalado en Windows; una dirección
  explícita distinta o `DATABASE_URL` conserva su configuración.
- **«JSON inválido» o una página HTML:** la API debe devolver JSON incluso en
  errores. Consulta la respuesta de `curl` y los logs del backend; revisa que
  `VITE_API_URL` apunte a la API, no a Vite ni a una página de error.
- **«Cannot find native binding» de Rolldown/Vite:** instala Node.js para Linux
  dentro de WSL y ejecuta `npm ci` desde WSL en cada paquete. No invoques el
  `npm` de Windows desde WSL ni compartas carpetas `node_modules` entre ambos
  sistemas. Conserva los `package-lock.json` para instalar las versiones
  fijadas.
  Los comandos `npm run dev`, `npm run build`, `npm run preview` y
  `npm run dev:all` ahora prueban cargar Rolldown antes de iniciar. Si falta
  su binding nativo, instalan automáticamente la versión correspondiente al
  sistema actual sin modificar el archivo de bloqueo (requiere acceso a npm).
  El proyecto incluye las dependencias opcionales de forma predeterminada.
- **«Correo o contraseña incorrectos»:** ejecuta
  `npm run seed:superadmins --prefix backend` después de configurar
  `SUPERADMIN1_PASSWORD` y `SUPERADMIN2_PASSWORD` en el entorno y aplicar las
  migraciones. La semilla es idempotente; vuelve a calcular hashes bcrypt.

## Portales

- `/`: login y registro publico de ciudadanos; cada ciudadano puede crear y ver
  sus propios reportes.
- `/staff`: acceso separado para administradores y superadministradores. El
  personal ve, actualiza y elimina todos los reportes; solo superadministradores
  pueden crear cuentas de administrador.
- El panel de administración permite alternar entre la tabla de reportes y el
  mapa de calor espacial de incidencias geolocalizadas.

El token de sesion se guarda en `localStorage` y se envia como
`Authorization: Bearer <token>`. La API valida el rol actual en la base de datos
en cada solicitud protegida.

## Imagen de produccion

La imagen multi-stage se define en `Dockerfile` y publica Vite compilado en
Nginx por el puerto 8080. `VITE_API_URL` se establece durante la compilacion:
usa `/api` si Nginx enruta al backend por la misma red, o la URL HTTPS completa
si los servicios viven en redes separadas. Nginx enruta `/socket.io/` al backend
para mantener las conexiones Socket.IO. La variable no es un secreto.
El mapa base usa teselas publicas de OpenStreetMap y conserva su atribucion;
para cargas grandes, revisa las politicas de uso de teselas o configura un
proveedor/servidor de mapas apropiado para el despliegue.

Ejecuta `npm run build` y `npm run lint` antes de publicar la imagen.
