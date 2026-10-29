#!/usr/bin/env python3
"""Writes guide/products/hemnes.json, the 8-drawer dresser guide, from the HEMNES manual (AA-2406539-5).

    python3 tools/products/hemnes.py [out.json]

Too big to write by hand as JSON: 497 parts. This script places them, then lists the steps in the
manual's order. Run tools/validate-product.mjs on the result.

Finished, upright frame in cm: x left to right, y up, z back to front (front +z). Sizes are
estimates from the drawings; counts, part numbers and order follow the manual.
"""
import json
import os
import sys

parts = []
steps = []
ids = set()


def r1(v):
    return [round(x, 3) for x in v]


def add(p):
    assert p['id'] not in ids, p['id']
    ids.add(p['id'])
    parts.append(p)
    return p['id']


def board(id, name, size, pos, mat, label='', parent=None, stageUp=None):
    p = {'id': id, 'name': name, 'label': label, 'shape': 'board', 'size': r1(size), 'pos': r1(pos), 'material': mat}
    if parent:
        p['parent'] = parent
    if stageUp:
        p['stageUp'] = stageUp
    return add(p)


def hw(id, name, label, shape, radius, length, pos, dir, mat, parent=None):
    p = {'id': id, 'name': name, 'label': label, 'shape': shape, 'radius': radius, 'length': length,
         'pos': r1(pos), 'dir': dir, 'material': mat}
    if parent:
        p['parent'] = parent
    return add(p)


def step(title, text, tool, part_ids, manual=None, **kw):
    s = {}
    if manual is not None:
        s['manual'] = manual
    s.update({'title': title, 'text': text, 'tool': tool, 'parts': list(part_ids)})
    s.update(kw)
    steps.append(s)


def flip(title, text, axis, angle, manual=None, **kw):
    s = {'type': 'flip'}
    if manual is not None:
        s['manual'] = manual
    s.update({'axis': axis, 'angle': angle, 'title': title, 'text': text, 'tool': 'Hands', 'parts': []})
    s.update(kw)
    steps.append(s)


def turn(title, text, turn_ids, manual=None, pose=None, up=None, **kw):
    s = {'type': 'turn'}
    if manual is not None:
        s['manual'] = manual
    s.update({'title': title, 'text': text, 'tool': 'Hands', 'parts': [], 'turn': list(turn_ids)})
    if pose:
        s['pose'] = pose
    if up:
        s['up'] = up
    s.update(kw)
    steps.append(s)


# Hardware shapes, by part number.
def stud118331(id, pos, dir, parent=None):  # cam stud, half in each piece
    return hw(id, 'Cam stud', '118331', 'pin', 0.35, 3.4, pos, dir, 'steel', parent)


def dowel101350(id, pos, dir, parent=None):
    return hw(id, 'Short dowel', '101350', 'dowel', 0.4, 3, pos, dir, 'dowel', parent)


def lock110630(id, pos, dir, parent=None):  # cam lock: sits in its hole, a sliver proud
    return hw(id, 'Cam lock', '110630', 'pin', 0.75, 1.2, pos, dir, 'steel', parent)


def lockAt(face_point, dir):
    return [face_point[i] + dir[i] * 0.4 for i in range(3)]


W = 'white'      # the stained solid-wood parts you see
IN = 'birch'     # drawer boxes
HB = 'hardboard'
ST = 'steel'

# ---------------- carcase geometry ----------------
LEG_X = 76.75          # leg centres, x
LEG_Z = 21.25          # leg centres, z
LEG_IN = 74.5          # inner faces of the legs (x)
PANEL_IN = 75.85       # inner face of the side panels (x)
RAIL_Z = 22.0          # front rails (back rail at -22)
TOP_Y = 91.0           # top rails, 89-93
BOT_Y = 11.5           # bottom front rail, 9-14
ROW_Y = [44.5, 69.5]   # short rails, 3 tall
RUN_Y = [15.5, 47.5, 72.5]  # cabinet runners: large, middle, small rows
STRIP_Z = 12.0

# legs (manual labels L1, L2, R1, R2; 1 = front, 2 = back)
legs = {}
for side, sx in (('L', -1), ('R', 1)):
    for n, sz in (('1', 1), ('2', -1)):
        pos_name = ('Left' if sx < 0 else 'Right') + (' front' if sz > 0 else ' back')
        legs[side + n] = board('leg' + side + n, f'{pos_name} leg', [4.5, 92.4, 4.5], [sx * LEG_X, 46.8, sz * LEG_Z], W, label=side + n)

panelL = board('panelL', 'Left side panel', [1.8, 84, 38], [-LEG_X, 51, 0], W, stageUp=[1, 0, 0])
panelR = board('panelR', 'Right side panel', [1.8, 84, 38], [LEG_X, 51, 0], W, stageUp=[-1, 0, 0])
panels = {'L': panelL, 'R': panelR}
for k in legs:
    next(p for p in parts if p['id'] == legs[k])['parent'] = panels[k[0]]

# step 1: 12 cam studs in the legs, on the face toward the panel
s1 = []
for k, leg in legs.items():
    sx = -1 if k[0] == 'L' else 1
    sz = 1 if k[1] == '1' else -1
    for j, y in enumerate((22, 52, 82)):
        s1.append(stud118331(f'stud1{k}{j}', [sx * LEG_X, y, sz * 19], [0, 0, sz], leg))
# step 2: 8 dowels in the legs
s2 = []
for k, leg in legs.items():
    sx = -1 if k[0] == 'L' else 1
    sz = 1 if k[1] == '1' else -1
    for j, y in enumerate((37, 67)):
        s2.append(dowel101350(f'dowel2{k}{j}', [sx * LEG_X, y, sz * 19], [0, 0, sz], leg))
