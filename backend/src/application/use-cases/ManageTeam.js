const ValidationError = require('../../domain/errors/ValidationError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const { validateContacto, validateOptionalFields, UUID_REGEX, VALID_CANALES } = require('../../domain/services/TeamValidation')

class ManageTeam {
  constructor(repository) {
    this.repository = repository
  }

  listContactos({ soloActivos }) {
    return this.repository.listContactos({ soloActivos })
  }

  createContacto(input = {}) {
    const { nombre, equipo, tipo_incidencia, telefono, correo, horario, activo } = input
    validateContacto({ nombre, equipo, tipo_incidencia, telefono, correo })
    validateOptionalFields({ horario, activo })

    return this.repository.createContacto({
      nombre,
      equipo,
      tipo_incidencia,
      telefono,
      correo,
      horario,
      activo,
    })
  }

  async updateContacto(id, input = {}) {
    if (!UUID_REGEX.test(id)) {
      throw new ValidationError('El identificador del contacto no es válido.')
    }
    const { nombre, equipo, tipo_incidencia, telefono, correo, horario, activo } = input
    validateContacto({ nombre, equipo, tipo_incidencia, telefono, correo })
    validateOptionalFields({ horario, activo })

    const contacto = await this.repository.updateContacto(id, {
      nombre,
      equipo,
      tipo_incidencia,
      telefono,
      correo,
      horario,
      activo,
    })
    if (!contacto) {
      throw new NotFoundError('Contacto no encontrado.')
    }
    return contacto
  }

  async deleteContacto(id) {
    if (!UUID_REGEX.test(id)) {
      throw new ValidationError('El identificador del contacto no es válido.')
    }
    const deleted = await this.repository.deleteContacto(id)
    if (!deleted) {
      throw new NotFoundError('Contacto no encontrado.')
    }
    return { id, eliminado: true }
  }

  async listLlamadas({ incident_id }) {
    if (incident_id && !UUID_REGEX.test(incident_id)) {
      throw new ValidationError('El identificador de la incidencia no es válido.')
    }
    return this.repository.listLlamadas({ incident_id })
  }

  async createLlamada(input = {}, admin_id = null) {
    const { incident_id, contacto_id, canal, notas } = input

    if (!contacto_id || !UUID_REGEX.test(contacto_id)) {
      throw new ValidationError('El identificador del contacto es obligatorio y debe ser válido.')
    }
    if (incident_id && !UUID_REGEX.test(incident_id)) {
      throw new ValidationError('El identificador de la incidencia no es válido.')
    }
    if (!canal || !VALID_CANALES.includes(canal)) {
      throw new ValidationError(`El canal es obligatorio. Valores aceptados: ${VALID_CANALES.join(', ')}.`)
    }

    const contacto = await this.repository.findContactoById(contacto_id)
    if (!contacto) {
      throw new NotFoundError('El contacto especificado no existe.')
    }
    if (!contacto.activo) {
      throw new ValidationError('No se pueden registrar avisos a un contacto inactivo.')
    }
    if (notas != null && (typeof notas !== 'string' || notas.length > 2000)) {
      throw new ValidationError('Las notas no pueden superar 2000 caracteres.')
    }
    if (incident_id && !(await this.repository.findIncidentById(incident_id))) {
      throw new NotFoundError('La incidencia especificada no existe.')
    }

    const llamada = await this.repository.createLlamada({
      incident_id: incident_id || null,
      contacto_id,
      admin_id,
      canal,
      notas,
    })
    if (!llamada) {
      throw new NotFoundError('El contacto especificado ya no está disponible.')
    }
    return llamada
  }
}

module.exports = ManageTeam
