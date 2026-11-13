const AuthenticationError = require('../../../domain/errors/AuthenticationError')

function createAuthenticateToken({ tokenService, userRepository }) {
  return async (request, response, next) => {
    const authorization = request.get('authorization')
    const [scheme, token, ...extra] = authorization ? authorization.split(' ') : []

    if (scheme !== 'Bearer' || !token || extra.length > 0) {
      return response.status(401).json({
        error: { message: 'Se requiere un token Bearer válido.' },
      })
    }

    try {
      const { userId } = tokenService.verify(token)
      const user = await userRepository.findById(userId)
      if (!user) {
        return response.status(401).json({
          error: { message: 'La sesión ya no es válida.' },
        })
      }

      request.auth = {
        userId: user.id,
        role: user.role,
      }
      return next()
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return response.status(401).json({
          error: { message: error.message },
        })
      }

      return next(error)
    }
  }
}

module.exports = createAuthenticateToken
