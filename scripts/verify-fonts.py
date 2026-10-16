#!/usr/bin/env python3
"""Fails unless the shipped faces carry smcp/c2sc/onum and the sharp face has U+266F."""
import sys, glob, os
from fontTools.ttLib import TTFont
d = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'fonts')
ok = True
for p in sorted(glob.glob(d + '/garamond-*.woff2')):
    f = TTFont(p)
    tags = {r.FeatureTag for r in f['GSUB'].table.FeatureList.FeatureRecord}
    miss = {'smcp', 'c2sc', 'onum'} - tags
    print(os.path.basename(p), 'features ok' if not miss else f'MISSING {miss}')
    ok &= not miss
f = TTFont(d + '/sharp.woff2')
has = 0x266F in f.getBestCmap()
print('sharp.woff2 U+266F', has)
ok &= has
from fontTools.pens.boundsPen import BoundsPen


def bounds(name, ch):
    f = TTFont(d + '/' + name)
    gs = f.getGlyphSet()
    p = BoundsPen(gs)
    gs[f.getBestCmap()[ord(ch)]].draw(p)
    return p.bounds


# Baked features show in the outlines: small caps are wider than the lowercase; old-style 3 descends.
sc, lc = bounds('ledger-smcp.ttf', 'a'), bounds('ledger-roman.ttf', 'a')
print('smcp a', sc, 'vs roman a', lc)
ok &= sc[3] > lc[3] + 20
three = bounds('ledger-roman.ttf', '3')
print('onum 3', three)
ok &= three[1] < -100
sys.exit(0 if ok else 1)
