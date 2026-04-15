/**
 * imageStore — IndexedDB-backed image storage helpers
 *
 * Usage:
 *   const imageId = await saveImage(projectId, file)
 *   // store `idb://${imageId}` as nodeData.imageUrl
 *
 *   const blobUrl = await getImageUrl('idb://42')
 *   // use blobUrl for <img src={blobUrl} />
 *   // call revokeImageUrl(blobUrl) when unmounting to free memory
 */
import { db } from './db'
import placeholderImageUrl from '@/assets/placeholder-image.webp'

const IDB_PREFIX     = 'idb://'
const DEFAULT_PREFIX = 'default://'

/** The imageUrl value that represents "show the default placeholder image" */
export const DEFAULT_IMAGE_URL = 'default://placeholder'

/** Persist an image File/Blob to backend storage. Returns the URL to store in nodeData. */
export async function saveImage(projectId: string, file: File): Promise<string> {
  const { assetsApi } = await import('@/api')
  try {
    const result = await assetsApi.upload(projectId, file, 'image')
    return result.url as string   // e.g. "/uploads/images/abc.png"
  } catch {
    // Fallback: backend unavailable → store in IndexedDB (offline/dev compatibility)
    const id = await db.images.add({
      projectId,
      fileName: file.name,
      mimeType: file.type || 'image/jpeg',
      data: file,
      createdAt: Date.now(),
    })
    return `${IDB_PREFIX}${id}`
  }
}

/** Returns true if a string looks like an IDB reference. */
export function isIdbRef(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith(IDB_PREFIX)
}

/** Parse the numeric image id out of an idb:// reference string. */
export function parseImageId(ref: string): number {
  return Number(ref.slice(IDB_PREFIX.length))
}

/**
 * Resolve an idb:// reference to a temporary blob URL for display.
 * If the string is already a plain URL / data URL, returns it unchanged.
 * Special: 'default://placeholder' returns the built-in SVG placeholder.
 * Returns null if the record is not found.
 */
export async function resolveImageUrl(ref: string | undefined): Promise<string | null> {
  if (!ref) return null
  if (ref.startsWith(DEFAULT_PREFIX)) return placeholderImageUrl
  if (!isIdbRef(ref)) return ref   // plain URL or data URL — pass through

  const id = parseImageId(ref)
  const record = await db.images.get(id)
  if (!record) return null
  return URL.createObjectURL(record.data)
}

/**
 * Resolve an idb:// reference to a data URL (base64) for AI vision calls.
 * - default://placeholder → fetch the built-in webp asset and convert to base64
 * - idb://N               → data URL via FileReader
 * - data:...              → returned as-is
 * - http(s)://...         → returned as-is (Anthropic accepts URL type)
 * Returns null if the record is not found.
 */
export async function resolveImageToDataUrl(ref: string | undefined): Promise<string | null> {
  if (!ref) return null
  if (ref.startsWith(DEFAULT_PREFIX)) {
    // The placeholder is a real .webp asset — fetch it and convert to base64 for AI vision
    try {
      const response = await fetch(placeholderImageUrl)
      const blob = await response.blob()
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }
  if (ref.startsWith('data:')) return ref           // already a data URL
  if (!isIdbRef(ref)) return ref                    // plain http(s) URL

  const id = parseImageId(ref)
  const record = await db.images.get(id)
  if (!record) return null

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(record.data)
  })
}
export async function deleteProjectImages(projectId: string): Promise<void> {
  await db.images.where('projectId').equals(projectId).delete()
}

/** Delete a single image by idb:// reference. */
export async function deleteImage(ref: string): Promise<void> {
  if (!isIdbRef(ref)) return
  await db.images.delete(parseImageId(ref))
}
