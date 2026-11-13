const test = require('node:test')
const assert = require('node:assert/strict')
const createSocketServer = require('../src/infrastructure/websocket/SocketServer')
const SocketNotificationSender = require('../src/infrastructure/websocket/SocketNotificationSender')
const AuthenticationError = require('../src/domain/errors/AuthenticationError')

test('SocketServer authentication validates JWT and associates the persisted user ID', async () => {
  const authenticate = createSocketServer.authenticateSocket({
    tokenService: {
      verify(token) {
        assert.equal(token, 'valid-token')
        return { userId: 'citizen-1' }
      },
    },
    userRepository: {
      async findById(userId) {
        assert.equal(userId, 'citizen-1')
        return { id: userId, role: 'citizen' }
      },
    },
  })
  const socket = { handshake: { auth: { token: 'valid-token' } }, data: {} }
  let middlewareError

  await authenticate(socket, (error) => { middlewareError = error })

  assert.equal(middlewareError, undefined)
  assert.equal(socket.data.userId, 'citizen-1')
})

test('SocketServer rejects absent, invalid, expired, and revoked credentials', async () => {
  const authenticate = createSocketServer.authenticateSocket({
    tokenService: {
      verify(token) {
        if (token === 'invalid-token') {
          throw new AuthenticationError()
        }
        return { userId: 'revoked-user' }
      },
    },
    userRepository: {
      async findById() { return null },
    },
  })

  for (const socket of [
    { handshake: { auth: {} }, data: {} },
    { handshake: { auth: { token: 'invalid-token' } }, data: {} },
    { handshake: { auth: { token: 'revoked-token' } }, data: {} },
  ]) {
    let middlewareError
    await authenticate(socket, (error) => { middlewareError = error })
    assert.ok(middlewareError instanceof Error)
  }
})

test('SocketNotificationSender emits only to the target user room', async () => {
  let emitArguments
  let roomName
  const sender = new SocketNotificationSender()
  sender.attach({
    to(room) {
      roomName = room
      return {
        emit(...args) {
          emitArguments = args
        },
      }
    },
  })
  const notification = { id: 'notification-1', isRead: false }

  await sender.sendToUser('citizen-1', notification)

  assert.equal(roomName, 'user:citizen-1')
  assert.deepEqual(emitArguments, ['new_notification', notification])
})
