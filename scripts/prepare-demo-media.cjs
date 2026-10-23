const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const config = require('../data/demoCatalog.json')
const root = path.resolve(__dirname, '../artifacts/demo-media')
async function download(url, target, maxBytes) {
  let last
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: maxBytes ? { Range: `bytes=0-${maxBytes - 1}` } : {}, signal: AbortSignal.timeout(45000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
      const reader = response.body.getReader(), chunks = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const remaining = maxBytes ? maxBytes - total : value.length
        chunks.push(Buffer.from(value.slice(0, remaining))); total += Math.min(value.length, remaining)
        if (maxBytes && total >= maxBytes) { await reader.cancel(); break }
      }
      const bytes = Buffer.concat(chunks)
      if (bytes.length < 1000 || bytes.subarray(0, 100).toString().toLowerCase().includes('<!doctype')) throw new Error('Invalid media response')
      await fs.writeFile(target, bytes)
      return
    } catch (error) { last = error }
  }
  throw last
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.error?.message}`)
  return result.stdout
}
async function main() {
  for (const folder of ['audio', 'covers', 'avatars', 'source']) await fs.mkdir(path.join(root, folder), { recursive: true })
  const manifest = { version: config.version, preparedAt: new Date().toISOString(), profiles: [], books: [] }
  for (const [index, profile] of config.profiles.entries()) {
    const file = `avatars/demo-${index + 1}.jpg`
    await download(profile.portrait, path.join(root, file))
    manifest.profiles.push({ ...profile, avatar: `/uploads/${file}`, sourceUrl: profile.portrait })
    console.log(`Prepared portrait: ${profile.name}`)
  }
  for (const book of config.books) {
    const response = await fetch(`https://archive.org/metadata/${book.archiveId}`, { signal: AbortSignal.timeout(30000) })
    const metadata = await response.json()
    const audio = (metadata.files || []).filter(file => /_64kb\.mp3$/i.test(file.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 2)
    const cover = (metadata.files || []).find(file => /\.jpg$/i.test(file.name) && !/thumb|spectrogram/i.test(file.name))
    if (audio.length < 2 || !cover) throw new Error(`Incomplete source item: ${book.archiveId}`)
    const coverFile = `covers/demo-${book.slug}.jpg`
    await download(`https://archive.org/download/${book.archiveId}/${encodeURIComponent(cover.name)}`, path.join(root, coverFile))
    const chapters = []
    for (const [index, source] of audio.entries()) {
      const sourceUrl = `https://archive.org/download/${book.archiveId}/${encodeURIComponent(source.name)}`
      const partial = path.join(root, 'source', `${book.slug}-${index + 1}.mp3`)
      const output = `audio/demo-${book.slug}-${index + 1}.mp3`
      await download(sourceUrl, partial, 2000000)
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', partial, '-t', '90', '-map', '0:a:0', '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '64k', path.join(root, output)])
      const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path.join(root, output)]))
      const duration = Number(probe.format.duration)
      if (duration < 85 || duration > 92) throw new Error(`Unexpected duration for ${output}: ${duration}`)
      chapters.push({ title: `Chapter ${index + 1} — 90-second demo excerpt`, audioUrl: `/uploads/${output}`, duration, index: index + 1, sourceUrl })
      console.log(`Verified real audio: ${book.slug} excerpt ${index + 1}, ${duration.toFixed(1)} seconds`)
    }
    manifest.books.push({ ...book, coverUrl: `/uploads/${coverFile}`, sourceUrl: `https://archive.org/details/${book.archiveId}`, licenseUrl: metadata.metadata?.licenseurl || 'https://librivox.org/pages/public-domain/', chapters })
  }
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`Prepared ${manifest.books.length} books, ${manifest.books.reduce((n, b) => n + b.chapters.length, 0)} playable excerpts, and ${manifest.profiles.length} portraits`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
