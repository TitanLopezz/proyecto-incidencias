const ValidationError = require('../errors/ValidationError')
const Category = require('../entities/Category')

const PHONE_REGEX = /^\+?[0-9]{7,15}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_CANALES = ['telefono', 'whatsapp']
const VALID_TIPOS = Category.VALUES
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateContacto({ nombre, equipo, tipo_incidencia, telefono, correo }) {
  if (typeof nombre !== 'string' || !nombre.trim()) {
    throw new ValidationError('El nombre es obligatorio.')
  }
  if (nombre.trim().length > 120) {
    throw new ValidationError('El nombre no puede superar 120 caracteres.')
  }
  if (typeof equipo !== 'string' || !equipo.trim()) {
    throw new ValidationError('El nombre del equipo/cuadrilla es obligatorio.')
  }
  if (equipo.trim().length > 120) {
    throw new ValidationError('El equipo no puede superar 120 caracteres.')
  }
  if (tipo_incidencia && !VALID_TIPOS.includes(tipo_incidencia)) {
    throw new ValidationError(`Tipo de incidencia inválido. Valores aceptados: ${VALID_TIPOS.join(', ')}.`)
  }
  if (typeof telefono !== 'string' || !PHONE_REGEX.test(telefono.trim())) {
    throw new ValidationError('El teléfono es obligatorio y debe tener entre 7 y 15 dígitos (puede iniciar con +).')
  }
  if (correo != null && (typeof correo !== 'string' || (correo && !EMAIL_REGEX.test(correo.trim())))) {
    throw new ValidationError('El correo electrónico no es válido.')
  }
  if (correo && correo.trim().length > 254) {
    throw new ValidationError('El correo electrónico no puede superar 254 caracteres.')
  }
}

function validateOptionalFields({ horario, activo }) {
  if (horario != null && (typeof horario !== 'string' || horario.length > 120)) {
    throw new ValidationError('El horario no puede superar 120 caracteres.')
  }
  if (activo != null && typeof activo !== 'boolean') {
    throw new ValidationError('El estado activo debe ser verdadero o falso.')
  }
}

module.exports = { validateContacto, validateOptionalFields, UUID_REGEX, VALID_CANALES }
