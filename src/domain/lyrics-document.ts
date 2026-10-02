import { ProblemException } from '../common/problem.exception';

export type LyricVoice = 'WOMEN' | 'MEN' | 'ALL';

export interface LyricSegment {
  readonly text: string;
  readonly bold?: true;
  readonly italic?: true;
  readonly voice?: LyricVoice;
}

export interface LyricsDocument {
  readonly version: 1;
  readonly segments: readonly LyricSegment[];
}

const voices = new Set<LyricVoice>(['WOMEN', 'MEN', 'ALL']);
const maxCharacters = 100_000;
const maxSegments = 5_000;

export function normalizeLyricsDocument(value: unknown): LyricsDocument {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.segments))
    invalidDocument();
  if (value.segments.length > maxSegments) invalidDocument();

  let characterCount = 0;
  const segments: LyricSegment[] = [];
  for (const candidate of value.segments) {
    if (!isRecord(candidate) || typeof candidate.text !== 'string') invalidDocument();
    characterCount += candidate.text.length;
    if (characterCount > maxCharacters) invalidDocument();
    if (candidate.voice !== undefined && !voices.has(candidate.voice as LyricVoice))
      invalidDocument();
    if (candidate.bold !== undefined && candidate.bold !== true) invalidDocument();
    if (candidate.italic !== undefined && candidate.italic !== true) invalidDocument();
    if (!candidate.text) continue;
    const segment: LyricSegment = {
      text: candidate.text,
      ...(candidate.bold === true ? { bold: true as const } : {}),
      ...(candidate.italic === true ? { italic: true as const } : {}),
      ...(candidate.voice ? { voice: candidate.voice as LyricVoice } : {}),
    };
    const previous = segments.at(-1);
    if (previous && sameMarks(previous, segment)) {
      segments[segments.length - 1] = { ...previous, text: previous.text + segment.text };
    } else segments.push(segment);
  }
  if (!segments.length) invalidDocument();
  return { version: 1, segments };
}

function sameMarks(left: LyricSegment, right: LyricSegment): boolean {
  return left.bold === right.bold && left.italic === right.italic && left.voice === right.voice;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidDocument(): never {
  throw new ProblemException(400, 'INVALID_LYRICS_DOCUMENT', 'A formatação da letra é inválida.');
}
