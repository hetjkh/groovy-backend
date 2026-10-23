const windows = new Map()
module.exports = (req, res, next) => {
  if (req.method !== 'POST' || !['/login','/signup','/forgot','/reset','/verify','/verify/send'].includes(req.path)) return next()
  const now = Date.now()
  if (windows.size > 10000) for (const [key, value] of windows) if (value.until < now) windows.delete(key)
  let entry = windows.get(req.ip)
  if (!entry || entry.until < now) { entry = { count: 0, until: now + 60000 }; windows.set(req.ip, entry) }
  if (++entry.count > 60) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' })
  next()
}
