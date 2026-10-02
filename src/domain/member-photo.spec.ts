import { detectMemberPhotoMime, memberPhotoDataUrl } from './member-photo';

describe('memberPhotoDataUrl', () => {
  it('creates a Base64 data URL for a valid PNG', () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectMemberPhotoMime(image)).toBe('image/png');
    expect(memberPhotoDataUrl(image, 'image/png')).toBe(`data:image/png;base64,${image.toString('base64')}`);
  });

  it('rejects content whose signature does not match the declared MIME type', () => {
    const text = Buffer.from('<script>alert(1)</script>');
    expect(memberPhotoDataUrl(text, 'image/png')).toBeNull();
  });

  it('rejects a valid image declared as another allowed image type', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(memberPhotoDataUrl(jpeg, 'image/webp')).toBeNull();
  });
});
