// Shorthand for repeated parts, so a manual with 100 screws doesn't need 100 near-identical
// entries. A part may list "copies" instead of one "pos":
//
//   {"id": "dowel", "name": "Dowel", "label": "101350", "shape": "dowel", "radius": 0.4, "length": 3,
//    "dir": [0, 1, 0], "material": "dowel", "copies": [[-17, 43.8, -5], [-17, 43.8, 5], {"pos": [17, 43.8, -5], "parent": "sideR"}]}
//
// Each copy is a position, or an object with "pos" and any fields that differ for that copy.
// The copies become parts "dowel-1", "dowel-2", ... in order. Anywhere a step names "dowel" (its
// parts, approach keys or turn list), that means every copy. The result is an ordinary product
// file, so the player never sees the shorthand.

export function expandCopies(product) {
  if (!Array.isArray(product?.parts)) return product;
  const groups = new Map(); // group id -> ids of its copies
  const parts = [];
  for (const p of product.parts) {
    if (!Array.isArray(p.copies)) {
      parts.push(p);
      continue;
    }
    const { copies, ...base } = p;
    const ids = copies.map((c, k) => {
      const own = Array.isArray(c) ? { pos: c } : c;
      const id = `${p.id}-${k + 1}`;
      parts.push({ ...base, ...own, id });
      return id;
    });
    groups.set(p.id, ids);
  }
  if (!groups.size) return product;

  const expand = (list) => (Array.isArray(list) ? list.flatMap((id) => groups.get(id) || [id]) : list);
  const steps = (product.steps || []).map((s) => {
    const out = { ...s, parts: expand(s.parts) };
    if (s.turn) out.turn = expand(s.turn);
    if (s.approach && typeof s.approach === 'object') {
      out.approach = Object.fromEntries(Object.entries(s.approach).flatMap(([id, v]) => (groups.get(id) || [id]).map((cid) => [cid, v])));
    }
    return out;
  });
  // A part fitted to a group would be ambiguous, so parents always name one copy (or a single part).
  return { ...product, parts, steps };
}
