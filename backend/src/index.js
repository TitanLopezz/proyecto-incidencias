require('./infrastructure/config/loadEnvironment')()

const http = require('node:http')
const { randomBytes, createHash } = require('node:crypto')
const ManageTelegram = require('./application/use-cases/ManageTelegram')
const PostgresTelegramLinks = require('./infrastructure/persistence/PostgresTelegramLinks')
const DeliverTelegramNotification = require('./application/use-cases/DeliverTelegramNotification')
const PostgresTelegramNotificationOutbox = require('./infrastructure/persistence/PostgresTelegramNotificationOutbox')
const TelegramBotNotificationSender = require('./infrastructure/telegram/TelegramBotNotificationSender')
const startTelegramNotificationWorker = require('./infrastructure/telegram/startTelegramNotificationWorker')
const ManageTeam = require('./application/use-cases/ManageTeam')
const PostgresTeamRepository = require('./infrastructure/persistence/PostgresTeamRepository')
const CreateIncident = require('./application/use-cases/CreateIncident')
const GetIncidents = require('./application/use-cases/GetIncidents')
const RegisterUser = require('./application/use-cases/RegisterUser')
const LoginUser = require('./application/use-cases/LoginUser')
const GetCurrentUser = require('./application/use-cases/GetCurrentUser')
const CreateAdmin = require('./application/use-cases/CreateAdmin')
const ListAdmins = require('./application/use-cases/ListAdmins')
const UpdateIncident = require('./application/use-cases/UpdateIncident')
const UpdateIncidentStatus = require('./application/use-cases/UpdateIncidentStatus')
const GetIncidentHeatmap = require('./application/use-cases/GetIncidentHeatmap')
const GetSpatialClusters = require('./application/use-cases/GetSpatialClusters')
const ArchiveIncident = require('./application/use-cases/ArchiveIncident')
const ManageIncidentAssignments = require('./application/use-cases/ManageIncidentAssignments')
const IncidentAssignmentPolicy = require('./domain/services/IncidentAssignmentPolicy')
const PostgresIncidentAssignments = require('./infrastructure/persistence/PostgresIncidentAssignments')
const GetUserNotifications = require('./application/use-cases/GetUserNotifications')
const MarkNotificationAsRead = require('./application/use-cases/MarkNotificationAsRead')
const createApp = require('./infrastructure/http/createApp')
const DatabaseConnection = require('./infrastructure/database/connection')
const migrateDatabase = require('./infrastructure/database/migrate')
const PostgresIncidentRepository = require('./infrastructure/persistence/PostgresIncidentRepository')
const PostgresUserRepository = require('./infrastructure/persistence/PostgresUserRepository')
const PostgresNotificationRepository = require('./infrastructure/persistence/PostgresNotificationRepository')
const createSocketServer = require('./infrastructure/websocket/SocketServer')
const SocketNotificationSender = require('./infrastructure/websocket/SocketNotificationSender')
const BcryptPasswordHasher = require('./infrastructure/security/BcryptPasswordHasher')
const JwtTokenService = require('./infrastructure/security/JwtTokenService')
const loadConfig = require('./infrastructure/config/loadConfig')
const { LocalIncidentPhotos } = require('./infrastructure/persistence/LocalIncidentPhotos')

