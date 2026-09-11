export function drawOhsunBackdrop(ctx, options) {
  const {
    width,
    height,
    board,
    config
  } = options;
  const colors = config.colors;

  ctx.save();
  ctx.fillStyle = colors.sky;
  ctx.fillRect(0, 0, width, height);

  // 公式作例のフラットな色面を、盤面中央が読みやすい比率で配置する。
  ctx.fillStyle = colors.yellow;
  ctx.fillRect(0, 0, width * .58, height * .22);
  ctx.fillStyle = colors.green;
  ctx.fillRect(width * .67, 0, width * .33, height * .43);
  ctx.fillStyle = colors.pink;
  ctx.fillRect(0, height * .69, width * .62, height * .31);
  ctx.fillStyle = colors.gray;
  ctx.globalAlpha = .2;
  ctx.fillRect(width * .82, height * .48, width * .18, height * .52);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.beginPath();
  ctx.moveTo(width * .46, 0);
  ctx.lineTo(width * .72, 0);
  ctx.lineTo(width * .55, height);
  ctx.lineTo(width * .3, height);
  ctx.closePath();
  ctx.fill();

  // 盤面付近だけを明るくし、背景の存在感とピースの視認性を両立する。
  const centerX = board.x + board.width * .5;
  const centerY = board.y + board.height * .5;
  const glow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(board.width, board.height) * .7);
  glow.addColorStop(0, "rgba(255,255,255,.25)");
  glow.addColorStop(.65, "rgba(255,255,255,.08)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function fitImageInRect(rect, aspectRatio, maxSize) {
  let drawWidth = Math.min(rect.width, maxSize);
  let drawHeight = drawWidth / aspectRatio;
  if (drawHeight > rect.height) {
    drawHeight = Math.min(rect.height, maxSize);
    drawWidth = drawHeight * aspectRatio;
  }
  return {
    x: rect.x + (rect.width - drawWidth) / 2,
    y: rect.y + (rect.height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  };
}

export function calculateOhsunAccentSlots({ width, height, board, hudBottom = 0, avoidTop = false, imageAspect = 1 }) {
  const compact = width <= 480;
  const minSize = width <= 340 ? 46 : compact ? 52 : 72;
  const edge = compact ? 8 : 14;
  const safeBottom = compact ? 38 : 20;
  const gap = compact ? 10 : 14;
  const maxSize = compact ? 112 : 160;
  const boardBottom = board.y + board.height;
  const candidates = [];

  if (!avoidTop) {
    candidates.push({
      name: "top",
      rect: {
        x: board.x + board.width * .31,
        y: hudBottom + gap,
        width: board.width * .38,
        height: board.y - hudBottom - gap * 2
      }
    });
  }

  candidates.push(
    {
      name: "bottom",
      // 盤面直下のステージ進捗バー（盤面下端+12～20px）も避ける。
      rect: {
        x: board.x + board.width * .31,
        y: boardBottom + 30,
        width: board.width * .38,
        height: height - safeBottom - (boardBottom + 30)
      }
    },
    {
      name: "left",
      rect: {
        x: edge,
        y: Math.max(hudBottom + gap, board.y),
        width: board.x - edge - gap,
        height: board.height
      }
    },
    {
      name: "right",
      rect: {
        x: board.x + board.width + gap,
        y: Math.max(hudBottom + gap, board.y),
        width: width - edge - (board.x + board.width + gap),
        height: board.height
      }
    }
  );

  return candidates.flatMap(candidate => {
    const { rect } = candidate;
    if (rect.width < minSize || rect.height < minSize) return [];
    const bounds = fitImageInRect(rect, imageAspect, maxSize);
    if (Math.min(bounds.width, bounds.height) < minSize) return [];
    return [{ name:candidate.name, ...bounds }];
  });
}

export function drawOhsunSafeAccents(ctx, options) {
  const { image } = options;
  if (!image?.naturalWidth || !image?.naturalHeight) return [];
  const slots = calculateOhsunAccentSlots({
    ...options,
    imageAspect:image.naturalWidth / image.naturalHeight
  });
  for (const slot of slots) {
    ctx.save();
    ctx.globalAlpha = .86;
    ctx.shadowColor = "rgba(64,54,25,.2)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    // 枠内へcontain配置し、公式画像の縦横比と全体像を維持する。
    ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
    ctx.restore();
  }
  return slots;
}

export function calculateOhsunHeroLayout({ width, height, board, safeTop = 8, imageAspect = 1 }) {
  const edge = width <= 480 ? 10 : 18;
  const boardBottom = board.y + board.height;
  const rightRegion = {
    x:board.x + board.width + 18,
    y:Math.max(safeTop, board.y),
    width:width - edge - (board.x + board.width + 18),
    height:Math.min(board.height, height - edge - Math.max(safeTop, board.y))
  };

  if (width > 700 && rightRegion.width >= 210 && rightRegion.height >= 250) {
    const charWidth = Math.min(160, rightRegion.width - 30);
    const charHeight = charWidth / imageAspect;
    return {
      orientation:"column",
      region:rightRegion,
      character:{
        x:rightRegion.x + (rightRegion.width - charWidth) / 2,
        y:rightRegion.y + 12,
        width:charWidth,
        height:charHeight
      },
      bubble:{
        x:rightRegion.x + 8,
        y:rightRegion.y + charHeight + 26,
        width:rightRegion.width - 16,
        height:Math.max(54, rightRegion.height - charHeight - 34)
      }
    };
  }

  const topRegion = {
    x:edge,
    y:safeTop,
    width:width - edge * 2,
    height:board.y - safeTop - 12
  };
  const bottomY = boardBottom + 30;
  const bottomRegion = {
    x:edge,
    y:bottomY,
    width:width - edge * 2,
    height:height - edge - bottomY
  };
  const topUsable = topRegion.height >= 82;
  const bottomUsable = bottomRegion.height >= 82;
  const region = topUsable
    ? topRegion
    : bottomUsable
      ? bottomRegion
      : topRegion.height >= bottomRegion.height ? topRegion : bottomRegion;
  const availableHeight = Math.max(54, region.height - 8);
  let charHeight = Math.min(width <= 480 ? 108 : 138, availableHeight);
  let charWidth = charHeight * imageAspect;
  const minBubbleWidth = Math.min(190, region.width * .56);
  if (region.width - charWidth - 14 < minBubbleWidth) {
    charWidth = Math.max(46, region.width - minBubbleWidth - 14);
    charHeight = charWidth / imageAspect;
  }
  const character = {
    x:region.x + 4,
    y:region.y + (region.height - charHeight) / 2,
    width:charWidth,
    height:charHeight
  };
  return {
    orientation:"row",
    region,
    character,
    bubble:{
      x:character.x + character.width + 8,
      y:region.y + 6,
      width:Math.max(90, region.x + region.width - (character.x + character.width + 14)),
      height:Math.max(42, region.height - 12)
    }
  };
}

export function createOhsunMenuBackdrop(host, image, config) {
  if (!host || !image || !image.src) return null;
  const root = document.createElement("div");
  root.className = "ohsun-menu-backdrop";
  root.setAttribute("aria-hidden", "true");

  const colorNames = ["yellow", "green", "pink", "gray"];
  for (const name of colorNames) {
    const block = document.createElement("span");
    block.className = "ohsun-menu-color ohsun-menu-color-" + name;
    block.style.backgroundColor = config.colors[name];
    root.appendChild(block);
  }
  root.style.backgroundColor = config.colors.sky;

  for (const position of ["top", "left", "right", "bottom"]) {
    const character = document.createElement("img");
    character.className = "ohsun-menu-character ohsun-menu-character-" + position;
    character.src = image.src;
    character.alt = "";
    character.draggable = false;
    root.appendChild(character);
  }

  host.prepend(root);
  return {
    root,
    destroy(){ root.remove(); }
  };
}
