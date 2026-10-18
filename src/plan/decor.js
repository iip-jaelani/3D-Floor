export const DECOR_LISTS = { curtain: 'curtains', rod: 'rods', rug: 'rugs' };
export const DECOR_LABELS = { curtain: 'Gorden', rug: 'Karpet' };

const LIST_TYPES = Object.entries(DECOR_LISTS);

export function normalizeDecor(decor) {
  const { curtains = [], rods = [], rugs = [] } = decor;
  decor.curtains = curtains;
  decor.rods = rods;
  decor.rugs = rugs;

  [...curtains, ...rods].forEach((entry) => {
    if (entry.group) return;
    const angle = (((entry.rotation ?? 0) % 180) + 180) % 180;
    const across = angle === 90 ? entry.position[0] : entry.position[2];
    entry.group = `gorden-${angle}-${across < 0 ? 'neg' : 'pos'}`;
  });
  rugs.forEach((entry) => {
    entry.group ??= entry.id;
  });
  return decor;
}

export function decorShape(type, entry) {
  if (type === 'rug') {
    const [w, , d] = entry.size;
    const [x, , z] = entry.position;
    return { kind: 'rect', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
  }

  const length = type === 'rod' ? entry.length : entry.width;
  const angle = ((entry.rotation ?? 0) * Math.PI) / 180;
  const u = [Math.cos(angle), -Math.sin(angle)];
  const c = [entry.position[0], entry.position[2]];
  return {
    kind: 'segment',
    a: [c[0] - (u[0] * length) / 2, c[1] - (u[1] * length) / 2],
    b: [c[0] + (u[0] * length) / 2, c[1] + (u[1] * length) / 2],
  };
}

export function decorPieces(floor) {
  const decor = floor.decor ?? {};
  return LIST_TYPES.flatMap(([type, list]) =>
    (decor[list] ?? []).map((entry) => ({
      type,
      entry,
      group: entry.group ?? entry.id,
      shape: decorShape(type, entry),
    })),
  );
}

export function decorGroups(floor) {
  const groups = new Map();
  decorPieces(floor).forEach((piece) => {
    if (!groups.has(piece.group)) groups.set(piece.group, []);
    groups.get(piece.group).push(piece);
  });

  return [...groups].map(([id, pieces]) => {
    const kind = pieces.every((p) => p.type === 'rug') ? 'rug' : 'curtain';
    return { id, kind, label: DECOR_LABELS[kind], pieces };
  });
}

export function shapeCenter(shape) {
  return shape.kind === 'rect'
    ? [(shape.minX + shape.maxX) / 2, (shape.minZ + shape.maxZ) / 2]
    : [(shape.a[0] + shape.b[0]) / 2, (shape.a[1] + shape.b[1]) / 2];
}
