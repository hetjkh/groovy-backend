function listeningDate(timeZone = 'UTC', now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch { return now.toISOString().slice(0, 10) }
}
module.exports = listeningDate