# step 3: 12 cam locks in the panels
s3 = []
for side, sx in (('L', -1), ('R', 1)):
    for sz in (1, -1):
        for j, y in enumerate((22, 52, 82)):
            s3.append(lock110630(f'lock3{side}{"f" if sz > 0 else "b"}{j}', lockAt([sx * PANEL_IN, y, sz * 17], [sx, 0, 0]), [sx, 0, 0], panels[side]))
# step 4: long dowels and interlock strips
s4a, strips = [], {}
for side, sx in (('L', -1), ('R', 1)):
    for j, y in enumerate((25, 53, 81)):
        s4a.append(hw(f'dowel4{side}{j}', 'Long dowel', '101353', 'dowel', 0.5, 2.2, [sx * PANEL_IN, y, STRIP_Z], [sx, 0, 0], 'dowel', panels[side]))
    strips[side] = board('strip' + side, f'{"Left" if sx < 0 else "Right"} interlock strip', [1.2, 72, 3], [sx * (PANEL_IN - 0.6), 53, STRIP_Z], W, parent=panels[side])
# steps 5-6: cabinet runners on the side frames
runners_side, screws_side = {}, {}
for side, sx, stamp in (('R', 1, 'CR'), ('L', -1, 'CL')):
    rx = sx * (PANEL_IN - 1.2 - 0.5)
    runners_side[side] = [board(f'runner{side}{j}', f'Cabinet runner IKEA {stamp}', [1.0, 2, 38], [rx, y, 0], ST, label='10085235', parent=panels[side])
                          for j, y in enumerate(RUN_Y)]
    screws_side[side] = [hw(f'screw5{side}{j}{k}', 'Screw', '107716', 'screw', 0.25, 1.6, [sx * (PANEL_IN - 1.2 - 1.0), y, z], [sx, 0, 0], ST, panels[side])
                         for j, y in enumerate(RUN_Y) for k, z in enumerate((-15, 16))]
# step 7: glides
s7 = [board(f'glide{k}', 'Floor glide', [4.2, 0.6, 4.2], [(-1 if k[0] == 'L' else 1) * LEG_X, 0.3, (1 if k[1] == '1' else -1) * LEG_Z], 'plastic', label='191064/5', parent=leg)
      for k, leg in legs.items()]

# rails (stud at +0.7 of the rail's height, dowel at -0.7; more on the 4-5 cm rails)
rails = {}
rails['topF'] = board('railTopF', 'Top front rail', [149, 4, 3], [0, TOP_Y, RAIL_Z], W)
rails['topB'] = board('railTopB', 'Top back rail', [149, 4, 3], [0, TOP_Y, -RAIL_Z], W)
rails['bot'] = board('railBot', 'Bottom front rail', [149, 5, 3], [0, BOT_Y, RAIL_Z], W)
for side, sx in (('L', -1), ('R', 1)):
    for j, y in enumerate(ROW_Y):
        rails[f'short{side}{j}'] = board(f'railShort{side}{j}', f'Short rail, {"left" if sx < 0 else "right"} {"lower" if j == 0 else "upper"}', [73, 3, 3], [sx * 38, y, RAIL_Z], W)
STUD_DY = {'topF': 0.9, 'topB': 0.9, 'bot': 1.2, 'short': 0.7}


def rail_ys(key):
    base = 'short' if key.startswith('short') else key
    y = next(p for p in parts if p['id'] == rails[key])['pos'][1]
    return y + STUD_DY[base], y - STUD_DY[base]


# step 8: 10 cam studs in the legs' inner faces (4 per front leg, 1 per back leg)
s8 = []
for side, sx in (('L', -1), ('R', 1)):
    front = [('topF', RAIL_Z), ('short%s1' % side, RAIL_Z), ('short%s0' % side, RAIL_Z), ('bot', RAIL_Z)]
    for j, (key, z) in enumerate(front):
        s8.append(stud118331(f'stud8{side}1{j}', [sx * LEG_IN, rail_ys(key)[0], z], [sx, 0, 0], legs[side + '1']))
    s8.append(stud118331(f'stud8{side}2', [sx * LEG_IN, rail_ys('topB')[0], -RAIL_Z], [sx, 0, 0], legs[side + '2']))

# step 9: 14 dowels in the rail ends
s9 = []
for key, rid in rails.items():
    rp = next(p for p in parts if p['id'] == rid)
    x0 = rp['pos'][0] - rp['size'][0] / 2
    x1 = rp['pos'][0] + rp['size'][0] / 2
    y = rail_ys(key)[1]
    z = rp['pos'][2]
    s9.append(dowel101350(f'dowel9{key}a', [x0, y, z], [1, 0, 0], rid))
    s9.append(dowel101350(f'dowel9{key}b', [x1, y, z], [-1, 0, 0], rid))


def rail_locks(prefix, side):
    sx = -1 if side == 'L' else 1
    out = []
    for key in ('topF', 'topB', 'bot', f'short{side}0', f'short{side}1'):
        z_face = -20.5 if key == 'topB' else 20.5
        d = [0, 0, -1] if key == 'topB' else [0, 0, 1]
        out.append(lock110630(f'{prefix}{key}', lockAt([sx * (LEG_IN - 2.0), rail_ys(key)[0], z_face], d), d))
    return out


