# Laboratorio AWS con dos EC2

Para desplegar PostgreSQL/PostGIS y n8n en servidores separados, usa la [guía de cuatro EC2](FOUR_EC2.md).

## Revisión de arquitectura

- Backend. `domain` contiene entidades, reglas y puertos. `application` implementa los casos de uso e inyecta sus colaboradores. Revisé las importaciones de ambos directorios y se mantienen dentro del núcleo. Express, PostgreSQL/PostGIS, JWT, fotos y Socket.IO se conectan como adaptadores en `src/index.js`.
- Frontend. React y los clientes HTTP están en módulos distintos. El alta de incidencias usa `application/submitIncident.js`, con creación y carga de fotos inyectadas desde `incidentServices.js`. Varias pantallas todavía importan `api/` directamente, por lo que el frontend aplica la separación hexagonal de forma parcial.

## 1. Crear las instancias

En EC2, lanza dos instancias Amazon Linux 2023 x86_64 en la misma VPC, con una clave SSH del laboratorio. Para una prueba pequeña, usa t3.small si está disponible. Ambas necesitan salida a los repositorios de paquetes, Docker Hub y npm.

| Instancia | Entrada en el grupo de seguridad | Carga |
| --- | --- | --- |
| incidencias-frontend | TCP 22 desde tu IP /32 | React y Nginx |
| incidencias-backend | TCP 22 desde tu IP /32 y TCP 3000 desde el grupo del frontend | Node.js y PostgreSQL/PostGIS |

Para copiar por SSH directamente desde tu equipo, usa instancias con IP pública y una subred con ruta al Internet Gateway. El frontend usa un túnel SSH para servir el sitio en tu equipo. PostgreSQL y las fotos se guardan en volúmenes Docker de la EC2 del backend. La configuración de laboratorio usa HTTP entre las EC2 y PostgreSQL sin TLS dentro de su red Docker.

Instala Docker en ambas y comprueba que esté disponible el complemento Docker Compose v2 o posterior.

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo docker compose version
```

[Instalación de Docker en Amazon Linux 2023](https://docs.aws.amazon.com/es_es/serverless-application-model/latest/developerguide/install-docker.html). Si falta Compose, instala el complemento para Linux x86_64 siguiendo su documentación y vuelve a ejecutar la comprobación. [Instalación del complemento Compose](https://docs.docker.com/compose/install/linux/).

## 2. Subir solo el código de cada servicio

Ejecuta desde PowerShell, en la raíz del proyecto. Sustituye la ruta de la llave y ambas IP públicas.

```powershell
$Key = 'C:/ruta/lab.pem'
$Back = 'IP_PUBLICA_BACKEND'
$Front = 'IP_PUBLICA_FRONTEND'

tar -czf "$env:TEMP/incidencias-backend.tgz" backend/Dockerfile backend/package.json backend/package-lock.json backend/src backend/deploy aws/lab/backend.compose.yml
tar -czf "$env:TEMP/incidencias-frontend.tgz" frontend/Dockerfile frontend/package.json frontend/package-lock.json frontend/src frontend/public frontend/scripts frontend/index.html frontend/vite.config.js frontend/nginx.conf aws/lab/frontend.compose.yml

scp -i $Key "$env:TEMP/incidencias-backend.tgz" "ec2-user@${Back}:~/"
scp -i $Key "$env:TEMP/incidencias-frontend.tgz" "ec2-user@${Front}:~/"
```

## 3. Arrancar el backend

En la sesión SSH de la EC2 backend, extrae el paquete y genera los secretos una sola vez. Conserva el archivo al redeplegar para seguir usando la base existente.

```bash
mkdir -p ~/incidencias
cd ~/incidencias
tar -xzf ~/incidencias-backend.tgz
umask 077
if [ ! -f lab.env ]; then
  printf 'LAB_DB_PASSWORD=%s\nLAB_JWT_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > lab.env
fi
sudo docker compose --project-directory . --env-file lab.env -f aws/lab/backend.compose.yml up -d --build --wait
curl --fail http://127.0.0.1:3000/ready
```

Para habilitar el acceso del personal en una instalación nueva, inicializa las dos cuentas de superadministrador. Usa contraseñas distintas de 8 a 72 bytes y guárdalas antes de continuar. Ejecuta este paso una vez, ya que repetirlo cambia las contraseñas de ambas cuentas.

```bash
sudo docker compose --project-directory . --env-file lab.env -f aws/lab/backend.compose.yml exec backend sh -ec '
  printf "Contraseña para superadmin1@incidencias.local: "
  IFS= read -rs SUPERADMIN1_PASSWORD
  printf "\nContraseña para superadmin2@incidencias.local: "
  IFS= read -rs SUPERADMIN2_PASSWORD
  printf "\n"
  export SUPERADMIN1_PASSWORD SUPERADMIN2_PASSWORD
  npm run bootstrap:superadmins
'
```

## 4. Arrancar el frontend

En la sesión SSH de la EC2 frontend, sustituye el valor de ejemplo por la **IP privada** de la EC2 backend.

```bash
mkdir -p ~/incidencias
cd ~/incidencias
tar -xzf ~/incidencias-frontend.tgz
printf 'BACKEND_UPSTREAM=10.0.1.123:3000\n' > lab.env
sudo docker compose --project-directory . --env-file lab.env -f aws/lab/frontend.compose.yml up -d --build --wait
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/ready
curl --fail http://127.0.0.1:8080/api/health
```

## 5. Probar desde tu equipo

```powershell
ssh -i $Key -o ExitOnForwardFailure=yes -N -L 127.0.0.1:8080:127.0.0.1:8080 "ec2-user@$Front"
```

Mantén el túnel abierto y entra en `http://localhost:8080`. Registra una cuenta de prueba, crea una incidencia y comprueba que se vea en el listado y permita cargar una foto. En `http://localhost:8080/staff`, inicia sesión con una de las cuentas de superadministrador. `/ready` confirma la ruta Nginx → backend → PostgreSQL. Telegram y n8n quedan fuera del laboratorio.
