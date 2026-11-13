const AuthenticationError = require('../../domain/errors/AuthenticationError')
const ValidationError = require('../../domain/errors/ValidationError')

class LoginUser {
  constructor({ userRepository, passwordHasher, tokenService, allowedRoles = ['citizen'] }) {
    this.userRepository = userRepository
    this.passwordHasher = passwordHasher
    this.tokenService = tokenService
    this.allowedRoles = allowedRoles
  }

  async execute({ email, password } = {}) {
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      throw new ValidationError('El correo y la contraseña son obligatorios.')
    }

    const user = await this.userRepository.findByEmail(email.trim().toLowerCase())
    if (
      !user
      || !(await this.passwordHasher.compare(password, user.passwordHash))
      || !this.allowedRoles.includes(user.role)
    ) {
      throw new AuthenticationError()
    }

    return {
      user: user.toPublicProfile(),
      token: this.tokenService.issue(user.id),
    }
  }
}

module.exports = LoginUser
