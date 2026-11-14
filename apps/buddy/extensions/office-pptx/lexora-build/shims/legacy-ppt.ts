// Direct legacy .ppt conversion is not part of the Office PPTX plugin.
export class LegacyPptError extends Error {
  readonly code = 'unsupported'
}

export async function convertPptToPptx(): Promise<never> {
  throw new LegacyPptError('Legacy .ppt conversion is unavailable in this plugin')
}
