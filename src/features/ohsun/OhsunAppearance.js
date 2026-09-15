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