# centre divider: front post is the root the others are laid against
divF = board('divFront', 'Centre divider, front post', [3, 75, 3], [0, 51.5, RAIL_Z], W, stageUp=[1, 0, 0])
divB = board('divBack', 'Centre divider, back post', [3, 75, 3], [0, 51.5, -RAIL_Z], W, parent=divF)
divS = board('divStrip', 'Centre divider, interlock strip', [1.5, 75, 3], [0, 51.5, STRIP_Z], W, parent=divF)
div_runners, div_screws = {}, {}
for stamp, sx in (('CL', 1), ('CR', -1)):
    div_runners[stamp] = [board(f'runnerDiv{stamp}{j}', f'Cabinet runner IKEA {stamp}', [1.0, 2, 44], [sx * 2.0, y, 0], ST, label='10085261', parent=divF)
                          for j, y in enumerate(RUN_Y)]
    div_screws[stamp] = [hw(f'screw14{stamp}{j}{k}', 'Screw', '108462', 'screw', 0.25, 1.6, [sx * 2.5, y, z], [-sx, 0, 0], ST, divF)
                         for j, y in enumerate(RUN_Y) for k, z in enumerate((-21.5, STRIP_Z, 21.5))]
s16 = [hw(f'stud16{"R" if sx > 0 else "L"}{j}', 'Cam stud', '603440', 'pin', 0.35, 3.4, [sx * 1.5, y + 0.7, RAIL_Z], [-sx, 0, 0], ST, divF)
       for sx in (1, -1) for j, y in enumerate(ROW_Y)]
d17 = dowel101350('dowel17', [0, 14, 21.4], [0, 1, 0], divF)
d18 = dowel101350('dowel18', [0, 89, 21.4], [0, -1, 0], divF)
b20 = [hw('bolt20top', 'Bolt', '100214', 'screw', 0.35, 7, [0, 93, 22.6], [0, -1, 0], ST),
       hw('bolt20back', 'Bolt', '100214', 'screw', 0.35, 7, [0, 93, -22.6], [0, -1, 0], ST),
       hw('bolt20bot', 'Bolt', '100214', 'screw', 0.35, 7, [0, 9, 22.9], [0, 1, 0], ST)]
l20 = [lock110630(f'lock20R{j}', lockAt([3.5, y + 0.7, 20.5], [0, 0, 1]), [0, 0, 1]) for j, y in enumerate(ROW_Y)]
l22 = [lock110630(f'lock22L{j}', lockAt([-3.5, y + 0.7, 20.5], [0, 0, 1]), [0, 0, 1]) for j, y in enumerate(ROW_Y)]
l13 = rail_locks('lock13', 'R')
l24 = rail_locks('lock24', 'L')
foot = hw('foot', 'Adjustable foot', '107862', 'knob', 1.3, 2.4, [0, 9 - 1.2, 21.3], [0, 1, 0], 'plastic')

# top-row dividers
tdiv, td_runners, td_screws, td_dowels = {}, {}, {}, {}
for side, sx in (('L', -1), ('R', 1)):
    x = sx * 38
    tdiv[side] = board(f'topDiv{side}', f'Top-row divider, {"left" if sx < 0 else "right"}', [1.6, 22, 43.9], [x, 82, 1.45], W, stageUp=[-1, 0, 0])
    td_runners[side] = {
        'CR': board(f'runnerTop{side}CR', 'Cabinet runner IKEA CR', [1.0, 2, 41], [x - 1.3, RUN_Y[2], 0], ST, parent=tdiv[side]),
        'CL': board(f'runnerTop{side}CL', 'Cabinet runner IKEA CL', [1.0, 2, 41], [x + 1.3, RUN_Y[2], 0], ST, parent=tdiv[side]),
    }
    td_screws[side] = {
        'CR': [hw(f'screw27{side}{k}', 'Screw', '108462', 'screw', 0.25, 1.6, [x - 1.8, RUN_Y[2], z], [1, 0, 0], ST, tdiv[side]) for k, z in enumerate((-16, 16))],
        'CL': [hw(f'screw28{side}{k}', 'Screw', '108462', 'screw', 0.25, 1.6, [x + 1.8, RUN_Y[2], z], [-1, 0, 0], ST, tdiv[side]) for k, z in enumerate((-16, 16))],
    }
    td_dowels[side] = dowel101350(f'dowel29{side}', [x, 93, -14], [0, -1, 0], tdiv[side])
s30a = [hw(f'screw30{side}', 'Screw', '100232', 'screw', 0.35, 6, [sx * 38, 93, 21.0], [0, -1, 0], 'plastic') for side, sx in (('L', -1), ('R', 1))]
s30b = [hw(f'bolt30{side}', 'Bolt', '100214', 'screw', 0.35, 6, [sx * 38, 68, 21.0], [0, 1, 0], ST) for side, sx in (('L', -1), ('R', 1))]

# top
top = board('top', 'Top', [160, 3, 50], [0, 94.5, 1], W, stageUp=[0, -1, 0])
brackets = [board(f'bracket{side}', 'Wall bracket', [4, 0.4, 2.2], [sx * 70, 92.8, -24.4], ST, label='106989', parent=top) for side, sx in (('L', -1), ('R', 1))]
washers = [hw(f'washer{side}', 'Washer', '100823', 'pin', 0.6, 0.12, [sx * 70, 92.54, -23.8], [0, 1, 0], ST, top) for side, sx in (('L', -1), ('R', 1))]
bscrews = [hw(f'screw31{side}', 'Screw', '109049', 'screw', 0.25, 1.6, [sx * 70, 92.48, -23.8], [0, 1, 0], ST, top) for side, sx in (('L', -1), ('R', 1))]
stud_top_pos = [[x, 93, -21.2] for x in (-63, -42, -21, 0, 21, 42, 63)] + [[sx * LEG_X, 93, z] for sx in (-1, 1) for z in (-10, 10)]
s32 = [stud118331(f'stud32_{k}', pos, [0, 1, 0], top) for k, pos in enumerate(stud_top_pos)]
s33 = [dowel101350(f'dowel33{k}', [(-1 if k[0] == 'L' else 1) * LEG_X, 93, (1 if k[1] == '1' else -1) * LEG_Z], [0, -1, 0]) for k in legs]
s33 += [dowel101350(f'dowel33{side}P', [sx * LEG_X, 93, 0], [0, -1, 0]) for side, sx in (('L', -1), ('R', 1))]
b35 = [hw(f'bolt35_{k}', 'Bolt', '100214', 'screw', 0.35, 6, [x, 89, RAIL_Z], [0, 1, 0], ST) for k, x in enumerate((-57, -19, 19, 57))]
l36 = []
for k, (x, y, z) in enumerate(stud_top_pos):
    if abs(x) > 70:
        sx = -1 if x < 0 else 1
        l36.append(lock110630(f'lock36_{k}', lockAt([sx * PANEL_IN, 91.6, z], [sx, 0, 0]), [sx, 0, 0]))
    else:
        l36.append(lock110630(f'lock36_{k}', lockAt([x, 91.6, -20.5], [0, 0, -1]), [0, 0, -1]))

