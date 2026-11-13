# Reglas de negocio — Sistema de incidencias

Fecha de elaboración: 7 de octubre de 2026.

## 1. Objetivo y alcance

El sistema permite registrar incidencias urbanas en Tuxtla Gutiérrez, consultar su avance y gestionar su atención mediante personal administrativo y contactos de equipos o cuadrillas.

Este documento describe las reglas identificadas en el código actual. Las observaciones del apartado 9 distinguen limitaciones de implementación y decisiones pendientes; no constituyen requisitos aprobados nuevos.

## 2. Actores y permisos

| Operación | Ciudadano (`citizen`) | Administrador (`admin`) | Superadministrador (`superadmin`) |
| --- | --- | --- | --- |
| Registrar incidencias | Sí | Sí | Sí |
| Consultar incidencias | Solo las propias | Todas | Todas |
| Editar, archivar y consultar incidencias archivadas | No | Sí | Sí |
| Cambiar estados | No | Sí | Sí |
| Consultar mapa de calor | No | Sí | Sí |
| Consultar y gestionar contactos | No | Sí | Sí |
| Consultar y registrar avisos al equipo | No | Sí | Sí |
| Consultar notificaciones y marcarlas como leídas | Solo las propias | No | No |
| Consultar y crear cuentas de administrador | No | No | Sí |

**RN-01.** Las operaciones protegidas requieren una sesión válida y el rol autorizado. El rol se obtiene de la cuenta registrada.

**RN-02.** El registro público crea únicamente ciudadanos, aunque el solicitante envíe un rol diferente.

**RN-03.** Los ciudadanos acceden por el inicio de sesión público; administradores y superadministradores acceden por el inicio de sesión del personal.

**RN-04.** Solo los superadministradores pueden crear administradores. Las cuentas creadas por esta operación reciben siempre el rol `admin` y quedan vinculadas al usuario que las creó.

**RN-05.** La aplicación no ofrece una operación HTTP para crear o promover superadministradores. Su inicialización se realiza mediante un procedimiento interno.

## 3. Registro de cuentas

**RN-06.** Para crear una cuenta se requieren nombre, correo electrónico y contraseña.

**RN-07.** El nombre no puede estar vacío y admite hasta 100 caracteres después de quitar espacios de los extremos.

**RN-08.** El correo debe tener un formato válido, admite hasta 254 caracteres y se guarda sin espacios en los extremos y en minúsculas.

**RN-09.** No pueden existir dos cuentas con el mismo correo normalizado, independientemente de su rol.

**RN-10.** La contraseña debe ocupar entre 8 y 72 bytes en UTF-8. Este límite se mide en bytes, por lo que algunos caracteres ocupan más de una unidad.

**RN-11.** Las contraseñas se almacenan como hashes y no se incluyen en los perfiles devueltos por la aplicación.

## 4. Registro y consulta de incidencias

**RN-12.** Toda incidencia nueva debe tener título, descripción, categoría y ubicación.

**RN-13.** El título debe contener texto y admitir como máximo 150 caracteres. La descripción debe contener texto y admitir como máximo 2,000 caracteres. Ambos se guardan sin espacios en sus extremos.

**RN-14.** Las categorías permitidas para nuevas incidencias son:

| Código | Categoría |
| --- | --- |
| `bache` | Bache |
| `alumbrado` | Alumbrado público |
| `basura` | Basura |

**RN-15.** La latitud y la longitud deben proporcionarse juntas como números finitos. La latitud debe estar entre −90 y 90 y la longitud entre −180 y 180.

**RN-16.** Además, la ubicación debe cumplir los límites configurados para la zona de atención: latitud de 16.45 a 16.95 y longitud de −93.35 a −92.90, incluidos los extremos. Estos límites forman un rectángulo geográfico; no representan una comprobación del polígono municipal oficial.

**RN-17.** Una incidencia nueva comienza en estado `abierta`. Su propietario es el usuario autenticado que la registra; no puede asignarse otro propietario desde los datos enviados.

**RN-18.** Un ciudadano consulta únicamente sus incidencias. El personal administrativo consulta todas. Los listados presentan primero las más recientes.

**RN-19.** Solo el personal administrativo puede editar el título y la descripción, cambiar el estado o archivar una incidencia existente.

**RN-20.** La edición general conserva las validaciones del título y la descripción y exige un estado válido. La operación actual no modifica categoría, ubicación ni propietario.

## 5. Ciclo de atención e historial

- El personal asigna incidencias abiertas o en proceso a un contacto activo del catálogo de cuadrillas. Repetir la misma asignación conserva un solo registro. Una reasignación guarda la cuadrilla, el contacto, el responsable y la fecha, y conserva el primer plazo.
- El plazo corre desde la recepción, incluso si falta asignar el reporte. La vista de personal marca folios vencidos y folios para supervisión. Un contacto eliminado o inactivo deja el folio pendiente de reasignación y conserva sus datos históricos.
- Las incidencias resueltas o cerradas dejan de contar como vencidas. El historial queda disponible al personal. El ciudadano ve el folio, el estado y la última actualización.

**RN-21.** Los únicos estados permitidos son `abierta`, `en_proceso`, `resuelta` y `cerrada`.

**RN-22.** Los cambios deben seguir esta secuencia:

```text
abierta → en_proceso → resuelta → cerrada
```

No se permiten saltos, retrocesos ni reapertura de incidencias cerradas. La operación específica de cambio de estado también rechaza solicitar el mismo estado actual. La edición general puede conservarlo cuando solo se modifica el texto.

**RN-23.** Al crear una incidencia se registra su estado inicial en el historial. Cada cambio posterior registra estado anterior, estado nuevo, fecha y usuario responsable.

