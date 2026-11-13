const jwt = require('jsonwebtoken')
const TokenService = require('../../domain/ports/TokenService')
const AuthenticationError = require('../../domain/errors/AuthenticationError')

class JwtTokenService extends TokenService {
  constructor(secret) {
    super()
    if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 bytes.')
    }

    this.secret = secret
  }

  issue(userId) {
    return jwt.sign({}, this.secret, {
      subject: userId,
      expiresIn: '1h',
      issuer: 'incidencias-api',
      audience: 'incidencias-client',
      algorithm: 'HS256',
    })
  }

  verify(token) {
    try {
      const payload = jwt.verify(token, this.secret, {
        issuer: 'incidencias-api',
        audience: 'incidencias-client',
        algorithms: ['HS256'],
      })

      if (typeof payload === 'string' || typeof payload.sub !== 'string') {
        throw new AuthenticationError('Token inválido.')
      }

      return { userId: payload.sub }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error
      }

      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token inválido o expirado.')
      }

      throw error
    }
  }
}

module.exports = JwtTokenService
