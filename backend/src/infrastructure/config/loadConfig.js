function readPositiveInteger(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} debe ser un entero positivo.`)
  }

  return parsed
}

function loadConfig(environment = process.env) {
  const isProduction = environment.NODE_ENV === 'production'
  const port = readPositiveInteger(environment.PORT, 3000, 'PORT')
  const trustProxyHops = environment.TRUST_PROXY_HOPS === undefined
    ? 0
    : Number(environment.TRUST_PROXY_HOPS)

  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS debe ser un entero mayor o igual a cero.')
  }

  const configuredOrigins = environment.FRONTEND_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (isProduction && (!configuredOrigins || configuredOrigins.length === 0)) {
    throw new Error('FRONTEND_ORIGIN debe definir al menos un origen HTTPS en producción.')
  }

  const frontendOrigins = configuredOrigins?.length
    ? configuredOrigins
    : ['http://localhost:5175', 'http://127.0.0.1:5175']

  for (const origin of frontendOrigins) {
    let parsedOrigin
    try {
      parsedOrigin = new URL(origin)
    } catch {
      throw new Error(`FRONTEND_ORIGIN contiene un origen inválido: ${origin}`)
    }

    if (
      parsedOrigin.origin !== origin
      || (isProduction && parsedOrigin.protocol !== 'https:')
    ) {
      throw new Error('FRONTEND_ORIGIN debe contener orígenes válidos; producción requiere HTTPS.')
    }
  }

  const jwtSecret = environment.JWT_SECRET
  if (
    typeof jwtSecret !== 'string'
    || Buffer.byteLength(jwtSecret, 'utf8') < 32
    || (isProduction && /change-this|development|example/i.test(jwtSecret))
  ) {
    throw new Error(
      'JWT_SECRET debe ser privado, tener al menos 32 bytes y no usar un valor de desarrollo.',
    )
  }

  const useExplicitDatabaseSettings = Boolean(
    environment.DB_NAME || environment.DB_USER || environment.DB_PASSWORD,
  )
  const databaseUrl = useExplicitDatabaseSettings ? undefined : environment.DATABASE_URL
  if (databaseUrl) {
    let parsedDatabaseUrl
    try {
      parsedDatabaseUrl = new URL(databaseUrl)
    } catch {
      throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida.')
    }
    if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
      throw new Error('DATABASE_URL debe usar postgres:// o postgresql://.')
    }
    if ([...parsedDatabaseUrl.searchParams.keys()].some((key) => /^ssl/i.test(key))) {
      throw new Error('Configura TLS con DATABASE_SSL y DATABASE_SSL_CA; elimina los parámetros ssl de DATABASE_URL.')
    }
  }
  const databaseHost = environment.DB_HOST
    || environment.PGHOST
    || environment.POSTGRES_HOST
    || '127.0.0.1'
  const databaseName = environment.DB_NAME || environment.PGDATABASE || environment.POSTGRES_DB
  const databaseUser = environment.DB_USER || environment.PGUSER || environment.POSTGRES_USER
  const databasePassword = environment.DB_PASSWORD
    ?? environment.PGPASSWORD
    ?? environment.POSTGRES_PASSWORD
  if (!databaseUrl && (!databaseName || !databaseUser)) {
    throw new Error(
      'Configura DB_NAME/DB_USER (o DATABASE_URL, PGDATABASE/PGUSER).',
    )
  }
  if (
    useExplicitDatabaseSettings
    && (!environment.DB_HOST || !environment.DB_PORT || !environment.DB_NAME
      || !environment.DB_USER || !environment.DB_PASSWORD)
  ) {
    throw new Error('Define DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD.')
  }

  const databaseSsl = environment.DATABASE_SSL === 'true'
  const databaseSslRejectUnauthorized = environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
  if (isProduction && !databaseSsl) {
    throw new Error('DATABASE_SSL=true es obligatorio para PostgreSQL en producción.')
  }

  if (isProduction && databaseSsl && !databaseSslRejectUnauthorized) {
    throw new Error('La verificacion de certificados TLS de PostgreSQL no se puede desactivar en producción.')
  }

  return {
    port,
    isProduction,
    trustProxyHops,
    frontendOrigins,
    jwtSecret,
    databaseUrl,
    databaseHost,
    databasePort: readPositiveInteger(
      environment.DB_PORT ?? environment.PGPORT,
      5432,
      'DB_PORT',
    ),
    databaseName,
    databaseUser,
    databasePassword,
    databaseSsl,
    databaseSslRejectUnauthorized,
    databaseSslCa: environment.DATABASE_SSL_CA?.replace(/\\n/g, '\n'),
    databasePoolMax: readPositiveInteger(environment.DB_POOL_MAX, 10, 'DB_POOL_MAX'),
    databaseConnectionTimeoutMs: readPositiveInteger(
      environment.DB_CONNECTION_TIMEOUT_MS,
      5000,
      'DB_CONNECTION_TIMEOUT_MS',
    ),
    jsonBodyLimit: environment.JSON_BODY_LIMIT || '1mb',
    assignmentDueHours: readAssignmentHours(environment.INCIDENT_DUE_HOURS, 48, 1, 'INCIDENT_DUE_HOURS'),
    assignmentEscalationHours: readAssignmentHours(environment.INCIDENT_ESCALATION_HOURS, 0, 0, 'INCIDENT_ESCALATION_HOURS'),
  }
}

function readAssignmentHours(value, fallback, min, name) {
  const hours = value === undefined ? fallback : Number(value)
  if (value === '' || !Number.isInteger(hours) || hours < min || hours > 8760) {
    throw new Error(`${name} debe ser un entero entre ${min} y 8760 horas.`)
  }
  return hours
}

module.exports = loadConfig