# back panels and nails
BACK_Z = -23.65
backLo = board('backLower', 'Back panel, lower', [157, 41.75, 0.3], [0, 9 + 41.75 / 2, BACK_Z], HB)
backUp = board('backUpper', 'Back panel, upper', [157, 41.75, 0.3], [0, 9 + 41.75 * 1.5, BACK_Z], HB)


def nail(id, x, y):
    return hw(id, 'Nail', '101221', 'nail', 0.1, 2, [x, y, -23.8], [0, 0, 1], ST)


n39 = nail('nail39', -77, 91)
n40 = nail('nail40', 77, 91)
n41 = nail('nail41', -77, 11)
n42 = [nail(f'nail42top{k}', x, 91) for k, x in enumerate((-58, -39, -20, 20, 39, 58))]
n42 += [nail(f'nail42{side}{k}', sx * 77, y) for side, sx in (('L', -1), ('R', 1)) for k, y in enumerate((21, 33, 45, 57, 69, 81))]
n42 += [nail(f'nail42post{k}', 0, y) for k, y in enumerate((16, 26, 36, 46, 56, 66, 76, 85))]
n42 += [nail('nail42corner', 77, 11)]
assert len(n42) == 27

# ---------------- drawers ----------------
# key: (front x centre, front y centre, width, height, size name, position words)
DRAWERS = {
    'S1': (-56.65, 80, 35.3, 17.6, 'small', 'top row, far left'),
    'S2': (-19.35, 80, 35.3, 17.6, 'small', 'top row, left of centre'),
    'S3': (19.35, 80, 35.3, 17.6, 'small', 'top row, right of centre'),
    'S4': (56.65, 80, 35.3, 17.6, 'small', 'top row, far right'),
    'M1': (-38, 57, 72.6, 21.6, 'middle', 'middle row, left'),
    'M2': (38, 57, 72.6, 21.6, 'middle', 'middle row, right'),
    'G1': (-38, 28.5, 72.6, 28.6, 'bottom', 'bottom row, left'),
    'G2': (38, 28.5, 72.6, 28.6, 'bottom', 'bottom row, right'),
}
D = {}
for key, (xc, yc, w, h, size, where) in DRAWERS.items():
    d = {}
    b = yc - h / 2 - 0.2          # floor of the opening
    hw_ = w / 2 - 1.1             # half width of the drawer box, outside
    side_h = h - 4
    side_y = b + 2.6 + side_h / 2
    side_top = b + 2.6 + side_h
    d['front'] = board(f'front{key}', f'Drawer front, {where}', [w, h, 2], [xc, yc, 22.5], W, stageUp=[0, 0, -1])
    d['sides'] = []
    for sname, sx in (('L', -1), ('R', 1)):
        d['sides'].append(board(f'side{key}{sname}', f'{size.capitalize()} drawer side', [1.5, side_h, 38], [xc + sx * (hw_ - 0.75), side_y, 2.5], IN,
                                parent=d['front'], stageUp=[-sx, 0, 0]))
    stud_ys = (b + 5.5, side_top - 2.5)
    dowel_ys = (b + 2.6 + side_h * 0.38, b + 2.6 + side_h * 0.62)
    d['studs'] = [hw(f'stud{key}{sname}{j}', 'Cam stud', '123492', 'pin', 0.35, 3, [xc + sx * (hw_ - 0.75), y, 21.5], [0, 0, 1], ST, d['front'])
                  for sname, sx in (('L', -1), ('R', 1)) for j, y in enumerate(stud_ys)]
    d['dowels'] = [hw(f'dowel{key}{sname}{j}', 'Dowel', '101345', 'dowel', 0.4, 3, [xc + sx * (hw_ - 0.75), y, 21.5], [0, 0, -1], 'dowel', d['sides'][n])
                   for n, (sname, sx) in enumerate((('L', -1), ('R', 1))) for j, y in enumerate(dowel_ys)]
    d['locks'] = [lock110630(f'lock{key}{sname}{j}', [xc + sx * (hw_ - 0.4), y, 20.0], [-sx, 0, 0], d['sides'][n])
                  for n, (sname, sx) in enumerate((('L', -1), ('R', 1))) for j, y in enumerate(stud_ys)]
    d['bottom'] = board(f'bottom{key}', f'{size.capitalize()} drawer bottom', [w - 4.2, 0.3, 37.5], [xc, b + 3.6, 2.25], HB, parent=d['front'])
    d['back'] = board(f'back{key}', f'{size.capitalize()} drawer back', [w - 5.2, h - 5.5, 1.5], [xc, b + 1.35 + h / 2, -15.75], IN, parent=d['front'])
    back_lo, back_hi = b + 4.1, side_top
    sy = [back_lo + 2.5, back_hi - 2.5] if size != 'bottom' else [back_lo + 2.5, (back_lo + back_hi) / 2, back_hi - 2.5]
    d['screws'] = [hw(f'screw{key}{sname}{j}', 'Screw', '110519', 'screw', 0.3, 3, [xc + sx * hw_, y, -15.75], [-sx, 0, 0], ST, d['sides'][n])
                   for n, (sname, sx) in enumerate((('L', -1), ('R', 1))) for j, y in enumerate(sy)]
    d['runners'] = [board(f'drunner{key}{sname}', 'Drawer runner', [0.6, 1.5, 37], [xc + sx * (hw_ + 0.3), b + 3.35, 2.0], ST, label='10085261', parent=d['sides'][n])
                    for n, (sname, sx) in enumerate((('L', -1), ('R', 1)))]
    d['rscrews'] = [hw(f'rscrew{key}{sname}{j}', 'Screw', '10080579', 'screw', 0.25, 1.2, [xc + sx * (hw_ + 0.6), b + 3.35, z], [-sx, 0, 0], ST, d['sides'][n])
                    for n, (sname, sx) in enumerate((('L', -1), ('R', 1))) for j, z in enumerate((14, -10))]
    kx = [xc] if size == 'small' else [xc - w / 4, xc + w / 4]
    d['knobs'] = [hw(f'knob{key}{j}', 'Knob', '117615', 'knob', 1.6, 2.6, [x, yc, 23.5 + 1.3], [0, 0, -1], W, d['front']) for j, x in enumerate(kx)]
    d['kscrews'] = [hw(f'kscrew{key}{j}', 'Screw', '119976', 'screw', 0.25, 3, [x, yc, 21.5], [0, 0, 1], ST, d['front']) for j, x in enumerate(kx)]
    if size != 'small':
        d['bar'] = board(f'bar{key}', 'Support bar', [2.5, 1, 36], [xc, b + 2.95, 2.5], ST, label='10054466', parent=d['front'])
        d['bscrews'] = [hw(f'bscrew{key}{j}', 'Screw', '105344', 'screw', 0.25, 1.2, [xc, b + 2.45, z], [0, 1, 0], ST, d['front']) for j, z in enumerate((19.5, -14.5))]
    D[key] = d

