const UserRepository = require('../../domain/ports/UserRepository')
const User = require('../../domain/entities/User')

class PostgresUserRepository extends UserRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async create(user) {
    const result = await this.pool.query(
      `INSERT INTO users (name, email, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, password_hash, role, created_by, created_at`,
      [user.name, user.email, user.passwordHash, user.role, user.createdBy || null],
    )

    return this.toDomain(result.rows[0])
  }

  async findByEmail(email) {
    const result = await this.pool.query(
      `SELECT id, name, email, password_hash, role, created_by, created_at
       FROM users
       WHERE email = $1`,
      [email],
    )

    return result.rows[0] ? this.toDomain(result.rows[0]) : null
  }

  async findById(id) {
    const result = await this.pool.query(
      `SELECT id, name, email, password_hash, role, created_by, created_at
       FROM users
       WHERE id = $1`,
      [id],
    )

    return result.rows[0] ? this.toDomain(result.rows[0]) : null
  }

  async findAdministrators() {
    const result = await this.pool.query(
      `SELECT id, name, email, role, created_by, created_at
       FROM users
       WHERE role = 'admin'
       ORDER BY created_at DESC, id DESC`,
    )

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  toDomain(row) {
    return User.create({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })
  }
}

module.exports = PostgresUserRepository
