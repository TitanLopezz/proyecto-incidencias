const ValidationError = require('../errors/ValidationError')
const Category = require('./Category')
const IncidentStatus = require('./IncidentStatus')

const TUXTLA_BOUNDS = {
  minLatitude: 16.45,
  maxLatitude: 16.95,
  minLongitude: -93.35,
  maxLongitude: -92.9,
}

function normalizeDetails({ title, description } = {}) {
  if (typeof title !== 'string' || !title.trim()) {
    throw new ValidationError('El título es obligatorio.')
  }

  if (title.trim().length > 150) {
    throw new ValidationError('El título no puede superar los 150 caracteres.')
  }

  if (typeof description !== 'string' || !description.trim()) {
    throw new ValidationError('La descripción es obligatoria.')
  }

  if (description.trim().length > 2000) {
    throw new ValidationError('La descripción no puede superar los 2000 caracteres.')
  }

  return {
    title: title.trim(),
    description: description.trim(),
  }
}

class Incident {
  constructor({
    id = null,
    title,
    description,
    category = null,
    categoryName = null,
    status = 'abierta',
    createdBy = null,
    latitude = null,
    longitude = null,
    updatedBy = null,
    updatedAt = null,
    reporter = null,
    createdAt = new Date(),
  }) {
    this.id = id
    this.title = title
    this.description = description
    this.category = category
    this.categoryName = categoryName
    this.status = status
    this.createdBy = createdBy
    this.latitude = latitude
    this.longitude = longitude
    this.updatedBy = updatedBy
    this.updatedAt = updatedAt
    this.reporter = reporter
    this.createdAt = createdAt
  }

  static create({
    title,
    description,
    category,
    createdBy = null,
    latitude = null,
    longitude = null,
  } = {}) {
    const details = normalizeDetails({ title, description })
    Category.create(category)

    if ((latitude === null) !== (longitude === null)) {
      throw new ValidationError('La latitud y la longitud deben enviarse juntas.')
    }

    if (latitude === null) {
      throw new ValidationError('La ubicación es obligatoria para registrar una incidencia.')
    }

    if (
      typeof latitude !== 'number'
      || !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90
      || typeof longitude !== 'number'
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180
    ) {
      throw new ValidationError('Las coordenadas deben estar dentro del rango geográfico válido.')
    }

    if (
      latitude < TUXTLA_BOUNDS.minLatitude
      || latitude > TUXTLA_BOUNDS.maxLatitude
      || longitude < TUXTLA_BOUNDS.minLongitude
      || longitude > TUXTLA_BOUNDS.maxLongitude
    ) {
      throw new ValidationError('La ubicación debe estar dentro del municipio de Tuxtla Gutiérrez.')
    }

    return new Incident({
      ...details,
      category,
      createdBy,
      latitude,
      longitude,
    })
  }

  static update({ title, description, status } = {}) {
    const details = normalizeDetails({ title, description })
    if (!Incident.STATUSES.includes(status)) {
      throw new ValidationError('El estado de la incidencia no es válido.')
    }

    return new Incident({ ...details, status })
  }

  static isValidId(id) {
    return typeof id === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  }
}

Incident.STATUSES = IncidentStatus.VALUES

module.exports = Incident
