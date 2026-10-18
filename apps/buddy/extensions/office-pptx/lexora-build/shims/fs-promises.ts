import { promises } from './vfs'

export const { readFile, writeFile, rm, unlink, rename, copyFile, stat, mkdir, readdir, access, open } = promises
export default promises
