# Bot de Telegram para incidencias

Cada ciudadano vincula un chat privado de Telegram desde su panel. El botón **Abrir Telegram** genera un enlace de un solo uso, válido durante diez minutos. Al pulsar **Iniciar**, el bot puede registrar y consultar los reportes de esa cuenta. **Desvincular** revoca el acceso y cualquier enlace pendiente.

## Configuración

1. Crea un bot con [BotFather](https://t.me/BotFather) y guarda su token en una credencial **Telegram API** de n8n.
2. Importa `telegram-incidencias.json` en n8n y asigna la credencial a **Telegram Trigger** y **Responder en Telegram**. Telegram requiere que el webhook de n8n sea accesible públicamente por HTTPS. Para una instalación detrás de un proxy, configura `WEBHOOK_URL` con la URL pública. [Documentación de n8n](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/common-issues/).
3. Genera una clave aleatoria de al menos 32 bytes y configúrala como `TELEGRAM_INTEGRATION_KEY` en el backend. En AWS, guárdala en el secreto JSON de la aplicación y actualiza el archivo de secretos antes de reiniciar el backend. Aplica la migración `010_link_telegram_chats.sql` mediante el proceso habitual de migraciones.
4. En n8n crea una credencial **Header Auth** con nombre de cabecera `X-Telegram-Integration-Key` y el mismo valor. Asígnala a **API de incidencias**.
5. Cambia `https://incidencias.example` por la URL HTTPS de la aplicación en **API de incidencias**. Si usas otro bot, cambia su nombre de usuario en `frontend/src/components/TelegramAccount.jsx` antes de compilar el frontend.
6. Publica el flujo. Desde el panel ciudadano, pulsa **Abrir Telegram**, luego **Iniciar**, y verifica que el reporte que envíes desde Telegram aparezca en ese mismo panel.

   ```text
   /reportar bache | Bache en la calle | Frente al parque | 16.75 | -93.11
   ```

Envía `hola`, `menú` o `/start` para abrir el menú. Pulsa **Consultar mi reporte**, **Mis reportes recientes**, **Registrar incidencia** o **Ayuda**. También puedes responder con el número de una opción. **Mis reportes recientes** muestra hasta tres incidencias de la cuenta del bot con su estado y folio. Para registrar, puedes enviar los cinco datos del ejemplo directamente o usar `/reportar`. Las categorías admitidas son `bache`, `alumbrado` y `basura`. La API valida que las coordenadas correspondan a Tuxtla Gutiérrez.

## Seguimiento

Envía el folio completo por sí solo o usa `/estado <folio>`. El bot consulta los reportes de la cuenta vinculada y muestra el estado actual: abierta, en proceso, resuelta o cerrada. Para probar el seguimiento, consulta el folio recién creado, cambia su estado desde la aplicación con una cuenta de personal y vuelve a consultarlo.

## Avisos voluntarios de estado

El flujo de n8n atiende las conversaciones. El backend usa el mismo bot para
enviar avisos iniciados por el sistema. Habilita esta función configurando
`TELEGRAM_BOT_TOKEN` con el token del bot de n8n, además de
`TELEGRAM_INTEGRATION_KEY`. Guarda el token en el `.env` local ignorado o,
en AWS, en el secreto JSON de la aplicación que lee el backend. Aplica la
migración `013_reliable_incident_notifications.sql` antes de iniciar la API
actualizada. Si el token está vacío, la bandeja web y las conversaciones de
n8n siguen disponibles, y el panel muestra que el envío automático está deshabilitado.

Después de vincular el chat, el ciudadano puede activar o desactivar los avisos
desde **Seguimiento por Telegram**. El mensaje contiene solo el folio y el nuevo
estado. Desactivar o desvincular cancela los envíos pendientes. Un mensaje que
el proveedor ya esté procesando puede llegar después de ese cambio.

El procesador consulta PostgreSQL cada cinco segundos. Si Telegram confirma un
límite temporal (`429`), espera el intervalo indicado por el proveedor o el
intervalo de reintento, el que sea mayor. Permite hasta cinco intentos totales.
Los rechazos definitivos quedan como `failed`. Una respuesta perdida, un error
ambiguo o una interrupción del procesador deja el evento como `uncertain`.
Estos casos se revisan manualmente porque Telegram pudo aceptar el mensaje.
El aviso web queda disponible incluso si Telegram falla.

Para revisar la cola sin consultar datos personales, usa una cuenta operativa
autorizada y ejecuta:

```sql
SELECT delivery_state, last_result, count(*)
FROM telegram_notification_outbox
GROUP BY delivery_state, last_result;
```

Antes de habilitar la función en producción, vincula un chat de prueba, activa
los avisos, cambia un estado y confirma el mensaje en Telegram y la bandeja web.

## Producción

Despliega primero la aplicación y su API siguiendo [la guía de AWS](../DESPLIEGUE_AWS.md). Para n8n, aprovisiona una instancia EC2 `t3.small` independiente con Linux y Docker Compose. Asigna un dominio público a esa instancia y habilita los puertos TCP 80 y 443 para que Caddy obtenga el certificado. El editor escucha solo en la interfaz local del host. El proxy público admite las rutas de prueba y producción del disparador de Telegram. [Configuración del webhook en n8n](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/).

1. Desde esta carpeta, copia `.env.example` a `.env` y configura el dominio. El ejemplo fija por digest las imágenes de n8n 2.43.5 y Caddy 2 usadas en la verificación. Si actualizas n8n, usa una versión compatible con `N8N_WEBHOOK_URL` (2.35 o posterior). Crea una clave de cifrado aleatoria de al menos 32 bytes en un archivo fuera del repositorio. Indica su ruta absoluta en `N8N_ENCRYPTION_KEY_PATH` y asegúrate de que el usuario del contenedor n8n pueda leerlo. Respalda esa clave junto con el volumen `n8n_data` para poder restaurar las credenciales.
2. Ejecuta `docker compose --env-file .env -f compose.production.yml config --quiet` y después `docker compose --env-file .env -f compose.production.yml up -d --wait`.
3. Desde tu equipo, abre un túnel con `ssh -N -L 5679:127.0.0.1:5679 usuario@host` y visita `http://localhost:5679`. Si el n8n local usa el puerto 5679, detén temporalmente esa instancia para liberar el puerto.
4. Configura la cuenta de n8n e importa el flujo. Configura las credenciales de Telegram y Header Auth, y la URL pública de la API en **API de incidencias**. Los reportes y folios pertenecen a la base de datos de la API configurada.
5. Valida el flujo con un bot de pruebas. Al migrar el token de Tuxtla, despublica primero el flujo local, publica el flujo de producción y prueba `/start`, el registro y la consulta del folio desde Telegram. Cada token de Telegram tiene un solo webhook. Para volver a la instalación local, despublica el flujo de producción antes de publicar el local. [Pruebas y webhooks de Telegram Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/common-issues/).
