class UserRepository {
  async create() {
    throw new Error('UserRepository.create debe ser implementado.')
  }

  async findByEmail() {
    throw new Error('UserRepository.findByEmail debe ser implementado.')
  }

  async findById() {
    throw new Error('UserRepository.findById debe ser implementado.')
  }

  async findAdministrators() {
    throw new Error('UserRepository.findAdministrators debe ser implementado.')
  }
}

module.exports = UserRepository
