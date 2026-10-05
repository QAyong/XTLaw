// Limits apply to both compressed input and actual expanded package bytes.
export const EXTENSION_FILE_LIMIT = 16 * 1024 * 1024
export const EXTENSION_PACKAGE_LIMIT = 64 * 1024 * 1024
export const EXTENSION_ARCHIVE_BASE64_LIMIT = Math.ceil(EXTENSION_PACKAGE_LIMIT / 3) * 4
