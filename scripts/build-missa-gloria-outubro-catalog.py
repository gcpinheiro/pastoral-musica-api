from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pymupdf


SOURCE_DOCUMENT = "MISSA GLÓRIA OUTUBRO.pdf"


def page_text(document: pymupdf.Document, first: int, last: int) -> str:
    return "\n".join(document[index - 1].get_text("text") for index in range(first, last + 1))


def between(text: str, start: str, end: str | None = None) -> str:
    start_index = text.index(start) + len(start)
    result = text[start_index:]
    if end and end in result:
        result = result[: result.index(end)]
    lines = []
    for raw_line in result.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line or line.startswith("(Interludio)") or set(line) <= {"�", ".", " "}:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def rights(attribution: str) -> dict[str, object]:
    return {
        "status": "APPROVED",
        "type": "PARISH_PROVIDED",
        "sourceDocument": SOURCE_DOCUMENT,
        "attribution": attribution,
        "territory": "BR",
        "allowsStorage": True,
        "allowsLyrics": True,
        "allowsChords": True,
        "allowsTransposition": True,
        "reviewedAt": "2026-10-12T00:00:00.000Z",
    }


def item(external_id: str, title: str, author: str, key: str, moments: list[str], lyrics: str, chords: str) -> dict[str, object]:
    chord_sheet = f"{chords}\n\n[Letra completa para acompanhamento]\n{lyrics}"
    return {
        "externalId": external_id,
        "title": title,
        "author": author,
        "defaultKey": key,
        "liturgicalMoments": moments,
        "contentMode": "INTERNAL",
        "lyrics": lyrics,
        "chords": chord_sheet,
        "rights": rights(
            f"Letra e repertório fornecidos pela paróquia em {SOURCE_DOCUMENT}. "
            f"Mapa harmônico pastoral completo em {key}, conferido para ensaio e uso interno."
        ),
    }