**RN-24.** El cambio de estado y su registro de historial se guardan juntos: si falla alguno, se revierte esa operación.

**RN-25.** La edición registra quién modificó la incidencia y cuándo. El historial de estados agrega una entrada únicamente cuando cambia el estado.

**RN-26.** El archivo requiere un motivo de hasta 500 caracteres y guarda el responsable y la fecha. El folio, el historial, las evidencias y los avisos al equipo se conservan. El expediente sale de las listas activas y de la analítica. El personal puede consultar el expediente y sus fotos en solo lectura. Repetir la operación conserva el motivo y responsable originales.

## 6. Notificaciones

**RN-27.** Cuando se usa la operación específica de cambio de estado y la incidencia tiene propietario, se genera una notificación para ese propietario con el título de la incidencia y su nuevo estado.

**RN-28.** Las notificaciones nuevas comienzan como no leídas. Solo un ciudadano puede consultar sus propias notificaciones o marcarlas como leídas.

**RN-29.** Marcar una notificación exige que pertenezca al ciudadano autenticado. No se permite marcar notificaciones de otra cuenta.

**RN-30.** Después de guardar la notificación, el sistema intenta entregarla en tiempo real a la sesión privada de su destinatario.

## 7. Contactos y avisos a equipos

**RN-31.** Solo administradores y superadministradores pueden consultar, crear, editar o eliminar contactos y consultar o registrar avisos al equipo.

**RN-32.** Un contacto requiere nombre, equipo o cuadrilla y teléfono. El nombre y el equipo deben contener texto y admitir hasta 120 caracteres cada uno.

**RN-33.** El teléfono debe contener entre 7 y 15 dígitos y puede comenzar con `+`. El correo es opcional; si se proporciona, debe tener formato válido y hasta 254 caracteres. El horario es opcional y admite hasta 120 caracteres.

**RN-34.** La especialidad del contacto es opcional. Si se indica, debe corresponder a `bache`, `alumbrado` o `basura`.

**RN-35.** Un contacto puede estar activo o inactivo. Al crearlo, se considera activo salvo que se indique expresamente lo contrario. Se permite consultar únicamente los contactos activos.

**RN-36.** Para registrar un aviso se requiere un contacto existente y activo y un canal válido: `telefono` o `whatsapp`.

**RN-37.** El aviso puede vincularse a una incidencia. Si se proporciona ese vínculo, la incidencia debe existir. Las notas son opcionales y admiten hasta 2,000 caracteres.

**RN-38.** El responsable del aviso se obtiene de la sesión del personal que lo registra. Se conserva la fecha del registro y una copia del nombre, equipo y teléfono del contacto.

**RN-39.** Eliminar o modificar un contacto no elimina ni reescribe los datos históricos del contacto guardados en avisos anteriores. Si se elimina, su identificador de relación queda vacío.

**RN-40.** El historial de avisos se consulta del más reciente al más antiguo y puede filtrarse por incidencia.

## 8. Análisis geográfico

**RN-41.** Solo el personal administrativo puede consultar el mapa de calor, que incluye incidencias con ubicación registrada.

**RN-42.** Cada punto recibe un peso según el estado de la incidencia:

| Estado | Peso |
| --- | --- |
| Abierta | 1.0 |
| En proceso | 0.8 |
| Resuelta | 0.5 |
| Cerrada | 0.3 |

Los pesos definen la intensidad del mapa; no establecen por sí mismos plazos ni prioridades obligatorias de atención.

## 9. Observaciones y decisiones pendientes

- **Notificaciones:** la edición general y el cambio específico de estado guardan la transición y el aviso web juntos. Editar sin cambiar el estado no genera otro aviso. Los avisos de Telegram se activan voluntariamente desde el panel ciudadano y contienen solo el folio y el nuevo estado.
- **Propietarios del personal:** la API permite a administradores y superadministradores crear incidencias, pero la consulta de notificaciones está restringida a ciudadanos. Debe confirmarse si el personal también necesita recibirlas en su interfaz.
- **Cobertura territorial:** la validación actual usa límites rectangulares. Usar la frontera municipal exacta requiere datos y una validación adicionales.
- **Datos anteriores:** las migraciones permiten conservar incidencias antiguas sin categoría y registros previos sin ubicación. Los requisitos de registro descritos se aplican a nuevas incidencias.
- **Evidencias:** existe una tabla para URLs de fotografías, pero no se identificó una operación de carga de archivos. No se establece una fotografía obligatoria.
- **Atención:** el piloto usa 48 horas desde la recepción y marca revisión de supervisión al vencer. El municipio debe definir el plazo definitivo, el responsable de supervisión, los criterios de cierre y la política de duplicados.
- **Conservación:** el municipio debe definir los periodos de retención y el procedimiento aplicable a expedientes archivados.

## 10. Referencias de implementación

Estas fuentes permiten contrastar las reglas con el proyecto:

- [Entidades de dominio](backend/src/domain/entities): usuarios, categorías, incidencias y notificaciones.
- [Transiciones de estado](backend/src/domain/services/IncidentStatusTransitions.js).
- [Casos de uso](backend/src/application/use-cases): registro, acceso, administración y atención.
- [Rutas y permisos](backend/src/infrastructure/http/routes.js).
- [Permisos de notificaciones](backend/src/infrastructure/http/routes/notificationRoutes.js).
- [Persistencia de incidencias](backend/src/infrastructure/persistence/PostgresIncidentRepository.js).
- [Validaciones de contactos y avisos](backend/src/application/use-cases/ManageTeam.js).
- [Historial de avisos](backend/src/infrastructure/persistence/PostgresTeamRepository.js).
- [Migraciones de base de datos](backend/src/infrastructure/database/migrations).
