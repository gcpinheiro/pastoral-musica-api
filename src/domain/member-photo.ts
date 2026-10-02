const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');

export type MemberPhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectMemberPhotoMime(buffer: Buffer): MemberPhotoMime | null {
  if (buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'image/jpeg';
  if (buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'image/png';
  if (
    buffer.subarray(0, RIFF_SIGNATURE.length).equals(RIFF_SIGNATURE) &&
    buffer.subarray(8, 12).equals(WEBP_SIGNATURE)
  ) return 'image/webp';
  return null;
}

export function memberPhotoDataUrl(buffer: Buffer, declaredMime: string): string | null {
  const detectedMime = detectMemberPhotoMime(buffer);
  if (!detectedMime || detectedMime !== declaredMime) return null;
  return `data:${detectedMime};base64,${buffer.toString('base64')}`;
}

export function memberPhotoFromDataUrl(value: string): { mime: MemberPhotoMime; buffer: Buffer } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  const mime = match[1] as MemberPhotoMime;
  return detectMemberPhotoMime(buffer) === mime ? { mime, buffer } : null;
}