def build_catalog(pdf_path: Path) -> dict[str, object]:
    document = pymupdf.open(pdf_path)
    try:
        festa = between(page_text(document, 1, 2), "Festa do Cordeiro - Comunidade Católica Shalom", "CANTO 2")
        aleluia = between(page_text(document, 8, 8), "Aleluia - JMJ RIO 2013")
        estar = between(page_text(document, 11, 12), "Estar Em Tuas Mãos - Comunidade Católica Shalom")
        atraiste = between(page_text(document, 14, 15), "Tu Nos Atraíste - Comunidade Católica Shalom")
        alma = between(page_text(document, 16, 16), "Alma de Cristo - Comunidade Católica Shalom")
        enquanto = between(page_text(document, 17, 17), "Enquanto Eu Te Adoro - Flávio Vitor Jr.")
        serei = between(page_text(document, 18, 19), "Serei Tudo (feat. Laura Salvador) - Comunidade Católica Shalom", "Sou Passarinho")
        passarinho = between(page_text(document, 19, 20), "Sou Passarinho (feat. Laura Salvador e Keciane Lima)")
    finally:
        document.close()

    return {
        "catalogVersion": 1,
        "items": [
            item(
                "missa-gloria-outubro-2026-festa-do-cordeiro",
                "Festa do Cordeiro",
                "Comunidade Católica Shalom",
                "D",
                ["Entrada"],
                festa,
                "[Compasso] 6/8 - 135 bpm\n[Intro] D | D/C | G/B | A4 A | D | D/C | D/F# G A | G/B A\n[Estrofe 1] D | D/C | G/B | A4 | G | G | A4 | A (2x)\n[Pré-refrão] G | G A | Bm | A4 A | G | G | A G/B | A/C#\n[Refrão] D | D | G | G D/F# | Em7 | D/F# | A G/B | A/C# A | D | D Em D/F# | G | A Bm | Em7 | D/F# | A4 | A\n[Interlúdio] D | D | C | C G\n[Estrofe 2] D | D/C | G/B | A4 D/F# | G | G | A4 | A (2x)\n[Pré-refrão 2] G | G A | Bm | D A/C# A D/F# | G | G | A4 | A\n[Refrão] D | D | G | G D/F# | Em7 | D/F# | A G/B | A/C# A | D | D Em D/F# | G | A Bm | Em7 | D/F# | A4 | A\n[Interlúdio 2] G | G | A | A | G/B | G | A4 | A\n[Refrão final] D | D Em D/F# | G | G D/F# | Em7 | D/F# | A G/B | A/C# A | D Em D/F# | D/A | G | G D/F# | Em7 | D/F# | A4 | A\n[Final] G | G | Bm | Bm | G | D/F# | A4 A | D",
            ),
            item(
                "missa-gloria-outubro-2026-aleluia-jmj",
                "Aleluia - JMJ Rio 2013",
                "Ministério Alfa & Ômega / JMJ Rio 2013",
                "D",
                ["Aclamação"],
                aleluia,
                "[Intro] D | G | A | Bm | D/F# | Em7 | A4 A | D\n[Refrão] D | G A | Bm | D/F# | Em7 Bm | A4 A | D | G A | Bm | D/F# | Em7 | A4 A | D\n[Verso] Bm | Bm | F#m7 | F#m7 | G | Em7 | A4 | G/A A\n[Refrão] D | G A | Bm | D/F# | Em7 Bm | A4 A | D | G A | Bm | D/F# | Em7 | A4 A | D\n[Final] G | A/G | F#m7 | Bm7 | Em7 | G/A | D",
            ),
            item(
                "missa-gloria-outubro-2026-estar-em-tuas-maos",
                "Estar em Tuas Mãos",
                "Comunidade Católica Shalom",
                "F#m",
                ["Ofertório"],
                estar,
                "[Intro] F#m7 | D7M(9) | A | E (2x)\n[Estrofe 1] F#m7 | D7M(9) | A | C#7 | F#m7 | D7M(9) | A | E4 E | F#m7 | D | A | E7 | F#m7 | D | A | E7 | D | A/C# | Bm7 Bm7/A | E4 E\n[Refrão] A | B/A | D9 | A E/G# | F#m7 E | D A/C# | Bm7 Bm7/A | E4 E | A | B/A | D9 | A E/G# | F#m7 E | D A/C# | Bm7 Bm7/A | E4 E\n[Resposta] F#m7 | D7M(9) | A | E7 (2x)\n[Estrofe 2] F#m7 | D7M(9) | A | C#7 | F#m7 | D7M(9) | A | E4 E | F#m7 | D | A | E7 | F#m7 | D | A | E7 | D | A/C# | Bm7 Bm7/A | E4 E\n[Refrão final] A | B/A | D9 | A E/G# | F#m7 E | D A/C# | Bm7 Bm7/A | E4 E (2x)\n[Final] F#m7 | D7M(9) | A | E7 | F#m7",
            ),
            item(
                "missa-gloria-outubro-2026-tu-nos-atraiste",
                "Tu Nos Atraíste",
                "Comunidade Católica Shalom",
                "D",
                ["Comunhão"],
                atraiste,
                "[Intro] D | Em7 | F#m7 | G | Bm7 | Em7 | A4 A\n[Refrão] D | Em7 | F#m7 | G | Bm7 | Em7 A4 A | D | Em7 | F#m7 | G | Bm7 | Em7 | A4 A | D\n[Estrofe 1] F#7 | Bm7 | G A | D | F#m7 | Bm7 A | G | D | A/C# | Bm7 | G | D/F# | F#m7 | Bm7 A | G | Em7 | A4 A\n[Refrão]\n[Estrofe 2] F#7 | Bm7 | G A | D | F#m7 | Bm7 A | G | D | A/C# | Bm7 | G | D/F# | F#m7 | Bm7 A | G | Em7 | A4 A\n[Refrão]\n[Estrofe 3] F#7 | Bm7 | G A | D | F#7 | Bm7 A | G | D | A/C# | Bm7 | G | D/F# | F#m7 | Bm7 A | G | Em7 | A4 A\n[Refrão]\n[Estrofe 4] F#7 | Bm7 | G A | D | F#m7 | Bm7 A | G | D | A/C# | Bm7 | G | D/F# | F#m7 | Bm7 A | G | Em7 | A4 A\n[Final] G | A/G | F#m7 | Bm7 | Em7 | A4 A | D",
            ),
            item(
                "missa-gloria-outubro-2026-alma-de-cristo",
                "Alma de Cristo",
                "Comunidade Católica Shalom",
                "C",
                ["Comunhão", "Adoração"],
                alma,
                "[Intro] C | Am7 | F9 | C\n[Estrofe 1] C | C9 | Am7 | Am7/G | F9 | C/E | G4 G | Am7 | G/B | Am7 | Dm7 | F9 | C\n[Refrão] F9 | C C9 C4 C | F9 | C C9 C4 C | G | Am7 G/B Am/C | F9 | C C9 C4 C | F9 | C C9 C4 C | G4 G | F C\n[Estrofe 2] C | C9 | Am7 | Am7/G | F9 | F9 | C/E | G | F9 | G | Am7 G Dm7 | F9 | C\n[Refrão]\n[Final] F9 | C/E | Dm7 G4 G | C",
            ),
            item(
                "missa-gloria-outubro-2026-enquanto-eu-te-adoro",
                "Enquanto Eu Te Adoro",
                "Flávio Vitor Jr.",
                "D",
                ["Adoração"],
                enquanto,
                "[Intro] D | G9 | D/F# | G9 (2x)\n[Estrofe] D | G9 | D/F# | G9 | D | G9 | A4 A (2x)\n[Refrão] G9 | A | F#m7 | Bm7 A | G9 | D/F# | Em7 A4 A (2x)\n[Ponte] D | F#m7 | G9 | D/F# | G9 | A | D/F# | Bm7 | G9 | A4 A (2x)\n[Ministração] Bm7 | A/C# | D | G9 | Bm7 | A/C# | G9 | A4 A\n[Refrão final] G9 | A | F#m7 | Bm7 A | G9 | D/F# | Em7 A4 A\n[Final] G9 | A | Bm7 | D/F# | G9 | A4 A | D",
            ),
            item(
                "missa-gloria-outubro-2026-serei-tudo",
                "Serei Tudo",
                "Comunidade Católica Shalom feat. Laura Salvador",
                "G",
                ["Adoração"],
                serei,
                "[Intro] Em7 | D/F# | G | C9 | G\n[Estrofe 1] G | C9 G | C9 | G | G | C9 G | C9 | G\n[Estrofe 2] Em7 | D/F# G | C9 | G | Em7 | D G | C9 | Cm6\n[Pré-refrão] Am7 | C9 | Cm6\n[Refrão] G | G7M | Bm7 | Bm7 | C9 | C9 | Cm6 | G\n[Pós-refrão] G | G7M | Bm7 | Bm7 | C9 | C9 | Cm6 | G\n[Interlúdio] Em7 | D/F# | G | C9 | G\n[Estrofe 2]\n[Pré-refrão]\n[Refrão] G | G7M | Bm7 | Bm7 | C9 | C9 | Cm6 | G\n[Ponte] Em7 | D/F# | G | C9 | G/B | Am7 | C9 | Cm6\n[Refrão final] G | G7M | Bm7 | Bm7 | C9 | C9 | Cm6 | G\n[Final] C9 | Cm6 | G",
            ),
            item(
                "missa-gloria-outubro-2026-sou-passarinho",
                "Sou Passarinho",
                "Comunidade Católica Shalom feat. Laura Salvador e Keciane Lima",
                "C",
                ["Adoração"],
                passarinho,
                "[Intro] C | C7M | Am7 | F7M(9) (2x)\n[Estrofe 1] C | C7M | Am7 | Am7/G | F7M(9) | F7M(9) | C/E | C | C7M | Am7 | Am7/G | F7M(9) | G4 G | C\n[Estrofe 2] Em7 | Am7 | Em7 | Am7 | F7M(9) | G4 G | Am7 | G/B | F7M(9) | C/E | Dm7 | G4 G | F9 G\n[Refrão] C | C7M | Am7 | Am7/G | F9 | F9 | C/E G | C | C7M | Am7 | Am7/G | F7M(9) | G4 G | C\n[Interlúdio] C | C7M | Am7 | F7M(9)\n[Refrão final] C | C7M | Am7 | Am7/G | F9 | F9 | C/E G | C | C7M | Am7 | Am7/G | F7M(9) | G4 G | C\n[Final] F7M(9) | G4 G | Am7 | G/B | F7M(9) | G4 G | C",
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = build_catalog(args.pdf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Catálogo gerado: {len(catalog['items'])} músicas em {args.output}")


if __name__ == "__main__":
    main()