SMALL = ['S1', 'S2', 'S3', 'S4']
BIG = ['M1', 'M2', 'G1', 'G2']


def every(keys, field):
    out = []
    for k in keys:
        v = D[k][field]
        out.extend(v if isinstance(v, list) else [v])
    return out


# ---------------- steps ----------------
step('Screw cam studs into the legs',
     'Lay the four legs L1, L2, R1 and R2 on a soft surface. Screw a cam stud 118331 into each of the three holes on the face shown, by hand or with a screwdriver. Stop when the plain shank stands clear of the wood.',
     'Screwdriver', s1, manual=1, spin=3, slide=3)
step('Push dowels into the legs',
     'Push two short dowels 101350 into each leg, beside the cam studs. Use the short dowels here, not the long 101353.',
     'Hands', s2, manual=2, slide=3)
legL1, legL2, legR1, legR2 = legs['L1'], legs['L2'], legs['R1'], legs['R2']
step('Fit the legs to the side panels',
     'Lay both side panels flat, inner side up. Push legs L1 and L2 onto the edges of one panel and R1 and R2 onto the other, studs and dowels into the holes.',
     'Hands', [legL1, legL2, legR1, legR2], manual=2, local=True,
     approach={legL1: [0, 0, 10], legL2: [0, 0, -10], legR1: [0, 0, 10], legR2: [0, 0, -10]})
step('Lock the legs with cam locks',
     'Drop a cam lock 110630 into each of the 12 round holes on the panels and turn it clockwise until it grips the stud.',
     'Screwdriver', s3, manual=3, spin=0.5, slide=2)
step('Push the long dowels into the panels',
     'Push three long dowels 101353 into the holes down the middle of each panel.',
     'Hands', s4a, manual=4, slide=3)
step('Press on the interlock strips',
     'Press an interlock strip onto the dowels on each panel, with its catches lined up as the manual shows. The strips stop more than one drawer opening at once.',
     'Hands', [strips['L'], strips['R']], manual=4, local=True,
     approach={strips['L']: [8, 0, 0], strips['R']: [-8, 0, 0]})
step('Lay the CR runners on the right frame',
     'Lay three cabinet runners stamped IKEA CR (10085235) across the frame with legs R1 and R2, wheels at the front.',
     'Hands', runners_side['R'], manual=5, local=True, from_=[-10, 0, 0])
step('Screw down the CR runners',
     'Fix each runner with two screws 107716. Take care not to mix them up with 108462 or 10080579, which look similar.',
     'Screwdriver', screws_side['R'], manual=5, spin=3, slide=2)
step('Lay the CL runners on the left frame',
     'Lay three runners stamped IKEA CL (10085235) across the frame with legs L1 and L2.',
     'Hands', runners_side['L'], manual=6, local=True, from_=[10, 0, 0])
step('Screw down the CL runners',
     'Fix each runner with two screws 107716.',
     'Screwdriver', screws_side['L'], manual=6, spin=3, slide=2)
step('Push glides into the legs',
     'Press a glide 191064/191065 into the bottom end of each leg.',
     'Hands', s7, manual=7, local=True, from_=[0, -4, 0])
step('Screw more cam studs into the legs',
     'Screw ten cam studs 118331 into the inner faces of the legs: four in each front leg (L1, R1) and one near the top of each back leg (L2, R2). These hold the rails.',
     'Screwdriver', s8, manual=8, spin=3, slide=3)
step('Push dowels into the rails',
     'Set out the seven rails and push a short dowel 101350 into the hole at each end.',
     'Hands', s9, manual=9, slide=3)
