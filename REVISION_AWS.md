# Verificación y preparación AWS — 6 de noviembre de 2026

## Resultado

Los flujos comprobados funcionan en contenedores Linux aislados con PostgreSQL /
PostGIS real y Nginx. También se ensayó `NODE_ENV=production`, el lanzador de
despliegue, TLS con CA de prueba confiada explícitamente y un usuario PostgreSQL
sin permisos de administración. No se creó infraestructura ni se desplegó en AWS.

## Correcciones de esta revisión

- Healthcheck PostgreSQL por TCP: evita aceptar como lista la instancia temporal
  de inicialización que solo escucha por socket Unix.
- Nginx responde HTTP 413 en JSON al exceder 2 MiB; la interfaz recibe el mensaje
  de límite en lugar de una página HTML que no puede interpretar.
- Controles para reemplazar fotos adaptados a pantallas estrechas; se comprobó
  en navegador ancho de página y viewport de 552 px, sin desbordamiento horizontal.
- Imágenes base Node y Nginx fijadas a los mismos digests comprobados en las builds.

## Evidencia de verificación

- **85/85 pruebas de backend** y **1/1 del lanzador de desarrollo** aprobadas.
- Lint frontend sin advertencias; frontend compilado correctamente en Linux.
- Imágenes backend/frontend construidas con sus Dockerfiles reales.
- Auditoría npm: **0 vulnerabilidades reportadas**, backend de producción y frontend.
  Esto no equivale a una auditoría de todo el sistema operativo o de AWS.
- CloudFormation `infrastructure.json` y `registry.json` validados con `cfn-lint`
  dentro de un contenedor temporal, sin errores ni advertencias.
- Compose de producción validado con `docker compose config --quiet` y valores
  ficticios; sintaxis de JavaScript, Bash y PowerShell comprobada.
- Migraciones completas ejecutadas contra PostGIS real; migraciones/seed también
  ejecutados mediante `backend/deploy/entrypoint.cjs` en modo producción con TLS.
- Consulta `pg_stat_ssl`: usuario **incidencias_app**, `ssl=true`, **TLSv1.3**.
- Smoke HTTP integrado mediante Nginx: registro/login ciudadano, rechazo del login
  ciudadano para personal, login de personal, creación de administrador, permisos
  por rol, reporte geolocalizado, mapas y agrupaciones PostGIS, contactos y llamadas.
- Fotos: límite de 2 MiB, rechazo de contenido inválido, varias fotos, reemplazo con
  recorte/giro, consulta completa/miniatura, privacidad por propietario y borrado.
- Borrado de un reporte comprobado contra SQL y disco: elimina el archivo local.
- Notificaciones guardadas, marcadas como leídas y recibidas mediante una conexión
  real Socket.IO/WebSocket que atraviesa Nginx.
- Reporte/foto conservados tras recrear los contenedores de aplicación.
- Navegador: login, consulta de fotos, recorte, giro y guardado, agregar otra foto,
  rechazo de archivo >2 MB y revisión visual de controles en pantalla estrecha.

La captura y los datos ficticios del ensayo están en `output/aws-verify/`, excluidos
de Git. El entorno usa el proyecto Compose `incidencias-verify` y puerto 18080,
sin modificar la base o los contenedores de desarrollo existentes.

## Preparación entregada

- Plantillas CloudFormation: ECR y pila de aplicación con VPC, EC2, EBS cifrado,
  ALB HTTPS, RDS privado, secretos, WAF y alarma de salud.
- Bootstrap para montar el disco exacto, recuperar secretos, migrar, crear cuentas
  iniciales y arrancar bajo systemd, con señal de finalización a CloudFormation.
- Proceso habitual con usuario de BD restringido; secretos master/admin solo en
  jobs de bootstrap y archivos temporales eliminados después de usarlos.
- Compose de producción, script de publicación de imágenes Linux AMD64 por digest,
  script generador de plantilla, entorno de ensayo y guía paso a paso.
- Fotos solo en EBS persistente, sin S3 ni copia/snapshot de fotos configurados.

## Límites de esta verificación

No hay AWS CLI configurado/disponible ni una cuenta AWS conectada en esta revisión.
No se ejecutó el script que crea ECR o la pila de producción. Aún se necesitan
cuenta/SSO, región, dominio y certificado ACM validado para ejecutar la guía.
No se validaron contra AWS real cuotas, IAM/SSM, descarga de secretos desde EC2,
bootstrap Amazon Linux, conectividad/certificado reales de RDS, WAF, ALB o DNS.
La validación estática no sustituye esa prueba de aceptación en la cuenta destino.

La revisión del navegador cubre el flujo principal de fotos; no constituye una
revisión exhaustiva de todos los tamaños, dispositivos o pantallas del sistema.
No se realizaron pruebas de carga, restauración de RDS, failover o corte de disco.

La aplicación comienza con una EC2 y RDS Single-AZ. Los listados no están paginados;
debe medirse su comportamiento antes de grandes volúmenes. Socket.IO y fotos
locales impiden escalar a varias instancias sin adaptar su almacenamiento/estado.
El reemplazo de EC2 requiere desmontar y volver a adjuntar el mismo EBS en la misma
AZ; no es un despliegue sin interrupciones. Actualizar UserData no ejecuta un release.

Los archivos y la base no comparten una transacción atómica: un corte abrupto o
fallo de limpieza puede dejar archivos huérfanos. Las fotos no tienen respaldo;
perder/eliminar el disco implica perderlas. Restaurar RDS no restaura los archivos.
No se configuraron avisos SNS por correo ni una alarma de ocupación de disco;
la guía indica cómo revisar la salud y el espacio disponible.

Consulta `DESPLIEGUE_AWS.md` para ejecución, costos, límites y validación final.
