const localOrigin = 'http://localhost:3000'
const developmentOrigins = [localOrigin, 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001']

function originText(value) {
  let text = String(value).trim().replace(/^\uFEFF/, '').replace(/^['"]+|['"]+$/g, '')
  text = text.replace(/^CLIENT_ORIGIN=/i, '').trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(text)) text = `http://${text}`
    else if (/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(text)) text = `https://${text}`
  }
  return text
}

function getClientConfig(env = process.env) {
  const raw = String(env.CLIENT_ORIGIN || localOrigin).trim().replace(/^['"]+|['"]+$/g, '')
  const values = raw.split(',').map(value => originText(value)).filter(Boolean)
  const configured = (values.length ? values : [localOrigin]).map(value => {
    let url
    try { url = new URL(value) } catch { throw new Error(`CLIENT_ORIGIN must contain comma-separated http:// or https:// origins (${JSON.stringify(value)})`) }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('CLIENT_ORIGIN entries must be http:// or https:// origins without credentials, paths, queries, or fragments')
    }
    return url.origin
  })
  const origins = [...new Set([...configured, ...(env.NODE_ENV === 'production' ? [] : developmentOrigins)])]
  return {
    // Redirects and emailed links need one URL, even when CORS permits several.
    clientOrigin: configured[0],
    // An array makes cors reflect only the matching request origin, never the list.
    corsOptions: { origin: origins, credentials: true },
  }
}

module.exports = { getClientConfig }
