const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { connectDb } = require('./db')
const { seedCatalog } = require('./seed')

connectDb()
  .then(async () => {
    const result = await seedCatalog()
    console.log(result.skipped ? 'Catalog already seeded. Use npm run demo:reset only for an intentional full app-data reset.' : `Seeded ${result.books} books`)
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
