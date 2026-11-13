const statuses = {
  abierta: { label: 'Abierta', next: 'Recibimos tu reporte. Está pendiente de atención.' },
  en_proceso: { label: 'En proceso', next: 'El equipo está atendiendo la incidencia.' },
  resuelta: { label: 'Resuelta', next: 'La incidencia fue atendida y está pendiente de cierre.' },
  cerrada: { label: 'Cerrada', next: 'El seguimiento del reporte concluyó.' },
}

export function describeIncidentStatus(status) {
  return statuses[status] ?? { label: 'Sin estado', next: 'Consulta el folio más tarde.' }
}
