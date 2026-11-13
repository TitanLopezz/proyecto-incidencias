# Despliegue en AWS desde cero

La preparación usa **una EC2, RDS PostgreSQL privado y ALB HTTPS**. Las fotos se
guardan únicamente en un volumen EBS cifrado, en `/srv/incidencias/photos`.
EBS es el disco del servidor alojado en AWS; no hay segunda copia, S3, AWS Backup
ni snapshots automáticos de fotos. PostgreSQL guarda solo referencias.

La aplicación y RDS comienzan con una instancia cada uno, sin alta disponibilidad.
No escales a varias EC2: antes debes adaptar los archivos locales y Socket.IO.

## Archivos

- `aws/registry.json`: repositorios ECR privados, cifrados y con tags inmutables.
- `aws/infrastructure.json`: plantilla CloudFormation generada para revisar.
- `aws/build-template.cjs`: regenera la plantilla con los archivos actuales.
- `aws/compose.production.json` y `aws/bootstrap.sh`: arranque en EC2.
- `backend/deploy/entrypoint.cjs`: secretos, migraciones, permisos y arranque.
- `aws/prepare-images.ps1`: crea ECR y publica imágenes cuando lo ejecutas.
- `aws/compose.verify.json` y `scripts/aws-smoke.cjs`: prueba local aislada.

El tablero de asignaciones usa 48 horas desde la recepción y marca supervisión
al vencer. Para ajustar los valores en una instancia desplegada, configura
`INCIDENT_DUE_HOURS` e `INCIDENT_ESCALATION_HOURS` en el `.env` del Compose
de producción y vuelve a iniciar el servicio backend.

