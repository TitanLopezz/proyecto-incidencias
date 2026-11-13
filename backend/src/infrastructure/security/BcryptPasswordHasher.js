const bcrypt = require('bcryptjs')
const PasswordHasher = require('../../domain/ports/PasswordHasher')

class BcryptPasswordHasher extends PasswordHasher {
  async hash(password) {
    return bcrypt.hash(password, 12)
  }

  async compare(password, passwordHash) {
    return bcrypt.compare(password, passwordHash)
  }
}

module.exports = BcryptPasswordHasher
