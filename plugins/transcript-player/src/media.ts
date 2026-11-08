const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac'])

// Resource only guarantees a name, not a MIME type or a local file path.
export function isAudioFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && AUDIO_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}
