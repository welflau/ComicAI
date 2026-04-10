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

const IDB_PREFIX = 'idb://'

/** Persist an image File/Blob to IndexedDB. Returns the reference string to store in nodeData. */
export async function saveImage(projectId: string, file: File): Promise<string> {
  const id = await db.images.add({
    projectId,
    fileName: file.name,
    mimeType: file.type || 'image/jpeg',
    data: file,
    createdAt: Date.now(),
  })
  return `${IDB_PREFIX}${id}`
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
 * Returns null if the record is not found.
 */
export async function resolveImageUrl(ref: string | undefined): Promise<string | null> {
  if (!ref) return null
  if (!isIdbRef(ref)) return ref   // plain URL or data URL — pass through

  const id = parseImageId(ref)
  const record = await db.images.get(id)
  if (!record) return null
  return URL.createObjectURL(record.data)
}

/** Delete all images belonging to a project (call when project is deleted). */
export async function deleteProjectImages(projectId: string): Promise<void> {
  await db.images.where('projectId').equals(projectId).delete()
}

/** Delete a single image by idb:// reference. */
export async function deleteImage(ref: string): Promise<void> {
  if (!isIdbRef(ref)) return
  await db.images.delete(parseImageId(ref))
}
