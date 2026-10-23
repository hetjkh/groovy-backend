const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  seconds: { type: Number, default: 0 },
})
schema.index({ user: 1, day: 1 }, { unique: true })
module.exports = mongoose.models.ListeningDay || mongoose.model('ListeningDay', schema)
