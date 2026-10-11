type LocalFontWindow = typeof window & {
  queryLocalFonts: () => Promise<ReadonlyArray<{ family: string }>>
}

/** Lists installed font families. Requires the `local-fonts` permission granted to the trusted main frame. */
export async function listLocalFontFamilies(): Promise<string[]> {
  const fonts = await (window as LocalFontWindow).queryLocalFonts()
  return [...new Set(fonts.map(font => font.family))].sort((left, right) => left.localeCompare(right))
}
