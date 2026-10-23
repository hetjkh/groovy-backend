const mongoose = require('mongoose')

const chapterSchema = new mongoose.Schema({
  title: { type: String, required: true },
  audioUrl: { type: String, required: true },
  duration: { type: Number, default: 0 },
  index: { type: Number, required: true },
}, { _id: true })

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 500 },
}, { timestamps: true })

const presenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  guestId: String,
  at: { type: Date, default: Date.now },
}, { _id: false })

const bookSchema = new mongoose.Schema({
  isDemo: { type: Boolean, default: false },
  demoVersion: String,
  sourceUrl: String,
  sourceCredit: String,
  licenseUrl: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 2000 },
  genre: { type: String, default: 'Fiction' },
  narrator: { type: String, default: '' },
  authorName: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  language: String, // Legacy documents only
  spokenLanguage: { type: String, default: '' },
  series: { type: String, default: '' },
  year: { type: String, default: '' },
  seriesIndex: { type: Number, default: 1 },
  sampleChapter: { type: Number, default: 1 },
  ratings: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, stars: { type: Number, min: 1, max: 5 }, text: { type: String, maxlength: 800 } }],
  visibility: { type: String, enum: ['public', 'private'], default: 'private', index: true },
  chapters: [chapterSchema],
  plays: { type: Number, default: 0 },
  uniqueListeners: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  presence: [presenceSchema],
  listenerIds: [{ type: String }],
}, { timestamps: true })

bookSchema.index({ title: 'text', description: 'text', authorName: 'text', narrator: 'text' })

bookSchema.methods.liveCount = function liveCount() {
  const cutoff = Date.now() - 35000
  return this.presence.filter(item => new Date(item.at).getTime() > cutoff).length
}

bookSchema.methods.toCard = function toCard(userId) {
  return {
    id: this._id,
    isDemo: this.isDemo,
    sourceUrl: this.sourceUrl,
    sourceCredit: this.sourceCredit,
    licenseUrl: this.licenseUrl,
    title: this.title,
    description: this.description,
    genre: this.genre,
    narrator: this.narrator,
    authorName: this.authorName || this.owner?.name,
    coverUrl: this.coverUrl,
    visibility: this.visibility,
    chapters: this.chapters,
    plays: this.plays,
    likes: this.likedBy.length,
    liked: userId ? this.likedBy.some(id => String(id) === String(userId)) : false,
    comments: this.comments.length,
    live: this.liveCount(),
    language: this.spokenLanguage || this.language || 'English',
    series: this.series,
    seriesIndex: this.seriesIndex,
    year: this.year,
    sampleChapter: this.sampleChapter,
    rating: this.ratings.length ? this.ratings.reduce((sum, item) => sum + item.stars, 0) / this.ratings.length : 0,
    ratingCount: this.ratings.length,
    owner: this.owner?.public ? this.owner.public() : this.owner,
    createdAt: this.createdAt,
  }
}

module.exports = mongoose.models.Book || mongoose.model('Book', bookSchema)
