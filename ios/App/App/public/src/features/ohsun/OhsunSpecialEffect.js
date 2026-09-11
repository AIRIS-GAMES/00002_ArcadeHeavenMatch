export function findMostCommonColorCells(board, normalTypeCount) {
  const counts = Array(normalTypeCount).fill(0);
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      const tile = board[row][column];
      if (tile && Number.isInteger(tile.t) && tile.t >= 0 && tile.t < normalTypeCount) counts[tile.t]++;
    }
  }
  let targetType = null;
  let targetCount = 0;
  for (let type = 0; type < counts.length; type++) {
    if (counts[type] > targetCount) {
      targetType = type;
      targetCount = counts[type];
    }
  }
  const cells = new Set();
  if (targetType === null) return { targetType, cells, count: 0 };
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      if (board[row][column] && board[row][column].t === targetType) cells.add(row + "," + column);
    }
  }
  return { targetType, cells, count: cells.size };
}

