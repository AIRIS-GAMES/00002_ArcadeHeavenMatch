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
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.filter = "none";
    // 枠内へcontain配置し、公式画像の縦横比と全体像を維持する。
    ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
    ctx.restore();
  }
  return slots;
}

export function calculateOhsunHeroLayout({ width, height, board, safeTop = 8, imageAspect = 1 }) {
  const edge = width <= 480 ? 10 : 18;
  const bottomY = board.y + board.height + 30;
  const candidates = [
    { orientation:"row", x:edge, y:safeTop, width:width-edge*2, height:board.y-safeTop-12 },
    { orientation:"row", x:edge, y:bottomY, width:width-edge*2, height:height-edge-bottomY }
  ];
  if(width > 700){
    const rightX = board.x + board.width + 18;
    const rightY = Math.max(safeTop, board.y);
    candidates.push({
      orientation:"column", x:rightX, y:rightY, width:width-edge-rightX,
      height:Math.min(board.height, height-edge-rightY)
    });
  }
  // With no dialogue, the full safe region is available to the official image.
  const layouts = candidates.filter(region=>region.width>16 && region.height>16).map(region=>{
    const character = fitImageInRect({
      x:region.x+8, y:region.y+8, width:region.width-16, height:region.height-16
    }, imageAspect, Infinity);
    return { orientation:region.orientation, region, character };
  });
  layouts.sort((a,b)=>b.character.width*b.character.height-a.character.width*a.character.height);
  return layouts[0] ?? null;
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
