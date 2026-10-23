const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  isDemo: { type: Boolean, default: false },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 400 },
  location: { type: String, default: '', maxlength: 80 },
  website: { type: String, default: '', maxlength: 160 },
  role: { type: String, default: 'Listener', maxlength: 40 },
  favoriteGenre: { type: String, default: 'Fiction', maxlength: 40 },
  languages: { type: String, default: 'English', maxlength: 80 },
  pronouns: { type: String, default: '', maxlength: 40 },
  tokenVersion: { type: Number, default: 0 },
  sleepMinutes: { type: Number, default: 0 },
  weeklyGoal: { type: Number, default: 120 },
  monthlyGoal: { type: Number, default: 2 },
  clientState: { type: mongoose.Schema.Types.Mixed, default: {} },
  playbackRate: { type: Number, default: 1 },
  emailVerified: { type: Boolean, default: false },
  verifyToken: String,
  verifyExpires: Date,
  resetToken: String,
  resetExpires: Date,
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

userSchema.methods.public = function publicProfile(isSelf = false) {
  const profile = {
    id: this._id,
    isDemo: this.isDemo,
    name: this.name,
    avatar: this.avatar,
    bio: this.bio,
    location: this.location,
    website: this.website,
    role: this.role,
    favoriteGenre: this.favoriteGenre,
    languages: this.languages,
    pronouns: this.pronouns,
    followers: this.followers?.length ?? 0,
    following: this.following?.length ?? 0,
    createdAt: this.createdAt,
  }
  if (isSelf) {
    profile.email = this.email
    profile.playbackRate = this.playbackRate
    profile.sleepMinutes = this.sleepMinutes
    profile.weeklyGoal = this.weeklyGoal
    profile.monthlyGoal = this.monthlyGoal
    profile.emailVerified = this.emailVerified
  }
  return profile
}

module.exports = mongoose.models.User || mongoose.model('User', userSchema)
