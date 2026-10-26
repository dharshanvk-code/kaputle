// What each part is, how it comes off, and where it rests on the bench.
// `pull` is how far the part slides along its parent's axis to come free.
// `spin` is how many turns it unscrews while doing so.
// Bench poses: 'upright' stands the part on its base, 'lying' lays it parallel to the flashlight.

export const PARTS = {
  tailcap: {
    name: 'Tail cap',
    removable: true,
    pull: -3.2, spin: 2.5,
    bench: { pos: [-14.2, 0, 8.4], pose: 'upright' },
    blurb: 'Screws onto the back of the tube and seals it. The spring inside pushes the batteries forward so every contact presses tight.',
    notice: ['Grip grooves for unscrewing it', 'The spring sitting inside', 'A metal plate where the spring makes contact'],
  },
  spring: {
    name: 'Spring',
    blurb: 'Keeps the batteries pressed against each other and the bulb. Electricity flows through it, so it is part of the circuit.',
    notice: ['Coils packed tighter at each end so it sits flat', 'Bare steel, so current can pass through'],
  },
  battery2: {
    name: 'Battery 2',
    removable: true,
    pull: -10.1, spin: 0,
    bench: { pos: [-7.4, 1.22, 7.0], pose: 'lying' },
    blurb: 'The back cell. A battery stores chemical energy and releases it as electricity, 1.5 volts per cell.',
    notice: ['The + bump on one end and the flat − end', 'Two cells end to end add up: 1.5 V + 1.5 V = 3 V', 'Its + end presses on the flat − end of Battery 1'],
  },
  battery1: {
    name: 'Battery 1',
    removable: true,
    pull: -16.95, spin: 0,
    bench: { pos: [-7.4, 1.22, 10.2], pose: 'lying' },
    blurb: 'The front cell. Its + bump presses against the contact on the bottom of the bulb.',
    notice: ['The + bump that touches the bulb', '"1.5 V" printed on the wrapper', 'Steel ends: the only parts that carry current'],
  },
  body: {
    name: 'Body tube',
    blurb: 'The aluminium tube that holds everything together. In many flashlights the metal tube also carries current back to the switch.',
    notice: ['Diamond knurling so it doesn’t slip in wet hands', 'Threads and rubber O-rings at both ends'],
  },
  switch: {
    name: 'Switch',
    blurb: 'Opens and closes the circuit. When it is off there is a tiny gap, so no electricity can flow.',
    notice: ['Rubber boot that keeps dust and water out', 'Chrome collar holding the boot in place'],
  },
  bulb: {
    name: 'Bulb',
    removable: true,
    pull: 2.6, spin: 1.5,
    bench: { pos: [-2.6, 0.06, 8.2], pose: 'upright' },
    blurb: 'An incandescent bulb. Electricity heats a coil of tungsten wire, the filament, until it glows white-hot.',
    notice: ['The tiny coiled filament inside the glass', 'Two support wires that carry current to it', 'Brass screw base with a contact on the bottom'],
  },
  head: {
    name: 'Head',
    removable: true,
    pull: 3.1, spin: 2.5,
    bench: { pos: [2.8, 0, 8.4], pose: 'upright' },
    blurb: 'Holds the reflector, a curved mirror that gathers light from the bulb and throws it forward as a beam.',
    notice: ['Mirror-polished reflector shaped like a bowl (a parabola)', 'Chrome bezel ring that clamps the lens', 'The hole in the middle where the bulb pokes through'],
  },
  lens: {
    name: 'Lens',
    removable: true,
    pull: 2.2, spin: 0,
    bench: { pos: [8.8, 0.06, 8.4], pose: 'upright' },
    blurb: 'Clear glass that protects the bulb and reflector while letting light straight through.',
    notice: ['Flat, clear glass', 'It sits behind the bezel ring at the front'],
  },
};

// Back to front, the order a person would meet them.
export const LIST_ORDER = ['tailcap', 'spring', 'battery2', 'battery1', 'body', 'switch', 'bulb', 'head', 'lens'];
export const TAKE_APART_ORDER = ['tailcap', 'battery2', 'battery1', 'head', 'bulb', 'lens'];
export const MOVABLE = TAKE_APART_ORDER;