El bot de Telegram se despliega en una EC2 `t3.small` separada después de la API. Su
Compose de producción, el proxy HTTPS y el procedimiento para migrar el webhook
están en [la guía del bot](n8n/README.md#producción).

La plantilla crea VPC, ALB en dos subredes públicas, EC2 con salida a Internet,
RDS en dos subredes privadas, secretos, WAF con límites por IP y alarma de salud.
Solo el ALB puede alcanzar el puerto 8080 de EC2; PostgreSQL solo acepta EC2.
No se abre SSH. Administra con SSM Session Manager; se exige IMDSv2.
No se crea NAT Gateway. EC2 tiene IP pública para salida a ECR, SSM y actualizaciones,
pero su security group impide el acceso directo desde Internet.

## Requisitos

1. Cuenta y región AWS; AWS CLI v2 autenticado con SSO. No guardes claves en el chat.
2. Docker Desktop, Node.js y PowerShell 7.
3. Dominio/subdominio propio y certificado público ACM en estado `ISSUED`, en la
   misma región del ALB. Solicítalo en ACM y valida su registro DNS.
4. Permisos para CloudFormation, ECR, EC2/VPC/EBS, RDS, Secrets Manager, IAM/PassRole,
   ALB, WAFv2, CloudWatch y SSM. La plantilla requiere `CAPABILITY_IAM`.
5. Verifica cuotas y disponibilidad regional de `t3.small`, `db.t4g.small` y
   PostGIS en la versión predeterminada de RDS PostgreSQL. No se fija un minor
   obsoleto: RDS elige su versión predeterminada disponible.

**Costos:** EC2, EBS, RDS, ALB, IPv4, WAF, secretos y transferencia generan cargos.
No se promete gratuidad. Revisa AWS Pricing Calculator y configura presupuesto.
RDS, EBS, secretos y ECR se retienen al eliminar la pila y siguen generando cargos.

## Verificar localmente

Los siguientes comandos usan datos y volúmenes separados de desarrollo:

```powershell
npm test --prefix backend
node --test scripts/dev-all.test.js
npm run lint --prefix frontend
npm run build --prefix frontend
docker compose -f aws/compose.verify.json build
docker compose -f aws/compose.verify.json up -d --wait --wait-timeout 180 db backend frontend
docker compose -f aws/compose.verify.json run --rm --no-deps smoke
docker compose -f aws/compose.verify.json up -d --force-recreate --wait --wait-timeout 180 backend frontend
docker compose -f aws/compose.verify.json run --rm --no-deps smoke persistence
```

La aplicación de prueba está en `http://localhost:18080`. Sus credenciales ficticias
se escriben en `output/aws-verify/state.json` para revisión del UI. El smoke prueba
PostGIS real, roles, límite de fotos, formatos, agregar/recortar/girar/reemplazar/
eliminar, contactos, llamadas y notificaciones Socket.IO por Nginx. La segunda
fase comprueba fotos tras recrear contenedores. No verifica infraestructura AWS real.
Para detenerlo sin borrar sus volúmenes: `docker compose -f aws/compose.verify.json stop`.

### Ensayo adicional de producción y TLS

Una vez iniciada la base de verificación anterior, estos comandos preparan
credenciales ficticias y un certificado exclusivo de prueba; no se usan en AWS:

```powershell
node scripts/prepare-tls-verify.cjs
docker compose -f aws/compose.verify.json exec -T --user postgres db openssl req -x509 -nodes -newkey rsa:2048 -keyout /var/lib/postgresql/data/verify.key -out /var/lib/postgresql/data/verify.crt -days 2 -subj /CN=db -addext subjectAltName=DNS:db
docker compose -f aws/compose.verify.json cp db:/var/lib/postgresql/data/verify.crt output/aws-verify/secrets/rds-ca.pem
docker compose -f aws/compose.verify.json -f aws/compose.tls-verify.json up -d --wait db
docker compose -f aws/compose.verify.json -f aws/compose.tls-verify.json run --rm --no-deps backend migrate
docker compose -f aws/compose.verify.json -f aws/compose.tls-verify.json run --rm --no-deps backend seed
docker compose -f aws/compose.verify.json -f aws/compose.tls-verify.json up -d --wait --wait-timeout 180 backend frontend
docker compose -f aws/compose.verify.json -f aws/compose.tls-verify.json run --rm --no-deps smoke
```

El certificado se confía únicamente en este entorno y la verificación TLS sigue
habilitada. El override de prueba monta todos los secretos ficticios para facilitar
el ensayo; el Compose de producción no monta secretos master/admin en el servicio.
Los secretos de ensayo cambian al volver a ejecutar el preparador: vuelve a migrar
y reiniciar si los regeneras. El certificado de prueba dura solo dos días.

## Publicar imágenes

Este script **sí crea repositorios y escribe en AWS cuando lo ejecutas**. No crea
todavía EC2/RDS/ALB. Sustituye los ejemplos por los valores reales:

```powershell
./aws/prepare-images.ps1 -Region us-east-1 -DomainName incidencias.tudominio.com -CertificateArn arn:aws:acm:us-east-1:123456789012:certificate/REEMPLAZAR
```

Valida identidad, certificado y plantilla, crea `incidencias-registry`, construye
Linux AMD64, publica imágenes y escribe `aws/parameters.local.json` con los digests.
No guarda contraseñas; el archivo se excluye de Git. Revisa el escaneo ECR.

## Revisar y ejecutar infraestructura

```powershell
aws cloudformation create-change-set --region us-east-1 --stack-name incidencias-prod --change-set-name primera-instalacion --change-set-type CREATE --template-body file://aws/infrastructure.json --parameters file://aws/parameters.local.json --capabilities CAPABILITY_IAM
aws cloudformation wait change-set-create-complete --region us-east-1 --stack-name incidencias-prod --change-set-name primera-instalacion
aws cloudformation describe-change-set --region us-east-1 --stack-name incidencias-prod --change-set-name primera-instalacion
```

Después de revisar recursos, tamaños, costos y región:

```powershell
aws cloudformation execute-change-set --region us-east-1 --stack-name incidencias-prod --change-set-name primera-instalacion
aws cloudformation wait stack-create-complete --region us-east-1 --stack-name incidencias-prod
aws cloudformation describe-stacks --region us-east-1 --stack-name incidencias-prod --query 'Stacks[0].Outputs'
```

El bootstrap tiene 30 minutos y señala éxito/fallo a CloudFormation después de
comprobar los contenedores y `/ready`. Si falla, consulta Events y, por SSM,
`/var/log/cloud-init-output.log`. No publiques logs sin revisar su contenido.

Se usa la CA oficial de RDS con TLS verificado. Solo los jobs de migración/seed
reciben la contraseña master. El proceso habitual usa `incidencias_app` sin
permisos de administración. Los archivos temporales master/admin se borran al
terminar bootstrap. El rol IAM del servidor puede recuperar secretos para
mantenimiento: considera administradores a quienes puedan usar SSM en esa EC2.

Las cuentas iniciales son `superadmin1@incidencias.local` y
`superadmin2@incidencias.local`. Consulta sus contraseñas aleatorias privadamente
en Secrets Manager usando outputs `AdminOneSecretArn` y `AdminTwoSecretArn`.
No las pegues en el chat, terminal compartida o logs.

## DNS y validación real

### Activar Telegram en AWS

1. Despliega primero la API con la migración `013_reliable_incident_notifications.sql`
   aplicada por el job de migraciones. Prepara la EC2 `t3.small` dedicada a n8n
   siguiendo [la guía del bot](n8n/README.md#producción).
2. Edita `AppSecretArn` en Secrets Manager conservando `DB_PASSWORD`. Agrega
   `TELEGRAM_INTEGRATION_KEY` (una clave aleatoria de al menos 32 bytes) y
   `TELEGRAM_BOT_TOKEN` (el mismo token que usa n8n). Usa la clave de integración
   en la credencial Header Auth de n8n.
3. Copia `aws/refresh-app-secret.sh` a la EC2 de la aplicación y ejecútalo
   mediante Session Manager con `sudo bash refresh-app-secret.sh REGION APP_SECRET_ARN`.
   El script valida el secreto y recrea el backend y Nginx para cargar el archivo
   nuevo y resolver la dirección actual del backend.
4. Con un bot y una cuenta de prueba, verifica la vinculación, el alta, la
   consulta y un cambio de estado con aviso en web y Telegram. Luego desactiva
   los avisos y confirma que el siguiente cambio solo aparece en la web.
   Antes de mover el bot activo, despublica el flujo local para liberar su webhook.

### Comprobaciones de la aplicación

1. Crea CNAME del subdominio a `LoadBalancerDns`; para dominio raíz usa Alias
   de Route 53 u otra solución compatible de tu proveedor.
2. Comprueba HTTPS, redirección HTTP y `https://tu-dominio/ready` con HTTP 200.
3. Prueba registro/login, `/staff`, creación de administrador y permisos por rol.
4. Crea reporte en Tuxtla, agrega fotos, rechaza >2 MB, recorta/gira/reemplaza/
   elimina y comprueba que otro ciudadano no accede.
5. Prueba estados, notificaciones, mapas, contactos y llamadas.
6. Reinicia contenedores y confirma persistencia de reportes y fotos.
7. Revisa espacio con `df -h /srv/incidencias` y alarma CloudWatch. La alarma
   marca fallo de salud; configura SNS si necesitas correo de aviso.

RDS conserva backups de datos/referencias durante 7 días, **no de fotos**.
`Retain` conserva el mismo disco EBS; no crea una copia. Revisa si tu organización
tiene políticas AWS Backup que incluyan todos los discos: esta plantilla no las crea.

## Reinicios, releases y recuperación

Reinicio normal por SSM: `sudo systemctl restart incidencias`. Systemd exige el
montaje EBS antes de arrancar; las fotos no viven en la capa del contenedor.

Para actualizar, publica nuevos digests, guarda la versión anterior de
`/opt/incidencias/.env`, modifica sus digests, autentica ECR y ejecuta
`docker compose -f compose.production.json pull`. Obtén temporalmente el secreto
master, ejecuta el job `backend migrate` como en bootstrap y borra ese archivo.
Después ejecuta `docker compose -f compose.production.json up -d --force-recreate --wait backend frontend`.
Recrea ambos servicios para que Nginx resuelva el backend actual. No repitas el seed.

No actualices imágenes mediante UserData/CloudFormation sin planificar: UserData
puede reiniciar EC2 y no se ejecuta de nuevo automáticamente. Para reemplazar EC2,
detén el servicio, desmonta/desadjunta EBS, conserva su AZ y vuelve a adjuntar/importar
ese mismo volumen. EBS no puede montarse en ambas instancias simultáneamente.
Verifica UID/GID 1000 y `fstab`. Este reemplazo requiere mantenimiento manual.

No borres el volumen si quieres conservar fotos: no tienen respaldo. Restaurar
solo RDS no restaura archivos; revisa referencias al recuperar la base.

## Fuentes oficiales

- [PostGIS en RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html)
- [Secretos RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)
- [Retención de recursos](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-updatereplacepolicy.html)
- [Cabeceras ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html)
- [Docker en Amazon Linux](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-docker.html)