step('Lay out the right side frame',
     'The dresser is built lying on its right side. Lay the frame with legs R1 and R2 flat where you’ll work, runners facing up and the legs’ glide ends to your left.',
     'Hands', [panelR], manual=10)
step('Stand the short rails in the right frame',
     'Push the two short rails onto the studs in leg R1, dowels into the holes.',
     'Hands', [rails['shortR0'], rails['shortR1']], manual=10)
step('Fit the top front and top back rails',
     'Push the two long top rails onto the studs at the top ends of legs R1 and R2. Check the marks shown in the manual so each rail faces the right way.',
     'Hands', [rails['topF'], rails['topB']], manual=11)
step('Fit the bottom front rail',
     'Push the bottom front rail onto the stud near the bottom of leg R1.',
     'Hands', [rails['bot']], manual=12)
step('Lock the rails to the right frame',
     'Turn a cam lock 110630 clockwise in each of the five rails, close to the right frame.',
     'Screwdriver', l13, manual=13, spin=0.5, slide=2)
step('Lay out the centre divider',
     'Lay the three pieces of the centre divider side by side: the front post, the interlock strip and the back post, the way the manual shows.',
     'Hands', [divB, divS], manual=14)
step('Lay the CL runners across the divider',
     'Lay three runners stamped IKEA CL (10085261) across all three pieces.',
     'Hands', div_runners['CL'], manual=14, local=True, from_=[10, 0, 0])
step('Screw down the CL runners',
     'Fix each runner to all three pieces with three screws 108462, nine in all.',
     'Screwdriver', div_screws['CL'], manual=14, spin=3, slide=2)
turn('Turn the divider over', 'Turn the divider over so the bare side faces up.', [divF], manual=15, pose='over')
step('Lay the CR runners across the divider',
     'Lay three runners stamped IKEA CR (10085261) across this side.',
     'Hands', div_runners['CR'], manual=15, local=True, from_=[-10, 0, 0])
step('Screw down the CR runners',
     'Fix them with nine more screws 108462.',
     'Screwdriver', div_screws['CR'], manual=15, spin=3, slide=2)
turn('Stand the divider on its edge', 'Stand the divider on its back edge, front post on top.', [divF], manual=16, up=[0, 0, 1])
step('Screw in the double cam studs',
     'Screw four cam studs 603440 into the holes on both faces of the front post.',
     'Screwdriver', s16, manual=16, spin=3, slide=3)
step('Push a dowel into the front post',
     'Push a short dowel 101350 into the hole in the bottom end of the front post.',
     'Hands', [d17], manual=17, slide=3)
step('Push a dowel into the other end',
     'Push another short dowel 101350 into the top end of the front post.',
     'Hands', [d18], manual=18, slide=3)
step('Lower the divider into place',
     'Lower the divider onto the short rails, the studs going into the rail ends and the dowels into the long rails.',
     'Hands', [divF], manual=19, from_=[0, 30, 0])
step('Bolt the divider to the rails',
     'With the Allen key 100001, drive three bolts 100214 through the long rails into the ends of the divider. Not the black 100232.',
     'Wrench', b20, manual=20, spin=4, slide=4)
step('Lock the short rails to the divider',
     'Turn a cam lock 110630 in each short rail, next to the divider.',
     'Screwdriver', l20, manual=20, spin=0.5, slide=2)
step('Fit the left short rails',
     'Push the other two short rails onto the studs on the top face of the divider.',
     'Hands', [rails['shortL0'], rails['shortL1']], manual=21)
step('Lock the left short rails',
     'Turn a cam lock 110630 in each of these rails, next to the divider.',
     'Screwdriver', l22, manual=22, spin=0.5, slide=2)
step('Lower the left side frame on top',
     'Turn the frame with legs L1 and L2 over and lower it onto the ends of the rails.',
     'Hands', [panelL], manual=23, from_=[0, 35, 0])
step('Lock the rails to the left frame',
     'Turn a cam lock 110630 in each of the five rails, close to the left frame.',
     'Screwdriver', l24, manual=24, spin=0.5, slide=2)
step('Screw in the middle foot',
     'Screw the adjustable foot 107862 into the hole under the middle of the bottom front rail.',
     'Hands', [foot], manual=25, spin=3, slide=3)
flip('Stand the dresser up', 'Tip the frame up onto its legs. It’s big: get someone to help.', 'z', 90, manual=26)
step('Fit CR runners to the top-row dividers',
     'Lay the two small dividers flat and place a runner stamped IKEA CR on each.',
     'Hands', [td_runners['L']['CR'], td_runners['R']['CR']], manual=27, local=True, from_=[-10, 0, 0])
step('Screw down the CR runners',
     'Fix each with two screws 108462.',
     'Screwdriver', td_screws['L']['CR'] + td_screws['R']['CR'], manual=27, spin=3, slide=2)
turn('Turn the dividers over', 'Turn both dividers over.', [tdiv['L'], tdiv['R']], manual=28, pose='over')
step('Fit CL runners to the top-row dividers',
     'Place a runner stamped IKEA CL on the other side of each.',
     'Hands', [td_runners['L']['CL'], td_runners['R']['CL']], manual=28, local=True, from_=[10, 0, 0])
step('Screw down the CL runners',
     'Fix each with two screws 108462.',
     'Screwdriver', td_screws['L']['CL'] + td_screws['R']['CL'], manual=28, spin=3, slide=2)
turn('Stand the dividers up', 'Stand both dividers on their bottom edge.', [tdiv['L'], tdiv['R']], manual=29, pose='upright')
step('Push a dowel into each divider',
     'Push a short dowel 101350 into the hole in the top edge of each divider.',
     'Hands', [td_dowels['L'], td_dowels['R']], manual=29, slide=3)
