const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const createRoutes = require('./routes')
const errorHandler = require('./errorHandler')

function createApp({
  useCases,
  tokenService,
  userRepository,
  frontendOrigins,
  trustProxyHops = 0,
  jsonBodyLimit = '1mb',
  readinessCheck,
  photoService,
  telegramSecret,
}) {
  const app = express()

  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops)
  }
  app.use(helmet())
  app.use(cors({ origin: frontendOrigins }))
  app.use(express.json({ limit: jsonBodyLimit }))
  app.use(createRoutes({ useCases, tokenService, userRepository, readinessCheck, photoService, telegramSecret }))
  app.use((_request, response) => {
    response.status(404).json({
      error: {
        message: 'Ruta no encontrada.',
      },
    })
  })
  app.use(errorHandler)

  return app
}

module.exports = createApp
