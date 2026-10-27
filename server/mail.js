const crypto = require('crypto')
const { getClientConfig } = require('./clientOrigins')
function hashToken(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }
async function sendAccountEmail(email, kind, token) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false
  const { clientOrigin: origin } = getClientConfig()
  const url = `${origin}/${kind === 'reset' ? 'reset' : 'verify'}?token=${token}`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject: kind === 'reset' ? 'Reset your Groovy password' : 'Verify your Groovy email', text: `Open this link to ${kind === 'reset' ? 'reset your password' : 'verify your email'}: ${url}\nThis link expires in one hour. If you did not request it, ignore this email.` }),
  })
  if (!response.ok) throw new Error('Email delivery unavailable')
  return true
}
module.exports = { hashToken, sendAccountEmail }
