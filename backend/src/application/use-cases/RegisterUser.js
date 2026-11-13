const User = require('../../domain/entities/User')
const ValidationError = require('../../domain/errors/ValidationError')
const ConflictError = require('../../domain/errors/ConflictError')

class RegisterUser {
  constructor({ userRepository, passwordHasher, tokenService }) {
    this.userRepository = userRepository
    this.passwordHasher = passwordHasher
    this.tokenService = tokenService
  }

  async execute({ name, email, password } = {}) {
    const identity = User.normalizeIdentity({ name, email })

    if (typeof password !== 'string') {
      throw new ValidationError('La contraseña es obligatoria.')
    }

    const passwordBytes = Buffer.byteLength(password, 'utf8')
    if (passwordBytes < 8 || passwordBytes > 72) {
      throw new ValidationError('La contraseña debe tener entre 8 y 72 bytes.')
    }

    if (await this.userRepository.findByEmail(identity.email)) {
      throw new ConflictError('Ya existe una cuenta con ese correo electrónico.')
    }

    const passwordHash = await this.passwordHasher.hash(password)
    const user = User.create({ ...identity, passwordHash })

    try {
      const createdUser = await this.userRepository.create(user)
      return {
        user: createdUser.toPublicProfile(),
        token: this.tokenService.issue(createdUser.id),
      }
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictError('Ya existe una cuenta con ese correo electrónico.')
      }

      throw error
    }
  }
}

module.exports = RegisterUser
