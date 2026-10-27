const localOrigin = 'http://localhost:3000'
const developmentOrigins = [localOrigin, 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001']

function getClientConfig(env = process.env) {
  const values = (env.CLIENT_ORIGIN || localOrigin).split(',').map(value => value.trim()).filter(Boolean)
  const configured = (values.length ? values : [localOrigin]).map(value => {
    let url
    try { url = new URL(value) } catch { throw new Error('CLIENT_ORIGIN must contain comma-separated http:// or https:// origins') }
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
