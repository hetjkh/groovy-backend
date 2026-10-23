const path = require('node:path')
const fs = require('node:fs/promises')
const mongoose = require('mongoose')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
async function main() {
  if (!process.argv.includes('--reset')) throw new Error('This removes all app records. Invoke with --reset only when a reset is intended.')
  if (process.env.NODE_ENV === 'production') throw new Error('Demo reset is disabled in production')
  const workspace = path.resolve(__dirname, '..')
  const uploadRoot = path.resolve(__dirname, 'uploads')
  if (uploadRoot !== path.join(workspace, 'server', 'uploads')) throw new Error('Unsafe upload path')
  const directory = path.join(workspace, 'artifacts', 'demo-media')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  if (manifest.version !== require('../data/demoCatalog.json').version || manifest.books.length !== 6) throw new Error('Prepare and verify demo media before resetting')
  for (const book of manifest.books) for (const chapter of book.chapters) {
    const target = path.resolve(directory, chapter.audioUrl.replace('/uploads/', ''))
    if (!target.startsWith(directory + path.sep) || (await fs.stat(target)).size < 100000) throw new Error('Missing or unsafe prepared audio')
  }
  await mongoose.connect(process.env.MONGODB_URI)
  try {
    if (mongoose.connection.name !== 'groovy-audiobooks') throw new Error('The configured database is not the reviewed app database')
    const names = ['User', 'Book', 'Progress', 'LibraryItem', 'Bookmark', 'BookStack', 'Notice', 'ListeningDay']
    console.log(`Reset target verified: database ${mongoose.connection.name}; upload directory ${uploadRoot}`)
    const removed = {}
    for (const name of names) { const result = await require('./models/' + name).deleteMany({}); removed[name] = result.deletedCount }
    await fs.rm(uploadRoot, { recursive: true, force: true })
    console.log('Removed app records:', JSON.stringify(removed))
    console.log('Seeded replacement demo:', JSON.stringify(await require('./demoSeed').seedCatalog()))
  } finally { await mongoose.disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
