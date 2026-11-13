const HOUR_MS = 60 * 60 * 1000

class IncidentAssignmentPolicy {
  constructor({ dueHours, escalationHours }) {
    this.dueHours = dueHours
    this.escalationHours = escalationHours
  }

  deadlineFor(receivedAt) {
    return new Date(new Date(receivedAt).getTime() + this.dueHours * HOUR_MS)
  }

  describe(item, now) {
    const isActive = ['abierta', 'en_proceso'].includes(item.status)
    const dueAt = item.dueAt ?? (isActive ? this.deadlineFor(item.receivedAt) : null)
    const elapsed = now.getTime() - new Date(dueAt).getTime()
    return {
      ...item,
      dueAt,
      isActive,
      needsAssignment: isActive && !item.contactAvailable,
      overdue: isActive && elapsed >= 0,
      escalated: isActive && elapsed >= this.escalationHours * HOUR_MS,
    }
  }
}

module.exports = IncidentAssignmentPolicy
