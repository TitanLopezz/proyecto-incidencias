# Laboratorio AWS con cuatro EC2

La plantilla crea cuatro instancias Amazon Linux 2023 x86_64 en una VPC. Cada instancia usa un disco EBS cifrado. Los puertos 3000 y 5432 quedan restringidos a los grupos de seguridad que aparecen en la tabla.

| EC2 | Servicio | Acceso |
| --- | --- | --- |
| Frontend | React y Nginx | Túnel SSH al puerto local 8080 |
| Backend | API Node.js y fotos | TCP 3000 desde frontend y n8n |
| Base de datos | PostgreSQL 15 con PostGIS | TCP 5432 desde backend |
| n8n | Automatizaciones, editor y webhook de Telegram | Editor por túnel SSH y webhook HTTPS mediante Caddy |

Las cuatro EC2 tienen IPv4 pública para descargar paquetes e imágenes. SSH acepta únicamente la IPv4 del operador. Solo Caddy abre puertos web a Internet. El tráfico de la aplicación dentro de la VPC usa HTTP y PostgreSQL sin TLS. Si vas a usar datos reales, revisa la [arquitectura de producción](../../DESPLIEGUE_AWS.md). EC2, EBS e IPv4 generan cargos. Los discos se conservan al eliminar las instancias y siguen generando cargos hasta que se eliminen.

## 1. Crear la infraestructura

En PowerShell, desde la raíz del repositorio y con AWS CLI autenticado, indica tu región, el nombre de una clave EC2 existente y tu IPv4 pública con máscara /32.

```powershell
$Region = 'us-east-1'
$Stack = 'incidencias-lab'
$KeyName = 'NOMBRE_CLAVE_EC2'
$OperatorCidr = '203.0.113.10/32'
aws cloudformation validate-template --region $Region --template-body file://aws/lab/four-ec2.json
aws cloudformation deploy --region $Region --stack-name $Stack --template-file aws/lab/four-ec2.json --parameter-overrides "KeyName=$KeyName" "OperatorCidr=$OperatorCidr" --no-execute-changeset
```

Revisa los cambios en CloudFormation y ejecuta el change set desde la consola. Al terminar, consulta las direcciones.

```powershell
aws cloudformation describe-stacks --region $Region --stack-name $Stack --query 'Stacks[0].Outputs' --output table
```

## 2. Preparar los servidores

