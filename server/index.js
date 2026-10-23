const path = require('path')
const http = require('http')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const passport = require('passport')
const { Server } = require('socket.io')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { connectDb } = require('./db')
const authRoutes = require('./routes/auth')
const bookRoutes = require('./routes/books')
const userRoutes = require('./routes/users')
const profileRoutes = require('./routes/profiles')
const libraryRoutes = require('./routes/library')

const app = express()
const server = http.createServer(app)
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:3000'

const io = new Server(server, { cors: { origin, credentials: true } })
app.set('io', io)

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? origin : [origin, 'http://localhost:3000', 'http://127.0.0.1:3000'], credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use(passport.initialize())
app.use('/uploads', require('./middleware/auth').optionalAuth, async (req, res, next) => {
  try {
    if (!/^\/(audio|covers)\//.test(req.path)) return next()
    const url = '/uploads' + req.path
    const book = await require('./models/Book').findOne({ $or: [{ 'chapters.audioUrl': url }, { coverUrl: url }] })
    if (!book) return res.status(404).json({ error: 'File not found' })
    if (!require('./access').canRead(book, req.user)) return res.status(403).json({ error: 'Private file' })
    res.set('Cache-Control', 'private, no-store')
    next()
  } catch (error) { next(error) }
}, express.static(path.join(__dirname, 'uploads')))
app.use('/auth', require('./middleware/rateLimit'))

app.get('/catalog/version', (_req, res) => res.json({ version: require('../data/demoCatalog.json').version }))
app.get('/health', (_req, res) => res.json({ ok: true, service: 'groovy-api' }))
app.use('/auth', authRoutes)
app.use('/books', bookRoutes)
app.use('/me', userRoutes)
app.use('/users', profileRoutes)
app.use('/', libraryRoutes)

io.on('connection', socket => {
  socket.on('book:join', bookId => {
    socket.join(`book:${bookId}`)
    socket.data.bookId = bookId
  })
  socket.on('book:leave', bookId => socket.leave(`book:${bookId}`))
})

app.use((error, _req, res, _next) => {
  if (!error.status || error.status >= 500) console.error(error.name || 'Server error')
  res.status(error.status || (['ValidationError', 'CastError', 'MulterError'].includes(error.name) ? 400 : 500)).json({ error: error.status || error.name === 'ValidationError' ? error.message : 'Request could not be completed' })
})

const port = Number(process.env.PORT) || 4000

connectDb()
  .then(async () => {
    try {
      if (process.env.SEED_DEMO !== 'true' || process.env.NODE_ENV === 'production') return server.listen(port, () => console.log('API listening on ' + port))
      const { seedCatalog } = require('./seed')
      const result = await seedCatalog()
      if (!result.skipped) console.log(`Seeded ${result.books} public books and ${result.users} author profiles`)
    } catch (error) {
      console.warn('Catalog seed skipped:', error.message)
    }
    server.listen(port, () => console.log(`API listening on ${port}`))
  })
  .catch(error => {
    console.error('MongoDB connection failed:', error.message)
    console.error('Paste your full Atlas URI into MONGODB_URI in .env (mongodb+srv://user:pass@clusterX.xxxxx.mongodb.net/dbname)')
    process.exit(1)
  })