async function startServer() {
  const config = loadConfig()
  const telegramSecret = process.env.TELEGRAM_INTEGRATION_KEY
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (telegramSecret && Buffer.byteLength(telegramSecret) < 32) {
    throw new Error('TELEGRAM_INTEGRATION_KEY debe tener al menos 32 bytes.')
  }
  if (telegramBotToken && (!telegramSecret || !/^\d+:[A-Za-z0-9_-]+$/.test(telegramBotToken))) {
    throw new Error('Configura un token válido de Telegram y la clave de integración para habilitar avisos.')
  }
  const tokenService = new JwtTokenService(config.jwtSecret)
  const database = DatabaseConnection.getInstance(config)

  try {
    if (process.env.MIGRATE_ON_START === 'true') {
      await migrateDatabase(database)
    }
    await database.query('SELECT 1')
  } catch (error) {
    await database.close()
    throw new Error(
      `No se pudo conectar con PostgreSQL o preparar el esquema: ${error.message}`,
      { cause: error },
    )
  }

  const notificationRepository = new PostgresNotificationRepository(database)
  const incidentRepository = new PostgresIncidentRepository(database, notificationRepository)
  const createIncident = new CreateIncident(incidentRepository)
  const listIncidents = new GetIncidents(incidentRepository)
  const telegram = telegramSecret && new ManageTelegram({
    links: new PostgresTelegramLinks(database),
    codes: {
      issue: () => randomBytes(32).toString('base64url'),
      hash: code => createHash('sha256').update(code).digest('hex'),
    },
    createIncident,
    listIncidents,
    notificationsAvailable: Boolean(telegramBotToken),
  })
  const userRepository = new PostgresUserRepository(database)
  const notificationSender = new SocketNotificationSender()
  const passwordHasher = new BcryptPasswordHasher()
  const staffLogin = new LoginUser({
    userRepository,
    passwordHasher,
    tokenService,
    allowedRoles: ['admin', 'superadmin'],
  })
  const app = createApp({
    telegramSecret,
    photoService: new LocalIncidentPhotos(database),
    useCases: {
      team: new ManageTeam(new PostgresTeamRepository(database)),
      telegram,
      createIncident,
      listIncidents,
      updateIncident: new UpdateIncident(incidentRepository, notificationSender),
      updateIncidentStatus: new UpdateIncidentStatus(
        incidentRepository,
        notificationSender,
      ),
      getIncidentHeatmap: new GetIncidentHeatmap(incidentRepository),
      getSpatialClusters: new GetSpatialClusters(incidentRepository),
      getUserNotifications: new GetUserNotifications(notificationRepository),
      markNotificationAsRead: new MarkNotificationAsRead(notificationRepository),
      archiveIncident: new ArchiveIncident(incidentRepository),
      incidentAssignments: new ManageIncidentAssignments({
        repository: new PostgresIncidentAssignments(database),
        policy: new IncidentAssignmentPolicy({
          dueHours: config.assignmentDueHours,
          escalationHours: config.assignmentEscalationHours,
        }),
        clock: () => new Date(),
      }),
      registerUser: new RegisterUser({ userRepository, passwordHasher, tokenService }),
      loginUser: new LoginUser({ userRepository, passwordHasher, tokenService }),
      staffLogin,
      getCurrentUser: new GetCurrentUser(userRepository),
      createAdmin: new CreateAdmin({ userRepository, passwordHasher }),
      listAdmins: new ListAdmins(userRepository),
    },
    tokenService,
    userRepository,
    frontendOrigins: config.frontendOrigins,
    trustProxyHops: config.trustProxyHops,
    jsonBodyLimit: config.jsonBodyLimit,
    readinessCheck: () => database.query('SELECT 1'),
  })
  const server = http.createServer(app)
  const io = createSocketServer({
    server,
    tokenService,
    userRepository,
    frontendOrigins: config.frontendOrigins,
  })
  notificationSender.attach(io)
  let stopTelegramWorker = async () => {}
  server.on('error', (error) => {
    console.error(`No se pudo iniciar la API en el puerto ${config.port}: ${error.message}`)
    io.close(async () => {
      try {
        await stopTelegramWorker()
        await database.close()
      } catch (poolError) {
        console.error('Error al cerrar la conexión a PostgreSQL:', poolError)
        process.exitCode = 1
      }
    })
    process.exitCode = 1
  })
  server.listen(config.port, '0.0.0.0', () => {
    if (telegramBotToken) {
      stopTelegramWorker = startTelegramNotificationWorker(new DeliverTelegramNotification({
        outbox: new PostgresTelegramNotificationOutbox(database),
        sender: new TelegramBotNotificationSender(telegramBotToken),
      }))
    }
    console.log(`API escuchando en el puerto ${config.port}.`)
  })

  let isShuttingDown = false
  const shutdown = () => {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    const forceShutdown = setTimeout(() => {
      console.error('Se agotó el plazo de cierre de la API.')
      process.exit(1)
    }, 25000)
    forceShutdown.unref()

    io.close(async () => {
      try {
        await stopTelegramWorker()
        await database.close()
        clearTimeout(forceShutdown)
      } catch (poolError) {
        console.error('Error al cerrar la conexión a PostgreSQL:', poolError)
        process.exitCode = 1
      }
    })
    server.closeIdleConnections?.()
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

startServer().catch((error) => {
  console.error('No se pudo iniciar la API:', error)
  process.exitCode = 1
})
