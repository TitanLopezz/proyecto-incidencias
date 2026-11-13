const AuthenticationError = require('../../domain/errors/AuthenticationError')

class GetCurrentUser {
  constructor(userRepository) {
    this.userRepository = userRepository
  }

  async execute(userId) {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new AuthenticationError('La sesión no es válida.')
    }

    return user.toPublicProfile()
  }
}

module.exports = GetCurrentUser
