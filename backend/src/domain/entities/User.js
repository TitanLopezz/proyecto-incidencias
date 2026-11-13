const ValidationError = require('../errors/ValidationError')

class User {
  constructor({
    id = null,
    name,
    email,
    passwordHash,
    role = 'citizen',
    createdBy = null,
    createdAt = new Date(),
  }) {
    this.id = id
    this.name = name
    this.email = email
    this.passwordHash = passwordHash
    this.role = role
    this.createdBy = createdBy
    this.createdAt = createdAt
  }

  static create({
    id = null,
    name,
    email,
    passwordHash,
    role = 'citizen',
    createdBy = null,
    createdAt,
  } = {}) {
    const identity = User.normalizeIdentity({ name, email })

    if (typeof passwordHash !== 'string' || !passwordHash) {
      throw new ValidationError('La contraseña cifrada es obligatoria.')
    }

    if (!User.ROLES.includes(role)) {
      throw new ValidationError('El rol de usuario no es válido.')
    }

    return new User({
      id,
      ...identity,
      passwordHash,
      role,
      createdBy,
      createdAt,
    })
  }

  static normalizeIdentity({ name, email } = {}) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('El nombre es obligatorio.')
    }

    const normalizedName = name.trim()
    if (normalizedName.length > 100) {
      throw new ValidationError('El nombre no puede superar los 100 caracteres.')
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new ValidationError('El correo electrónico no es válido.')
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (normalizedEmail.length > 254) {
      throw new ValidationError('El correo no puede superar los 254 caracteres.')
    }

    return {
      name: normalizedName,
      email: normalizedEmail,
    }
  }

  toPublicProfile() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      createdAt: this.createdAt,
    }
  }
}

User.ROLES = Object.freeze(['citizen', 'admin', 'superadmin'])

module.exports = User
