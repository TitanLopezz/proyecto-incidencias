const test = require('node:test')
const assert = require('node:assert/strict')
const RegisterUser = require('../src/application/use-cases/RegisterUser')
const LoginUser = require('../src/application/use-cases/LoginUser')
const CreateAdmin = require('../src/application/use-cases/CreateAdmin')
const ListAdmins = require('../src/application/use-cases/ListAdmins')
const User = require('../src/domain/entities/User')
const ValidationError = require('../src/domain/errors/ValidationError')
const AuthenticationError = require('../src/domain/errors/AuthenticationError')
const ConflictError = require('../src/domain/errors/ConflictError')
const JwtTokenService = require('../src/infrastructure/security/JwtTokenService')
const BcryptPasswordHasher = require('../src/infrastructure/security/BcryptPasswordHasher')

test('RegisterUser hashes the password and never returns its hash', async () => {
  let savedUser
  const registerUser = new RegisterUser({
    userRepository: {
      async findByEmail() { return null },
      async create(user) {
        savedUser = User.create({ ...user, id: 'user-1' })
        return savedUser
      },
    },
    passwordHasher: { async hash(password) { return `hashed:${password}` } },
    tokenService: { issue(userId) { return `token:${userId}` } },
  })

  const result = await registerUser.execute({
    name: ' Persona ',
    email: 'PERSON@example.com',
    password: 'Password123',
  })

  assert.equal(savedUser.email, 'person@example.com')
  assert.equal(savedUser.passwordHash, 'hashed:Password123')
  assert.deepEqual(result, {
    user: {
      id: 'user-1',
      name: 'Persona',
      email: 'person@example.com',
      role: 'citizen',
      createdAt: savedUser.createdAt,
    },
    token: 'token:user-1',
  })
  assert.equal('passwordHash' in result.user, false)
})

test('RegisterUser rejects short passwords before hashing', async () => {
  let hashCalled = false
  const registerUser = new RegisterUser({
    userRepository: { async findByEmail() { return null } },
    passwordHasher: { async hash() { hashCalled = true } },
    tokenService: { issue() { return 'token' } },
  })

  await assert.rejects(
    registerUser.execute({ name: 'Persona', email: 'person@example.com', password: 'short' }),
    ValidationError,
  )
  assert.equal(hashCalled, false)
})

test('RegisterUser rejects an already registered email', async () => {
  const registerUser = new RegisterUser({
    userRepository: { async findByEmail() { return { id: 'existing' } } },
    passwordHasher: { async hash() { throw new Error('No se debe cifrar') } },
    tokenService: { issue() { return 'token' } },
  })

  await assert.rejects(
    registerUser.execute({ name: 'Persona', email: 'person@example.com', password: 'Password123' }),
    ConflictError,
  )
})

test('LoginUser returns the same authentication error for an unknown user or wrong password', async () => {
  const loginUser = new LoginUser({
    userRepository: { async findByEmail() { return null } },
    passwordHasher: { async compare() { return false } },
    tokenService: { issue() { return 'token' } },
  })

  await assert.rejects(
    loginUser.execute({ email: 'person@example.com', password: 'Password123' }),
    AuthenticationError,
  )
})

test('LoginUser returns a public user and token for valid credentials', async () => {
  const user = User.create({
    id: 'user-1',
    name: 'Persona',
    email: 'person@example.com',
    passwordHash: 'hashed-password',
  })
  const loginUser = new LoginUser({
    userRepository: { async findByEmail() { return user } },
    passwordHasher: {
      async compare(password, passwordHash) {
        return password === 'Password123' && passwordHash === 'hashed-password'
      },
    },
    tokenService: { issue(userId) { return `token:${userId}` } },
  })

  const result = await loginUser.execute({ email: 'PERSON@example.com', password: 'Password123' })

  assert.equal(result.user.email, 'person@example.com')
  assert.equal(result.token, 'token:user-1')
  assert.equal(result.user.role, 'citizen')
  assert.equal('passwordHash' in result.user, false)
})

test('LoginUser denies administrators on the public citizen login', async () => {
  const admin = User.create({
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: 'hashed-password',
    role: 'admin',
  })
  const loginUser = new LoginUser({
    userRepository: { async findByEmail() { return admin } },
    passwordHasher: { async compare() { return true } },
    tokenService: { issue() { return 'token' } },
  })

  await assert.rejects(
    loginUser.execute({ email: admin.email, password: 'Password123' }),
    AuthenticationError,
  )
})

test('CreateAdmin always creates an admin, records the creator and ignores client role input', async () => {
  let savedUser
  const createAdmin = new CreateAdmin({
    userRepository: {
      async findByEmail() { return null },
      async create(user) {
        savedUser = User.create({ ...user, id: 'admin-2' })
        return savedUser
      },
    },
    passwordHasher: { async hash() { return 'hashed-password' } },
  })

  const result = await createAdmin.execute({
    name: 'Admin nuevo',
    email: 'NEWADMIN@example.com',
    password: 'Password123',
    role: 'superadmin',
  }, 'superadmin-1')

  assert.equal(savedUser.role, 'admin')
  assert.equal(savedUser.createdBy, 'superadmin-1')
  assert.equal(result.role, 'admin')
  assert.equal('passwordHash' in result, false)
})

test('ListAdmins returns the administrator repository result', async () => {
  const admins = [{ id: 'admin-1', email: 'admin@example.com' }]
  const listAdmins = new ListAdmins({
    async findAdministrators() { return admins },
  })

  assert.equal(await listAdmins.execute(), admins)
})

test('JwtTokenService issues verifiable tokens and rejects tampered tokens', () => {
  const tokenService = new JwtTokenService('a-secret-that-is-at-least-32-bytes-long')
  const token = tokenService.issue('user-1')

  assert.deepEqual(tokenService.verify(token), { userId: 'user-1' })
  assert.throws(() => tokenService.verify(`${token}tampered`), AuthenticationError)
})

test('BcryptPasswordHasher hashes passwords and compares them safely', async () => {
  const passwordHasher = new BcryptPasswordHasher()
  const passwordHash = await passwordHasher.hash('Password123')

  assert.notEqual(passwordHash, 'Password123')
  assert.equal(await passwordHasher.compare('Password123', passwordHash), true)
  assert.equal(await passwordHasher.compare('WrongPassword', passwordHash), false)
})
