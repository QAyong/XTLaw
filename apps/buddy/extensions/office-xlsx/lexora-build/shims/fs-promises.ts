import { promises } from './vfs'

export const { readFile, writeFile, rm, unlink, rename, copyFile, stat, lstat, mkdir, mkdtemp, readdir, access, open } = promises
export default promises
