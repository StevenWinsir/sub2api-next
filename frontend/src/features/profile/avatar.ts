/** 头像上传：压缩到约 20KB 的 WebP（逐档缩小尺寸 / 质量），GIF 不压缩。 */
import { t } from '@/i18n'

export const TARGET_AVATAR_UPLOAD_BYTES = 20 * 1024
const SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]
const QUALITY_STEPS = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]

/** 仅接受 data:image/*;base64 的头像。 */
export function isImageDataUrl(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value.trim())
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('avatar_read_failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('profile.avatar.readFailed')))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(t('profile.avatar.compressFailed')))),
      type,
      quality
    )
  )
}

async function compressAvatarFile(file: File): Promise<File> {
  const image = await loadImage(await readFileAsDataURL(file))
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(t('profile.avatar.compressFailed'))
  for (const scale of SCALE_STEPS) {
    const w = Math.max(1, Math.round(image.naturalWidth * scale))
    const h = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(image, 0, 0, w, h)
    for (const q of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/webp', q)
      if (blob.size <= TARGET_AVATAR_UPLOAD_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'avatar'}.webp`, {
          type: 'image/webp'
        })
      }
    }
  }
  throw new Error(t('profile.avatar.compressTooLarge'))
}

export async function prepareAvatarUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error(t('profile.avatar.invalidType'))
  if (file.type === 'image/gif') {
    if (file.size > TARGET_AVATAR_UPLOAD_BYTES) throw new Error(t('profile.avatar.gifTooLarge'))
    return file
  }
  return file.size <= TARGET_AVATAR_UPLOAD_BYTES ? file : compressAvatarFile(file)
}
