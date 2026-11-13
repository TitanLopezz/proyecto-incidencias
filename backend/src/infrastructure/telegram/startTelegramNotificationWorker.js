function startTelegramNotificationWorker(delivery, intervalMs = 5000) {
  let running
  const timer = setInterval(() => {
    if (running) return
    running = delivery.execute().catch(() => {
      console.error('No se pudo procesar la cola de avisos de Telegram.')
    }).finally(() => { running = undefined })
  }, intervalMs)
  timer.unref()
  return async function stop() {
    clearInterval(timer)
    await running
  }
}

module.exports = startTelegramNotificationWorker
