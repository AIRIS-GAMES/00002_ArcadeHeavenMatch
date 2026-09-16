function randomIndex(length, random) {
  if (length <= 0) return -1;
  const value = Number(random?.());
  const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999) : 0;
  return Math.floor(normalized * length);
}

export function pickRandomOhsunItem(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[randomIndex(items.length, random)] ?? items[0];
}

export function createOhsunAppearance(config, loadedCharacters, options = {}) {
  if (!Array.isArray(loadedCharacters) || loadedCharacters.length === 0) return null;
  const random = options.random ?? Math.random;
  const previousAsset = options.previousAsset ?? "";
  const candidates = loadedCharacters.length > 1 && previousAsset
    ? loadedCharacters.filter(character => character.asset !== previousAsset)
    : loadedCharacters;
  const character = pickRandomOhsunItem(candidates.length ? candidates : loadedCharacters, random);

  return {
    asset: character.asset,
    image: character.image
  };
}

// Only position and uniform size change. The complete official image stays in its region.
export function getOhsunPresentation(layout, phase, progress, reduceMotion = false) {
  const { character, region } = layout;
  const t = Math.max(0, Math.min(1, progress));
  if (reduceMotion || (phase !== "ENTERING" && phase !== "EXITING")) return { ...character };
  const entering = phase === "ENTERING";
  const eased = entering ? 1 - Math.pow(1 - t, 3) : t * t;
  const scale = entering ? 0.55 + 0.45 * eased : 1 - 0.45 * eased;
  const width = character.width * scale, height = character.height * scale;
  const centerX = character.x + character.width / 2;
  const centerY = character.y + character.height / 2;
  const edgeX = entering ? region.x + 8 + width / 2 : region.x + region.width - 8 - width / 2;
  const travel = entering ? 1 - eased : eased;
  const hop = Math.sin(Math.PI * t) * Math.min(22, character.height * 0.12);
  const x = centerX + (edgeX - centerX) * travel - width / 2;
  const y = centerY - height / 2 - hop;
  return {
    x: Math.max(region.x + 8, Math.min(region.x + region.width - 8 - width, x)),
    y: Math.max(region.y + 8, Math.min(region.y + region.height - 8 - height, y)),
    width, height
  };
}
