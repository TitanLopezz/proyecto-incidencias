const { Server } = require('socket.io')
const AuthenticationError = require('../../domain/errors/AuthenticationError')

function authenticateSocket({ tokenService, userRepository }) {
  return async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || !token) {
      return next(new Error('Se requiere autenticación para la conexión en tiempo real.'))
    }

    try {
      const { userId } = tokenService.verify(token)
      const user = await userRepository.findById(userId)
      if (!user) {
        return next(new Error('La sesión ya no es válida.'))
      }

      socket.data.userId = user.id
      return next()
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return next(new Error('La sesión en tiempo real no es válida o expiró.'))
      }

      console.error('No se pudo verificar el usuario de la conexión Socket.IO:', error)
      return next(new Error('No se pudo validar la sesión en tiempo real.'))
    }
  }
}

function createSocketServer({ server, tokenService, userRepository, frontendOrigins }) {
  const io = new Server(server, {
    cors: {
      origin: frontendOrigins,
      methods: ['GET', 'POST'],
    },
  })

  io.use(authenticateSocket({ tokenService, userRepository }))
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`)
  })

  return io
}

createSocketServer.authenticateSocket = authenticateSocket

module.exports = createSocketServer
