const ValidationError = require('../../domain/errors/ValidationError')
const ConflictError = require('../../domain/errors/ConflictError')
const AuthenticationError = require('../../domain/errors/AuthenticationError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ForbiddenError = require('../../domain/errors/ForbiddenError')

function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    return next(error)
  }
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ error: { message: 'Cada foto debe pesar como máximo 2 MB.' } })
  }

  if (error instanceof AuthenticationError) {
    return response.status(401).json({
      error: {
        message: error.message,
      },
    })
  }

  if (error instanceof ForbiddenError) {
    return response.status(403).json({
      error: {
        message: error.message,
      },
    })
  }

  if (error instanceof ConflictError) {
    return response.status(409).json({
      error: {
        message: error.message,
      },
    })
  }

  if (error instanceof NotFoundError) {
    return response.status(404).json({
      error: {
        message: error.message,
      },
    })
  }

  if (error instanceof ValidationError) {
    return response.status(400).json({
      error: {
        message: error.message,
      },
    })
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return response.status(400).json({
      error: {
        message: 'El cuerpo de la solicitud debe ser JSON válido.',
      },
    })
  }

  const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500
    ? error.statusCode
    : 500
  console.error(error)
  return response.status(status).json({
    error: {
      message: status === 500 ? 'Ocurrió un error interno.' : error.message,
    },
  })
}

module.exports = errorHandler