En cada EC2 instala Docker, inicia el servicio e instala Compose como complemento para todos los usuarios en `/usr/local/lib/docker/cli-plugins`. Así estará disponible al ejecutar Docker con `sudo`. [Instalación de Docker en Amazon Linux](https://docs.aws.amazon.com/es_es/serverless-application-model/latest/developerguide/install-docker.html) · [Instalación manual de Compose](https://docs.docker.com/compose/install/linux/#install-the-plugin-manually).

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo docker compose version
```

Desde tu equipo, empaca los archivos versionados del commit que quieras desplegar. Git Archive incluye únicamente archivos de Git.

```powershell
$Key = 'C:/ruta/lab.pem'
$Front = 'FRONTEND_PUBLIC_IP'
$Back = 'BACKEND_PUBLIC_IP'
$Db = 'DATABASE_PUBLIC_IP'
$N8n = 'AUTOMATION_PUBLIC_IP'
$Bundle = Join-Path $env:TEMP 'incidencias-aws.tgz'
git archive --format=tar.gz -o $Bundle HEAD aws/lab backend frontend n8n
foreach ($Server in @($Front, $Back, $Db, $N8n)) {
  scp -i $Key $Bundle "ec2-user@${Server}:~/incidencias-aws.tgz"
  if ($LASTEXITCODE -ne 0) { throw "Falló la copia a $Server" }
}
```

Conéctate a cada instancia con `ssh -i $Key "ec2-user@$Server"`, sustituyendo `$Server` por la variable que corresponda. En cada sesión ejecuta lo siguiente.

```bash
mkdir -p ~/incidencias
cd ~/incidencias
tar -xzf ~/incidencias-aws.tgz
```

## 3. Iniciar PostgreSQL/PostGIS

En la EC2 de base de datos, usa el valor de `DatabasePrivateIp`. Genera la contraseña en tu gestor de contraseñas como una cadena hexadecimal aleatoria de al menos 48 caracteres. Usa el mismo valor en el backend.

```bash
umask 077
read -rp 'DatabasePrivateIp: ' db_ip
read -rsp 'Contraseña de PostgreSQL: ' db_password
printf '\n'
printf 'DB_PRIVATE_IP=%s\nLAB_DB_PASSWORD=%s\n' "$db_ip" "$db_password" > aws/lab/.env.db
unset db_password
sudo docker compose --project-directory . --env-file aws/lab/.env.db -f aws/lab/database.compose.yml up -d --wait
```

Conserva el archivo y la contraseña al redeplegar. PostgreSQL inicializa la contraseña cuando crea el volumen por primera vez.

## 4. Iniciar el backend

En la EC2 del backend, usa la misma IP privada y contraseña del paso anterior. Mantén el archivo para conservar la clave JWT entre despliegues.

```bash
umask 077
read -rp 'DatabasePrivateIp: ' db_ip
read -rsp 'Contraseña de PostgreSQL: ' db_password
printf '\n'
printf 'DB_PRIVATE_IP=%s\nLAB_DB_PASSWORD=%s\nLAB_JWT_SECRET=%s\n' \
  "$db_ip" "$db_password" "$(openssl rand -hex 32)" > aws/lab/.env.backend
unset db_password
sudo docker compose --project-directory . --env-file aws/lab/.env.backend -f aws/lab/backend-remote-db.compose.yml up -d --build --wait
curl --fail http://127.0.0.1:3000/ready
```

Inicializa las cuentas de personal con el [comando de superadministradores](README.md#3-arrancar-el-backend). En ese comando usa `--env-file aws/lab/.env.backend -f aws/lab/backend-remote-db.compose.yml`.

## 5. Iniciar el frontend

En la EC2 frontend, usa el valor de `BackendPrivateIp`.

```bash
read -rp 'BackendPrivateIp: ' backend_ip
printf 'BACKEND_UPSTREAM=%s:3000\n' "$backend_ip" > aws/lab/.env.frontend
sudo docker compose --project-directory . --env-file aws/lab/.env.frontend -f aws/lab/frontend.compose.yml up -d --build --wait
curl --fail http://127.0.0.1:8080/ready
```

Desde tu equipo, abre el túnel y entra en `http://localhost:8080`. Comprueba el alta de una incidencia con foto y el acceso de personal en `/staff`.

```powershell
ssh -i $Key -o ExitOnForwardFailure=yes -N -L 127.0.0.1:8080:127.0.0.1:8080 "ec2-user@$Front"
```

## 6. Iniciar n8n y conectar Telegram

1. Crea un registro DNS A para el subdominio del webhook y apúntalo a `AutomationPublicIp`, la IP elástica de n8n.
2. En la EC2 n8n, entra en `~/incidencias/n8n` y sigue los pasos 1 y 2 de [Producción de n8n](../../n8n/README.md#producción). Ejecuta los comandos de Docker con `sudo`. Crea el archivo de clave fuera del árbol de código y permite que el UID 1000 del contenedor lo lea.
3. En la EC2 backend, agrega `TELEGRAM_INTEGRATION_KEY` a `aws/lab/.env.backend` con una clave hexadecimal aleatoria de al menos 64 caracteres. Agrega `TELEGRAM_BOT_TOKEN` si vas a enviar avisos automáticos. Aplica los cambios con el comando `up` del paso 4.
4. Desde tu equipo, abre el editor con `ssh -i $Key -o ExitOnForwardFailure=yes -N -L 127.0.0.1:5679:127.0.0.1:5679 "ec2-user@$N8n"` y visita `http://localhost:5679`.
5. Importa `n8n/telegram-incidencias.json`. En el nodo **API de incidencias**, usa `http://BACKEND_PRIVATE_IP:3000/api/integrations/telegram` con el valor de `BackendPrivateIp`. Configura las credenciales de Telegram y Header Auth según la [guía del flujo](../../n8n/README.md#configuración). Publica primero con un bot de prueba y verifica `/start`, el alta y la consulta de un folio.

Conserva los archivos de entorno, los datos de PostgreSQL, las fotos y el volumen de n8n antes de reemplazar instancias. Guarda también la clave de cifrado de n8n junto a su respaldo. Después de un reemplazo, actualiza las IP privadas que usen frontend, backend o el flujo de n8n.