step('Set the dividers in the top row',
     'Stand the dividers in the top row of the frame, one each side of the centre divider, on the middle of the upper short rails.',
     'Hands', [tdiv['L'], tdiv['R']], manual=30, from_=[0, 30, 0])
step('Screw the dividers in from above',
     'With the Allen key 100006, drive a black screw 100232 down through the top front rail into each divider.',
     'Wrench', s30a, manual=30, spin=4, slide=4)
step('Bolt the dividers from below',
     'With the Allen key 100001, drive a bolt 100214 up through the short rail into the bottom of each divider.',
     'Wrench', s30b, manual=30, spin=4, slide=4)
step('Fit the wall brackets to the top',
     'Lay the top upside down on a soft surface. Place a wall bracket 106989 at each back corner, as shown.',
     'Hands', brackets, manual=31)
step('Screw down the brackets',
     'Fix each bracket with a screw 109049 and washer 100823.',
     'Screwdriver', washers + bscrews, manual=31, spin=2, slide=2)
step('Screw cam studs into the top',
     'Screw 11 cam studs 118331 into the underside of the top, along the back and at the ends.',
     'Screwdriver', s32, manual=32, spin=3, slide=3)
step('Push dowels into the legs and sides',
     'Push a short dowel 101350 into the top of each leg and into the top edge of each side panel: six in all.',
     'Hands', s33, manual=33, slide=3)
step('Lower the top into place',
     'Turn the top right way up and lower it onto the frame, the studs and dowels into their holes.',
     'Hands', [top], manual=34, from_=[0, 30, 0])
step('Bolt the top from below',
     'With the Allen key 100001, drive four bolts 100214 up through the top front rail into the top.',
     'Wrench', b35, manual=35, spin=4, slide=4)
step('Lock the top',
     'Turn the 11 cam locks 110630 under the top, along the back rail and inside the side panels.',
     'Screwdriver', l36, manual=36, spin=0.5, slide=2)
flip('Lay the dresser on its front', 'With a helper, lay the dresser face down on a soft surface such as the flattened box.', 'x', 90, manual=37)
step('Lay the back panels on',
     'Lay the two hardboard back panels on the back, edges lined up with the frame, as shown.',
     'Hands', [backLo, backUp], manual=37, from_=[0, 15, 0])
step('Mark the middle post, then nail a corner',
     'Draw a pencil line across the panels over the middle of the centre divider’s back post, so the nails find it later. Then hammer one nail 101221 into a top corner.',
     'Hammer', [n39], manual='38–39', slide=2)
step('Nail the opposite corner',
     'Check the frame is square, then nail the other top corner.',
     'Hammer', [n40], manual=40, slide=2)
step('Nail a bottom corner',
     'Hammer a nail into a bottom corner.',
     'Hammer', [n41], manual=41, slide=2)
step('Nail the back all round',
     'Hammer in the other 27 nails around the edges and down your pencil line.',
     'Hammer', n42, manual=42, slide=2)
flip('Stand the dresser up', 'Stand the dresser back up on its legs.', 'x', -90, manual=42)
step('Screw cam studs into the small drawer fronts',
     'The four small drawers are built the same way. Lay each front face down and screw in four cam studs 123492.',
     'Screwdriver', every(SMALL, 'studs'), manual=47, spin=3, slide=3)
step('Push dowels into the small drawer sides',
     'Push two dowels 101345 into the front end of each of the eight sides.',
     'Hands', every(SMALL, 'dowels'), manual=48, slide=3)
step('Fit the sides of the first small drawer',
     'Start with the sides that carry the warning sticker; that drawer goes top left. Push both sides onto one front, sticker facing in.',
     'Hands', D['S1']['sides'], manual=49)
step('Fit the sides of the other three',
     'Push two sides onto each of the other three fronts.',
     'Hands', every(['S2', 'S3', 'S4'], 'sides'), manual=49)
step('Lock the sides',
     'Turn four cam locks 110630 clockwise in each drawer, two per side.',
     'Screwdriver', every(SMALL, 'locks'), manual=50, spin=0.5, slide=2)
step('Slide in the bottoms',
     'Slide a hardboard bottom down into the grooves of each drawer.',
     'Hands', every(SMALL, 'bottom'), manual=51, local=True, from_=[0, 0, -40])
step('Fit the drawer backs',
     'Set a back on the open end of each drawer, between the sides.',
     'Hands', every(SMALL, 'back'), manual=52, local=True, from_=[0, 0, -20])
step('Hammer in the back screws',
     'Tap four screws 110519 through the sides into each back.',
     'Hammer', every(SMALL, 'screws'), manual=52, slide=3)
turn('Turn the drawers upside down', 'Turn all four small drawers upside down.', [D[k]['front'] for k in SMALL], manual=53, pose='upsideDown')
step('Clip on the drawer runners',
     'Hook a drawer runner 10085261 onto the bottom edge of each side, at the front.',
     'Hands', every(SMALL, 'runners'), manual=53, local=True, from_=[0, -12, 0])
step('Screw the runners on',
     'Fix each runner with two screws 10080579.',
     'Screwdriver', every(SMALL, 'rscrews'), manual=53, spin=3, slide=2)
turn('Turn the drawers right way up', 'Turn the drawers back over.', [D[k]['front'] for k in SMALL], manual=54, pose='upright')
step('Fit the knobs',
     'Hold a knob 117615 on each front and screw it on from inside with a screw 119976.',
     'Screwdriver', every(SMALL, 'knobs') + every(SMALL, 'kscrews'), manual=54, spin=2, slide=4)
step('Screw cam studs into the big drawer fronts',
     'The two middle and two bottom drawers are built the same way. Lay each front face down and screw in four cam studs 123492.',
     'Screwdriver', every(BIG, 'studs'), manual=55, spin=3, slide=3)
