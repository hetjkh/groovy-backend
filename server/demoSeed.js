const fs = require('node:fs/promises')
const path = require('node:path')
const bcrypt = require('bcryptjs')
const User = require('./models/User')
const Book = require('./models/Book')
const config = require('../data/demoCatalog.json')
const SEED_EMAIL = config.profiles[0].email
async function seedCatalog() {
  if (await Book.exists({ demoVersion: config.version })) return { skipped: true }
  const directory = path.resolve(__dirname, '../artifacts/demo-media')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  if (manifest.version !== config.version) throw new Error('Run npm run demo:media before seeding')
  const uploads = path.resolve(__dirname, 'uploads')
  for (const folder of ['audio', 'covers', 'avatars']) {
    await fs.mkdir(path.join(uploads, folder), { recursive: true })
    for (const file of await fs.readdir(path.join(directory, folder))) {
      await fs.copyFile(path.join(directory, folder, file), path.join(uploads, folder, file))
    }
  }
  const passwordHash = await bcrypt.hash('listening123', 10)
  const users = []
  for (const profile of manifest.profiles) {
    const user = await User.findOneAndUpdate({ email: profile.email }, { $set: {
      name: profile.name, email: profile.email, avatar: profile.avatar,
      bio: 'Fictional demo curator. This sample profile uses a portrait from Random User; audiobook narration belongs to the credited LibriVox readers.',
      location: profile.location, favoriteGenre: profile.genre, role: 'Demo curator', isDemo: true,
      passwordHash, emailVerified: true, weeklyGoal: 120, monthlyGoal: 3,
    } }, { upsert: true, new: true })
    users.push(user)
  }
  const books = []
  const plays = [84, 62, 47, 35, 23, 56]
  for (const [index, item] of manifest.books.entries()) {
    books.push(await Book.create({
      owner: users[item.owner]._id, title: item.title, authorName: item.author, narrator: item.narrator,
      description: `${item.summary} Demo edition: two 90-second excerpts from real LibriVox recordings. Open the recording source below for the complete audiobook. Profiles, reviews, and activity in this catalog are fictional demo data.`,
      genre: item.genre, spokenLanguage: 'English', coverUrl: item.coverUrl,
      visibility: 'public', chapters: item.chapters, series: item.series || '', seriesIndex: item.seriesIndex || 1,
      sampleChapter: 1, year: 'Public-domain classic', isDemo: true, demoVersion: config.version,
      sourceUrl: item.sourceUrl, sourceCredit: `LibriVox / Internet Archive · ${item.narrator}`, licenseUrl: item.licenseUrl,
      plays: plays[index], likedBy: [users[(item.owner + 1) % users.length]._id],
      ratings: [{ user: users[(item.owner + 2) % users.length]._id, stars: index % 2 ? 4 : 5, text: 'Demo review: a lovely opening to a classic story.' }],
      comments: [{ user: users[(item.owner + 1) % users.length]._id, text: 'Demo comment: saved this excerpt for my next listening break.' }],
    }))
  }
  users[0].following = [users[1]._id, users[2]._id]
  users[1].followers = [users[0]._id]; users[2].followers = [users[0]._id]
  for (const user of users.slice(0, 3)) await user.save()
  const statuses = ['in_progress', 'in_progress', 'finished', 'wishlist', 'saved', 'saved']
  await require('./models/LibraryItem').insertMany(books.map((book, index) => ({ user: users[0]._id, book: book._id, status: statuses[index] })))
  await require('./models/Progress').insertMany([
    { user: users[0]._id, book: books[0]._id, chapterId: books[0].chapters[0]._id, seconds: 22, duration: books[0].chapters[0].duration },
    { user: users[0]._id, book: books[1]._id, chapterId: books[1].chapters[1]._id, seconds: 14, duration: books[1].chapters[1].duration },
    { user: users[0]._id, book: books[2]._id, chapterId: books[2].chapters[1]._id, seconds: 90, duration: books[2].chapters[1].duration, finished: true },
  ])
  await require('./models/Bookmark').insertMany([
    { user: users[0]._id, book: books[0]._id, chapterId: books[0].chapters[0]._id, chapterTitle: books[0].chapters[0].title, seconds: 17, note: 'Demo note: return to this curious beginning.' },
    { user: users[0]._id, book: books[1]._id, chapterId: books[1].chapters[1]._id, chapterTitle: books[1].chapters[1].title, seconds: 25, note: 'Demo note: a moment in Baker Street.' },
  ])
  await require('./models/BookStack').insertMany([
    { user: users[0]._id, name: 'Evening stories', bookIds: [books[0]._id, books[1]._id, books[5]._id] },
    { user: users[0]._id, name: 'Gothic collection', bookIds: [books[3]._id, books[4]._id] },
  ])
  await require('./models/Notice').create({ user: users[0]._id, title: 'Demo: a new mystery from Julian', text: 'A Sherlock Holmes excerpt is ready on your shelf.', link: `/listen/${books[1]._id}` })
  await require('./models/ListeningDay').create({ user: users[0]._id, day: require('./listeningDate')('Asia/Kolkata'), seconds: 840 })
  users[0].clientState = {
    liked: [String(books[0].chapters[0]._id), String(books[1].chapters[1]._id)],
    history: [String(books[0].chapters[0]._id), String(books[1].chapters[1]._id), String(books[2].chapters[1]._id)],
    playlists: [{ id: 'my-demo-evening', name: 'Evening chapters', trackIds: [String(books[0].chapters[0]._id), String(books[1].chapters[1]._id)] }],
  }
  await users[0].save()
  return { skipped: false, books: books.length, users: users.length, excerpts: books.reduce((total, book) => total + book.chapters.length, 0) }
}
module.exports = { seedCatalog, SEED_EMAIL }
