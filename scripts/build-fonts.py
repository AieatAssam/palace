#!/usr/bin/env python3
"""Builds the self-hosted type files in src/assets/fonts from the full OFL sources.

  python3 -m venv /tmp/ftv && /tmp/ftv/bin/pip install fonttools brotli
  /tmp/ftv/bin/python scripts/build-fonts.py <dir with EBGaramond[wght].ttf, EBGaramond-Italic[wght].ttf, GentiumBookPlus-Regular.ttf>

Sources: EB Garamond (github.com/octaviopardo/EBGaramond12, OFL) via google/fonts;
Gentium Book Plus (SIL, OFL) for the sharp sign, which EB Garamond does not draw.

Outputs
  garamond-{400,500}.woff2, garamond-400-italic.woff2  web faces; keep smcp/c2sc/onum/lnum/tnum/liga/kern
  sharp.woff2                                         U+266D-266F from Gentium Book Plus (same @font-face family, unicode-range)
  ledger-roman.ttf / ledger-smcp.ttf / ledger-italic.ttf / ledger-figures.ttf (digits only, lining tabular)
      for troika (3D text): no OpenType feature switches there, so the features are baked
      into the cmap — old-style figures everywhere, and in ledger-smcp lowercase draws true small caps.
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

src, out = sys.argv[1], os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'fonts')
os.makedirs(out, exist_ok=True)

# Basic Latin, Latin-1, general punctuation we set, Roman-numeral capitals, a few typographic marks.
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x2116, 0x2160, 0x2161, 0x2162, 0x20, 0x2009, 0x202F,
]
FEATURES = ['smcp', 'c2sc', 'onum', 'lnum', 'tnum', 'pnum', 'liga', 'kern', 'case', 'ccmp', 'locl', 'mark', 'mkmk']


def instance(path, wght):
    f = TTFont(path)
    return instantiateVariableFont(f, {'wght': wght}, inplace=False)


def do_subset(font, unicodes, features, flavor, dest):
    opts = subset.Options()
    opts.layout_features = features
    opts.flavor = flavor
    opts.name_IDs = [0, 1, 2, 3, 4, 6, 13, 14]
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=unicodes)
    s.subset(font)
    font.flavor = flavor
    font.save(dest)
    print('wrote', os.path.relpath(dest), os.path.getsize(dest), 'bytes')


def single_subst(font, tag):
    """glyph -> glyph map of a feature's single substitutions."""
    gsub = font['GSUB'].table
    idx = {i for fr in gsub.FeatureList.FeatureRecord if fr.FeatureTag == tag for i in fr.Feature.LookupListIndex}
    m = {}
    for i in idx:
        lk = gsub.LookupList.Lookup[i]
        for st in lk.SubTable:
            st = getattr(st, 'ExtSubTable', st)
            if hasattr(st, 'mapping'):
                m.update(st.mapping)
    return m


def bake(font, tags, only=None):
    """Point cmap entries at the feature's substituted glyphs."""
    maps = {}
    for t in tags:
        maps.update(single_subst(font, t))
    for table in font['cmap'].tables:
        for code, name in list(table.cmap.items()):
            if only and not only(code):
                continue
            if name in maps:
                table.cmap[code] = maps[name]


ROMAN = os.path.join(src, 'EBGaramond[wght].ttf')
ITALIC = os.path.join(src, 'EBGaramond-Italic[wght].ttf')

for w in (400, 500):
    do_subset(instance(ROMAN, w), UNICODES, FEATURES, 'woff2', f'{out}/garamond-{w}.woff2')
do_subset(instance(ITALIC, 400), UNICODES, FEATURES, 'woff2', f'{out}/garamond-400-italic.woff2')

# 3D text (troika): TTF with the features baked in.
r = instance(ROMAN, 500)
bake(r, ['onum'], only=lambda c: 0x30 <= c <= 0x39)
do_subset(r, UNICODES, ['kern', 'liga'], None, f'{out}/ledger-roman.ttf')
s = instance(ROMAN, 500)
bake(s, ['onum'], only=lambda c: 0x30 <= c <= 0x39)
bake(s, ['smcp'], only=lambda c: 0x61 <= c <= 0x7A or 0xDF <= c <= 0xFF)
do_subset(s, UNICODES, ['kern'], None, f'{out}/ledger-smcp.ttf')
# Figures for columns that must align: lining and tabular.
n = instance(ROMAN, 500)
bake(n, ['tnum'], only=lambda c: 0x30 <= c <= 0x39)
do_subset(n, list(range(0x30, 0x3A)) + [0x20, 0x25, 0x2E, 0x2C, 0x2013, 0x2014, 0x2F], ['kern'], None, f'{out}/ledger-figures.ttf')
i = instance(ITALIC, 500)
bake(i, ['onum'], only=lambda c: 0x30 <= c <= 0x39)
do_subset(i, UNICODES, ['kern', 'liga'], None, f'{out}/ledger-italic.ttf')

# The sharp sign: not in EB Garamond. Gentium Book Plus draws ♭ ♮ ♯ in a book-serif hand.
g = TTFont(os.path.join(src, 'GentiumBookPlus-Regular.ttf'))
do_subset(g, [0x266D, 0x266E, 0x266F], [], 'woff2', f'{out}/sharp.woff2')
