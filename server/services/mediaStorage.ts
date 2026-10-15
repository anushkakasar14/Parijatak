import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getStore } from '@netlify/blobs'
import { env } from '../config/env.ts'

/**
 * Where uploaded files are kept.
 *
 *  - On Netlify: Netlify Blobs, the site's persistent object storage. Files survive
 *    deploys and are never written to the function's temporary disk.
 *  - Local development: the ignored ./data/uploads folder.
 *  - Tests: memory.
 */
export interface MediaStorage {
  readonly kind: 'netlify-blobs' | 'local-folder' | 'memory'
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>
  delete(key: string): Promise<void>
}

const STORE_NAME = 'parijatak-media'

function netlifyBlobs(): MediaStorage {
  // Default (eventual) consistency. Strong reads need an address that functions in this
  // format are not given, so a new upload can take a few seconds to be readable everywhere.
  const store = () => getStore(STORE_NAME)
  return {
    kind: 'netlify-blobs',
    async put(key, data, contentType) {
      const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      await store().set(key, bytes, { metadata: { contentType } })
    },
    async get(key) {
      const result = await store().getWithMetadata(key, { type: 'arrayBuffer' })
      if (!result) return null
      return {
        data: Buffer.from(result.data),
        contentType: String(result.metadata.contentType ?? 'application/octet-stream'),
      }
    },
    async delete(key) {
      await store().delete(key)
    },
  }
}

function localFolder(): MediaStorage {
  const dir = resolve('data', 'uploads')
  const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  return {
    kind: 'local-folder',
    async put(key, data) {
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, key), data)
    },
    async get(key) {
      try {
        const data = await readFile(join(dir, key))
        return { data, contentType: types[key.split('.').pop() ?? ''] ?? 'application/octet-stream' }
      } catch {
        return null
      }
    },
    async delete(key) {
      await rm(join(dir, key), { force: true })
    },
  }
}

function memory(): MediaStorage {
  const files = new Map<string, { data: Buffer; contentType: string }>()
  return {
    kind: 'memory',
    async put(key, data, contentType) {
      files.set(key, { data, contentType })
    },
    async get(key) {
      return files.get(key) ?? null
    },
    async delete(key) {
      files.delete(key)
    },
  }
}

let storage: MediaStorage | undefined

export function getMediaStorage(): MediaStorage {
  storage ??=
    process.env.PARIJATAK_RUNTIME === 'netlify' ? netlifyBlobs() : env.isTest ? memory() : localFolder()
  return storage
}
