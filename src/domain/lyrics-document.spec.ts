import { normalizeLyricsDocument } from './lyrics-document';
import { ProblemException } from '../common/problem.exception';

describe('normalizeLyricsDocument', () => {
  it('keeps supported formatting and merges adjacent segments', () => {
    expect(normalizeLyricsDocument({
      version: 1,
      segments: [
        { text: 'Cantai, ', bold: true, voice: 'WOMEN', ignored: 'value' },
        { text: 'cantai', bold: true, voice: 'WOMEN' },
        { text: '\nTodos', voice: 'ALL' },
      ],
    })).toEqual({
      version: 1,
      segments: [
        { text: 'Cantai, cantai', bold: true, voice: 'WOMEN' },
        { text: '\nTodos', voice: 'ALL' },
      ],
    });
  });

  it('rejects unsupported marks', () => {
    expect(() => normalizeLyricsDocument({
      version: 1,
      segments: [{ text: 'Trecho', voice: 'CHOIR' }],
    })).toThrow(ProblemException);
  });
});