step('Push dowels into the big drawer sides',
     'Push two dowels 101345 into the front end of each side.',
     'Hands', every(BIG, 'dowels'), manual=56, slide=3)
step('Fit the sides',
     'Push two sides onto each front. The middle drawers take the lower sides.',
     'Hands', every(BIG, 'sides'), manual=57)
step('Lock the sides',
     'Turn four cam locks 110630 in each drawer, two per side.',
     'Screwdriver', every(BIG, 'locks'), manual=58, spin=0.5, slide=2)
step('Slide in the bottoms',
     'Slide a hardboard bottom into the grooves of each drawer.',
     'Hands', every(BIG, 'bottom'), manual=59, local=True, from_=[0, 0, -40])
step('Fit the drawer backs',
     'Set a back on each drawer, between the sides.',
     'Hands', every(BIG, 'back'), manual=60, local=True, from_=[0, 0, -20])
step('Hammer in the back screws',
     'Tap screws 110519 through the sides into each back: four in each middle drawer, six in each bottom drawer.',
     'Hammer', every(BIG, 'screws'), manual=60, slide=3)
step('Fit the support bars',
     'Slide each bottom partly out. Lay a support bar 10054466 along the middle of the bottom and screw its front end on with a screw 105344.',
     'Screwdriver', [D[k]['bar'] for k in BIG] + [D[k]['bscrews'][0] for k in BIG], manual=61, local=True, spin=2, slide=2,
     approach={D[k]['bar']: [0, -12, 0] for k in BIG})
step('Screw down the other end',
     'Swing each bar against the back, screw it on with another screw 105344, and push the bottom back in.',
     'Screwdriver', [D[k]['bscrews'][1] for k in BIG], manual=62, spin=2, slide=2)
turn('Turn the drawers upside down', 'Turn the four big drawers upside down.', [D[k]['front'] for k in BIG], manual=63, pose='upsideDown')
step('Clip on the drawer runners',
     'Hook a drawer runner 10085261 onto the bottom edge of each side, at the front.',
     'Hands', every(BIG, 'runners'), manual=63, local=True, from_=[0, -12, 0])
step('Screw the runners on',
     'Fix each runner with two screws 10080579.',
     'Screwdriver', every(BIG, 'rscrews'), manual=63, spin=3, slide=2)
turn('Turn the drawers right way up', 'Turn the drawers back over.', [D[k]['front'] for k in BIG], manual=64, pose='upright')
step('Fit the knobs',
     'Fit two knobs 117615 to each front, each with a screw 119976 from inside.',
     'Screwdriver', every(BIG, 'knobs') + every(BIG, 'kscrews'), manual=64, spin=2, slide=4)
IN_FROM = [0, 0, 45]
step('Slide in the first small drawer',
     'Flip up the interlock latch in the top-left opening, then slide in the drawer with the warning sticker. Once the drawers are in, only one opens at a time.',
     'Hands', [D['S1']['front']], manual='65–66', from_=IN_FROM)
step('Slide in the next small drawer',
     'Flip up the latch on the centre divider, then slide a small drawer into the opening beside the first.',
     'Hands', [D['S2']['front']], manual='67–68', from_=IN_FROM)
step('Slide in a middle drawer',
     'Flip up the two latches beside the left middle opening, then slide in a middle drawer.',
     'Hands', [D['M1']['front']], manual='69–70', from_=IN_FROM)
step('Slide in a bottom drawer',
     'Flip up the two latches beside the bottom-left opening, then slide in a bottom drawer.',
     'Hands', [D['G1']['front']], manual='71–72', from_=IN_FROM)
step('Slide in the right-hand small drawers',
     'Flip up the latches on the right-hand side, then slide in the last two small drawers.',
     'Hands', [D['S3']['front'], D['S4']['front']], manual='73–74', from_=IN_FROM)
step('Slide in the right-hand middle drawer',
     'Slide the last middle drawer into its opening.',
     'Hands', [D['M2']['front']], manual=74, from_=IN_FROM)
step('Slide in the last drawer',
     'Slide in the last bottom drawer. Before you use the dresser, fix it to the wall with the brackets on the top, as manual steps 43–46 show: it can tip over if it isn’t.',
     'Hands', [D['G2']['front']], manual=74, from_=IN_FROM)

# `from` is a Python keyword: steps were written with from_.
for s in steps:
    if 'from_' in s:
        s['from'] = s.pop('from_')

product = {
    'name': '8-drawer dresser',
    'spec': 'About 160 × 96 × 50 cm · 8 drawers · built from a 52-page paper manual · sizes estimated',
    'source': {
        'label': 'IKEA HEMNES 8-drawer dresser manual (AA-2406539-5)',
        'url': 'https://www.ikea.com/us/en/assembly_instructions/hemnes-8-drawer-dresser-white-stain__AA-2406539-5-100.pdf',
    },
    'startPose': {'axis': 'z', 'angle': -90},
    'parts': parts,
    'steps': steps,
    'notes': [
        'Sizes are estimated from the drawings; part counts, part numbers and step order follow the manual.',
        'Steps 43–46 (fixing the dresser to the wall) are left out of the animation; the last step says to do them.',
        'The interlock latches (steps 65, 67, 69, 71, 73) are folded into the drawer steps that follow them.',
        'The top-row divider runners carry no part number in the manual, so they are labelled by their IKEA CR / CL stamps only.',
        'Where a cam stud, bolt or lock sits inside a joint is estimated; the manual shows only roughly where.',
    ],
}
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'guide', 'products', 'hemnes.json')
with open(out, 'w') as f:
    json.dump(product, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print(f'{len(parts)} parts, {len(steps)} steps -> {out}')
