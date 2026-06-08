let video;
let handPose;
let hands = [];

let gameState    = 'start';
let currentLevel = 0;

let buttons = {};

// ─── 互動回饋（音效／粒子／畫面震動） ─────────────────────
let particles    = [];
let shakeAmount  = 0;
let sfx          = {};
let audioStarted = false;

const CAM_W = 640, CAM_H = 480;
let scaleX = 1, scaleY = 1;

// 主背景色 #0a0a2e；各關卡主題色（索引對應 currentLevel）
const BG_COLOR = [10, 10, 46];
let LEVEL_THEME; // 在 setup() 中以 color() 建立，避免 preload 階段呼叫 color()

// ─── 關卡1 狀態 ──────────────────────────────────────────
let lv1 = {
  angle:         0,
  balanceStart:  -1,
  cleared:       false,
  fxFired:       false,
  lastSecond:    -1,
  gust:          0,     // 平滑後的目前突風偏移（動態難度）
  gustTarget:    0,     // 突風目標值，會緩慢衰減回零
  nextGustAt:    0,
  gustFlashUntil: 0,
};

// ─── 關卡2 狀態 ──────────────────────────────────────────
let lv2 = {
  hitTimer:    -1,
  cleared:     false,
  fxFired:     false,
  lastSecond:  -1,
  targetY:     0.4,     // 目標垂直位置（佔畫面高度比例，動態難度：隨機位置）
  targetSetAt: 0,       // 此位置設定的時間戳記（逾時未完成就換位置）
};

// ─── 關卡3 狀態 ──────────────────────────────────────────
let lv3 = {
  targetAngleL:  0,
  targetAngleR:  0,
  currentAngleL: 0,
  currentAngleR: 0,
  alignTimer:   -1,
  cleared:       false,
  fxFired:       false,
};

function preload() {
  handPose = ml5.handPose({
    maxNumHands:             2,
    flipped:                 true,
    minDetectionConfidence:  0.4,
    minTrackingConfidence:   0.4,
  });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  video = createCapture(VIDEO, { flipped: true });
  video.size(CAM_W, CAM_H);
  video.hide();
  handPose.detectStart(video, gotHands);
  updateScale();
  setupButtons();

  // 簡易音效用震盪器（不需外部音檔）
  sfx.osc = new p5.Oscillator('sine');
  sfx.osc.amp(0);
  sfx.osc.start();

  LEVEL_THEME = [
    null,
    color(255, 150,  60),   // 關卡1：暖橘色
    color( 80, 220, 255),   // 關卡2：青藍色
    color(190, 110, 255),   // 關卡3：紫色
  ];
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateScale();
  setupButtons();
}

function updateScale() {
  scaleX = width  / CAM_W;
  scaleY = height / CAM_H;
}

function setupButtons() {
  buttons.start      = makeBtn(width / 2 - 80,  height * 0.62, 160, 52, '開始');
  buttons.level      = [
    makeBtn(width / 2 - 90, height * 0.38, 180, 55, '關卡 1'),
    makeBtn(width / 2 - 90, height * 0.52, 180, 55, '關卡 2'),
    makeBtn(width / 2 - 90, height * 0.66, 180, 55, '關卡 3'),
  ];
  buttons.back       = makeBtn(10, 10, 100, 36, '← 返回');
  buttons.backSelect = makeBtn(width / 2 - 90, height * 0.66, 180, 52, '回選關');
}

function makeBtn(x, y, w, h, label) {
  return { x, y, w, h, label };
}

function gotHands(results) {
  hands = results;
}

function isCurrentLevelCleared() {
  if (currentLevel === 1) return lv1.cleared;
  if (currentLevel === 2) return lv2.cleared;
  if (currentLevel === 3) return lv3.cleared;
  return false;
}

function resetLevel1() {
  lv1.angle          = 0;
  lv1.balanceStart   = -1;
  lv1.cleared        = false;
  lv1.fxFired        = false;
  lv1.lastSecond     = -1;
  lv1.gust           = 0;
  lv1.gustTarget     = 0;
  lv1.nextGustAt     = millis() + random(6000, 9000);
  lv1.gustFlashUntil = 0;
}

function resetLevel2() {
  lv2.hitTimer    = -1;
  lv2.cleared     = false;
  lv2.fxFired     = false;
  lv2.lastSecond  = -1;
  lv2.targetY     = random(0.22, 0.58);
  lv2.targetSetAt = millis();
}

function resetLevel3() {
  lv3.targetAngleL  = random(0, 360);
  lv3.targetAngleR  = random(0, 360);
  lv3.currentAngleL = 0;
  lv3.currentAngleR = 0;
  lv3.alignTimer    = -1;
  lv3.cleared       = false;
  lv3.fxFired       = false;
}

// ─── 主繪圖 ──────────────────────────────────────────────
function draw() {
  push();
  // 畫面震動回饋（成功/失誤時觸發，逐漸衰減）
  if (shakeAmount > 0.4) {
    translate(random(-shakeAmount, shakeAmount), random(-shakeAmount, shakeAmount));
    shakeAmount *= 0.9;
  } else {
    shakeAmount = 0;
  }

  if      (gameState === 'start')   drawStartScreen();
  else if (gameState === 'select')  drawSelectScreen();
  else if (gameState === 'playing') drawPlayingScreen();

  pop();
}

// ─── 開始畫面 ────────────────────────────────────────────
function drawStartScreen() {
  background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);

  // 標題：脈動光暈效果
  let pulse = (sin(frameCount * 0.04) + 1) * 0.5;
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  drawGlowText('雙手解謎', width / 2, height * 0.42,
    clamp(width * 0.08, 36, 72),
    color(255), color(90, 150, 255), 16 + pulse * 26);

  noStroke();
  textSize(clamp(width * 0.025, 14, 20));
  textStyle(NORMAL);
  fill(160, 180, 220);
  text('使用雙手食指操控，挑戰三個互動關卡', width / 2, height * 0.55);
  drawButton(buttons.start, color(60, 120, 255), color(255));
}

// ─── 選關畫面 ────────────────────────────────────────────
function drawSelectScreen() {
  background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);

  let pulse = (sin(frameCount * 0.05) + 1) * 0.5;
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  drawGlowText('選擇關卡', width / 2, height * 0.22,
    clamp(width * 0.04, 22, 36),
    color(255), color(160, 130, 255), 10 + pulse * 16);

  // 三關卡按鈕主題色：黃 / 藍 / 紫
  const levelColors = [
    color(255, 215,  60),   // 關卡1 黃色
    color( 70, 140, 255),   // 關卡2 藍色
    color(180,  90, 255),   // 關卡3 紫色
  ];
  for (let i = 0; i < buttons.level.length; i++) {
    drawButton(buttons.level[i], levelColors[i], color(20));
  }
}

// ─── 遊戲畫面 ────────────────────────────────────────────
function drawPlayingScreen() {
  let tips = getIndexTips();

  if      (currentLevel === 1) drawLevel1(tips);
  else if (currentLevel === 2) drawLevel2(tips);
  else if (currentLevel === 3) drawLevel3(tips);
  else {
    image(video, 0, 0, width, height);
    for (let tip of tips) {
      let isLeft = tip.x < width / 2;
      drawFingerDot(tip.x, tip.y,
        isLeft ? color(50, 120, 255) : color(255, 60, 60),
        isLeft ? '左手' : '右手');
    }
  }

  if (!isCurrentLevelCleared()) {
    noStroke();
    fill(0, 0, 0, 150);
    rect(0, 0, width, 44);
    fill(255);
    textSize(15);
    textAlign(LEFT, CENTER);
    textStyle(NORMAL);
    text(`關卡 ${currentLevel}　｜　偵測到 ${hands.length} 隻手`, 120, 22);
    drawButton(buttons.back, color(60, 60, 80), color(255));
  }

  updateAndDrawParticles();   // 慶祝粒子（疊在最上層）
}

// ═══════════════════════════════════════════════════════════
// 關卡1：平衡天秤
// ═══════════════════════════════════════════════════════════
function drawLevel1(tips) {
  drawThemedBackground(LEVEL_THEME[1]);   // 暖橘色主題

  let leftTip  = tips.find(t => t.x <  width / 2) || null;
  let rightTip = tips.find(t => t.x >= width / 2) || null;

  // 動態難度：隨機突風干擾天秤，漸入漸出給玩家反應時間，可主動修正抵銷（每次重玩節奏不同）
  if (!lv1.cleared) {
    if (millis() > lv1.nextGustAt) {
      lv1.gustTarget     = (random() < 0.5 ? -1 : 1) * random(6, 14);
      lv1.nextGustAt     = millis() + random(8000, 13000);  // 間隔大於通關所需的 10 秒，留有完整視窗
      lv1.gustFlashUntil = millis() + 1300;
      playTone(220, 0.1, 0.07);
    }
    lv1.gustTarget *= 0.99;                          // 風力緩慢消退至 0
    lv1.gust = lerp(lv1.gust, lv1.gustTarget, 0.04); // 平滑跟隨，而非瞬間跳動 → 可即時修正抵銷
  }

  if (leftTip && rightTip) {
    let diff = (leftTip.y - rightTip.y) / scaleY;
    lv1.angle = constrain(diff / 7 + lv1.gust, -30, 30);
  }

  drawScale(lv1.angle);
  drawBalanceBar(lv1.angle);

  if (leftTip)  drawFingerDot(leftTip.x,  leftTip.y,  color(50, 120, 255), '左手');
  if (rightTip) drawFingerDot(rightTip.x, rightTip.y, color(255,  60,  60), '右手');

  if (!leftTip || !rightTip) {
    noStroke(); fill(255, 220, 80);
    textSize(clamp(width * 0.028, 16, 24));
    textAlign(CENTER, CENTER); textStyle(BOLD);
    text('請伸出雙手食指！', width / 2, height - height * 0.12);
  }

  if (millis() < lv1.gustFlashUntil) {
    noStroke(); fill(255, 130, 90);
    textSize(clamp(width * 0.024, 14, 20));
    textAlign(CENTER, CENTER); textStyle(BOLD);
    text(`💨 起風了！持續修正以抵銷往${lv1.gustTarget > 0 ? '右' : '左'}的風力`, width / 2, height * 0.30);
  }

  if (!lv1.cleared) {
    let balanced = abs(lv1.angle) <= 5 && leftTip && rightTip;
    if (balanced) {
      if (lv1.balanceStart < 0) lv1.balanceStart = millis();
      let remain = 10 - (millis() - lv1.balanceStart) / 1000;
      let sec = ceil(remain);
      if (sec !== lv1.lastSecond && sec > 0) {
        lv1.lastSecond = sec;
        playTone(420 + (10 - sec) * 28, 0.08, 0.09);   // 倒數音調隨秒數升高
      }
      if (remain <= 0) {
        lv1.cleared = true;
      } else {
        fill(80, 255, 150); noStroke();
        textSize(clamp(width * 0.05, 28, 42));
        textAlign(CENTER, CENTER); textStyle(BOLD);
        text(`保持！${sec} 秒`, width / 2, height * 0.24);
      }
    } else {
      if (lv1.balanceStart >= 0) {           // 維持中途突然失衡 → 給予回饋，提高緊張感
        triggerShake(6);
        playBuzz();
      }
      lv1.balanceStart = -1;
      lv1.lastSecond   = -1;
      fill(255, 200, 150); noStroke();
      textSize(clamp(width * 0.025, 14, 20));
      textAlign(CENTER, CENTER); textStyle(NORMAL);
      text('讓天秤保持水平 10 秒（小心隨機突風！）', width / 2, height * 0.24);
    }
  }

  if (lv1.cleared) {
    if (!lv1.fxFired) {
      spawnBurst(width / 2, height * 0.42, LEVEL_THEME[1], 50);
      playSuccessChime();
      triggerShake(10);
      lv1.fxFired = true;
    }
    drawClearedOverlay('成功維持天秤平衡 10 秒');
  }
}

function drawScale(angleDeg) {
  let cx = width / 2, cy = height / 2 + height * 0.06;
  let armLen = width * 0.26, standH = height * 0.22;

  noStroke(); fill(120, 90, 50);
  rect(cx - armLen * 0.28, cy + standH, armLen * 0.56, 14, 5);
  stroke(160, 130, 80); strokeWeight(max(5, width * 0.009));
  line(cx, cy, cx, cy + standH);

  push(); translate(cx, cy); rotate(-radians(angleDeg));
  stroke(200, 170, 100); strokeWeight(max(6, width * 0.011)); strokeCap(ROUND);
  line(-armLen, 0, armLen, 0);
  let chainLen = height * 0.12;
  stroke(180, 150, 90); strokeWeight(2);
  line(-armLen, 0, -armLen, chainLen);
  noStroke(); fill(200, 170, 100);
  ellipse(-armLen, chainLen + armLen * 0.06, armLen * 0.44, 14);
  stroke(180, 150, 90); strokeWeight(2);
  line(armLen, 0, armLen, chainLen);
  noStroke(); fill(200, 170, 100);
  ellipse(armLen, chainLen + armLen * 0.06, armLen * 0.44, 14);
  fill(240, 210, 80); noStroke();
  circle(0, 0, max(16, width * 0.025));
  pop();
}

function drawBalanceBar(angleDeg) {
  let margin = width * 0.12;
  let bx = margin, by = height - height * 0.09;
  let bw = width - margin * 2, bh = 20;

  noStroke(); fill(30, 35, 60); rect(bx, by, bw, bh, 10);
  let safeW = bw * (10 / 60);
  fill(50, 200, 100, 130);
  rect(bx + bw / 2 - safeW / 2, by, safeW, bh, 10);
  let px = map(angleDeg, -30, 30, bx, bx + bw);
  px = constrain(px, bx + 12, bx + bw - 12);
  fill(abs(angleDeg) <= 5 ? color(80, 255, 140) : color(255, 90, 70));
  noStroke(); circle(px, by + bh / 2, 26);
  stroke(255, 255, 255, 70); strokeWeight(1);
  line(bx + bw / 2, by, bx + bw / 2, by + bh);
  noStroke(); fill(150); textSize(12); textStyle(NORMAL);
  textAlign(LEFT,   TOP); text('← 左傾', bx,           by + bh + 4);
  textAlign(RIGHT,  TOP); text('右傾 →', bx + bw,       by + bh + 4);
  textAlign(CENTER, TOP); text('平衡',   bx + bw / 2,   by + bh + 4);
}

// ═══════════════════════════════════════════════════════════
// 關卡2：光束導引
// ═══════════════════════════════════════════════════════════
function drawLevel2(tips) {
  drawThemedBackground(LEVEL_THEME[2]);   // 青藍色主題

  // ── 場景尺寸定義 ─────────────────────────────────────────
  let sx  = width * 0.06,  sy  = height / 2;       // 雷射源
  let lmx = width * 0.38,  lmy = height / 2;       // 左鏡（固定位置，只旋轉）
  let rmx = width * 0.65;                           // 右鏡 x（固定）
  let tx  = width * 0.93;
  // 動態難度：目標位置隨機，若 6 秒內未完成挑戰就換到新位置（改成定點，避免持續移動造成偵測困難）
  if (!lv2.cleared && millis() - lv2.targetSetAt > 6000) {
    lv2.targetY     = random(0.22, 0.58);
    lv2.targetSetAt = millis();
    lv2.hitTimer    = -1;
    lv2.lastSecond  = -1;
    playTone(320, 0.12, 0.07);
  }
  let ty  = height * lv2.targetY;
  let mirrorHalfLen = height * 0.09;                // 鏡子半長

  // ── 手指輸入 ─────────────────────────────────────────────
  let leftTip  = tips.find(t => t.x <  width / 2) || null;
  let rightTip = tips.find(t => t.x >= width / 2) || null;

  // 左手 Y → 左鏡旋轉角（-40° ~ +40° from horizontal）
  let mirrorAngleDeg = leftTip
    ? map(leftTip.y, height * 0.1, height * 0.9, -40, 40)
    : 0;
  mirrorAngleDeg = constrain(mirrorAngleDeg, -40, 40);

  // 右手 Y → 右鏡上下位置
  let rmy = rightTip
    ? constrain(rightTip.y, height * 0.1, height * 0.9)
    : height / 2;

  // ── 光路計算 ─────────────────────────────────────────────
  let thetaRad = radians(mirrorAngleDeg);
  // 反射後方向向量（cos2θ, sin2θ），確保往右
  let dirX = cos(2 * thetaRad);
  let dirY = sin(2 * thetaRad);

  // 第2段：左鏡 → 右鏡 x 平面
  let seg2EndX = lmx, seg2EndY = lmy;
  let beamAtRmx   = null;    // 光束到達右鏡 x 的 y 座標
  let rightMirrorHit = false;
  let targetHit      = false;

  if (dirX > 0.01) {
    let t = (rmx - lmx) / dirX;
    let byAtRmx = lmy + t * dirY;

    // 若光束出界，裁切到螢幕邊緣
    if (byAtRmx < 0) {
      let tTop = (0 - lmy) / dirY;
      seg2EndX = lmx + tTop * dirX;
      seg2EndY = 0;
    } else if (byAtRmx > height) {
      let tBot = (height - lmy) / dirY;
      seg2EndX = lmx + tBot * dirX;
      seg2EndY = height;
    } else {
      seg2EndX = rmx;
      seg2EndY = byAtRmx;
      beamAtRmx = byAtRmx;
      rightMirrorHit = abs(byAtRmx - rmy) < mirrorHalfLen;
      targetHit      = rightMirrorHit && abs(byAtRmx - ty) < 22;
    }
  }

  // ── 繪製目標點（先畫，光束蓋在上面） ─────────────────────
  let pulse = (sin(millis() * 0.004) + 1) * 0.5;
  noStroke();
  fill(255, 200, 0, 60 + pulse * 80);
  circle(tx, ty, 60);
  fill(255, 200, 0, 160);
  circle(tx, ty, 30);
  fill(255, 230, 100);
  circle(tx, ty, 14);

  // 換位置倒數環：提示玩家此目標還會停留多久（綠→紅）
  if (!lv2.cleared) {
    let relocProgress = constrain((millis() - lv2.targetSetAt) / 6000, 0, 1);
    noFill();
    stroke(lerpColor(color(120, 255, 180), color(255, 90, 90), relocProgress));
    strokeWeight(3);
    arc(tx, ty, 50, 50, -HALF_PI, -HALF_PI + relocProgress * TWO_PI);
    noStroke();
  }
  // 目標標籤
  fill(255, 200, 0);
  textSize(12); textStyle(NORMAL);
  textAlign(CENTER, BOTTOM);
  text('目標', tx, ty - 20);

  // ── 繪製光束 ─────────────────────────────────────────────
  let beamCol = targetHit ? color(80, 255, 160) : color(255, 50, 50);

  // 第1段：源 → 左鏡（水平）
  drawBeamSegment(sx, sy, lmx, lmy, beamCol);

  // 第2段：左鏡 → 右鏡（或牆）
  drawBeamSegment(lmx, lmy, seg2EndX, seg2EndY, beamCol);

  // 第3段：右鏡 → 目標（水平）
  if (rightMirrorHit && beamAtRmx !== null) {
    drawBeamSegment(rmx, beamAtRmx, tx, beamAtRmx, beamCol);
    // 打到目標的光暈
    if (targetHit) {
      noStroke();
      fill(80, 255, 160, 100);
      circle(tx, ty, 70);
    }
  }

  // ── 繪製雷射源 ───────────────────────────────────────────
  noStroke();
  fill(40, 40, 60);
  rect(sx - 22, sy - 14, 44, 28, 5);
  fill(255, 80, 80);
  circle(sx + 14, sy, 10);
  fill(255, 180, 180);
  circle(sx + 14, sy, 5);

  // ── 繪製左鏡（旋轉） ─────────────────────────────────────
  let lmDX = cos(thetaRad) * mirrorHalfLen;
  let lmDY = sin(thetaRad) * mirrorHalfLen;
  stroke(100, 200, 255); strokeWeight(4);
  line(lmx - lmDX, lmy - lmDY, lmx + lmDX, lmy + lmDY);
  // 鏡架
  noStroke(); fill(60, 80, 120);
  circle(lmx, lmy, 10);
  // 角度提示
  fill(100, 180, 255); textSize(12); textStyle(NORMAL);
  textAlign(CENTER, BOTTOM);
  text(`左鏡 ${mirrorAngleDeg > 0 ? '+' : ''}${nf(mirrorAngleDeg, 1, 1)}°`, lmx, lmy - mirrorHalfLen - 8);

  // ── 繪製右鏡（\ 形，上下移動） ───────────────────────────
  let rmDiag = mirrorHalfLen * 0.707; // cos/sin 45°
  let rmColor = rightMirrorHit ? color(80, 255, 200) : color(100, 200, 255);
  stroke(rmColor); strokeWeight(4);
  line(rmx - rmDiag, rmy - rmDiag, rmx + rmDiag, rmy + rmDiag);
  noStroke(); fill(60, 80, 120);
  circle(rmx, rmy, 10);
  fill(rmColor); textSize(12); textStyle(NORMAL);
  textAlign(CENTER, BOTTOM);
  text('右鏡', rmx, rmy - mirrorHalfLen - 8);

  // ── 指示文字 ─────────────────────────────────────────────
  if (!lv2.cleared) {
    if (targetHit) {
      if (lv2.hitTimer < 0) lv2.hitTimer = millis();
      let remain = 3 - (millis() - lv2.hitTimer) / 1000;
      let sec = ceil(remain);
      if (sec !== lv2.lastSecond && sec > 0) {
        lv2.lastSecond = sec;
        playTone(540 + (3 - sec) * 90, 0.09, 0.1);
      }
      if (remain <= 0) {
        lv2.cleared = true;
      } else {
        noStroke(); fill(80, 255, 160);
        textSize(clamp(width * 0.045, 26, 40));
        textAlign(CENTER, CENTER); textStyle(BOLD);
        text(`維持！${sec} 秒`, width / 2, height * 0.14);
      }
    } else {
      if (lv2.hitTimer >= 0) {                // 命中途中目標移開 → 給予回饋
        triggerShake(5);
        playBuzz();
      }
      lv2.hitTimer   = -1;
      lv2.lastSecond = -1;
      noStroke(); fill(140, 230, 255);
      textSize(clamp(width * 0.022, 13, 18));
      textAlign(CENTER, CENTER); textStyle(NORMAL);
      text('左手調整光束角度，右手攔截光束引向目標（環形倒數歸零前完成，否則目標會換位置！）', width / 2, height * 0.14);
    }
  }

  // ── 食指圓點 ─────────────────────────────────────────────
  if (leftTip)  drawFingerDot(leftTip.x,  leftTip.y,  color(50, 120, 255), '左手');
  if (rightTip) drawFingerDot(rightTip.x, rightTip.y, color(255,  60,  60), '右手');

  if (!leftTip || !rightTip) {
    noStroke(); fill(255, 220, 80);
    textSize(clamp(width * 0.028, 16, 24));
    textAlign(CENTER, CENTER); textStyle(BOLD);
    text('請伸出雙手食指！', width / 2, height - height * 0.12);
  }

  if (lv2.cleared) {
    if (!lv2.fxFired) {
      spawnBurst(tx, ty, LEVEL_THEME[2], 50);
      playSuccessChime();
      triggerShake(10);
      lv2.fxFired = true;
    }
    drawClearedOverlay('成功將光束引導至目標 3 秒');
  }
}

// 有光暈效果的光束線段
function drawBeamSegment(x1, y1, x2, y2, col) {
  let r = red(col), g = green(col), b = blue(col);
  stroke(r, g, b, 35); strokeWeight(12); line(x1, y1, x2, y2);
  stroke(r, g, b, 100); strokeWeight(5);  line(x1, y1, x2, y2);
  stroke(r, g, b, 220); strokeWeight(2);  line(x1, y1, x2, y2);
  stroke(255, 255, 255, 160); strokeWeight(1); line(x1, y1, x2, y2);
}

// ═══════════════════════════════════════════════════════════
// 關卡3：雙轉盤解鎖
// ═══════════════════════════════════════════════════════════
function drawLevel3(tips) {
  drawThemedBackground(LEVEL_THEME[3]);   // 紫色主題

  let dialR = min(width * 0.16, height * 0.30);
  let ldx = width * 0.27, ldy = height * 0.54;
  let rdx = width * 0.73, rdy = height * 0.54;

  let leftTip  = tips.find(t => t.x <  width / 2) || null;
  let rightTip = tips.find(t => t.x >= width / 2) || null;

  // 食指與轉盤中心的角度 → 指針角度
  if (leftTip)  lv3.currentAngleL = degrees(atan2(leftTip.y  - ldy, leftTip.x  - ldx));
  if (rightTip) lv3.currentAngleR = degrees(atan2(rightTip.y - rdy, rightTip.x - rdx));

  let diffL = angleDiff(lv3.currentAngleL, lv3.targetAngleL);
  let diffR = angleDiff(lv3.currentAngleR, lv3.targetAngleR);
  let alignedL = abs(diffL) <= 10;
  let alignedR = abs(diffR) <= 10;

  // 標題與說明
  fill(220, 200, 255); noStroke();
  textAlign(CENTER, CENTER); textStyle(BOLD);
  textSize(clamp(width * 0.034, 18, 28));
  text('雙轉盤解鎖', width / 2, height * 0.12);

  if (!lv3.cleared) {
    fill(180, 160, 220); textStyle(NORMAL);
    textSize(clamp(width * 0.02, 12, 17));
    text('讓指針（白線）對準虛線目標角度，誤差需在 ±10° 內', width / 2, height * 0.18);
  }

  // 繪製轉盤
  drawDial(ldx, ldy, dialR, lv3.currentAngleL, lv3.targetAngleL, diffL, '左轉盤', leftTip);
  drawDial(rdx, rdy, dialR, lv3.currentAngleR, lv3.targetAngleR, diffR, '右轉盤', rightTip);

  // 食指圓點
  if (leftTip)  drawFingerDot(leftTip.x,  leftTip.y,  color(50, 120, 255), '左手');
  if (rightTip) drawFingerDot(rightTip.x, rightTip.y, color(255,  60,  60), '右手');

  if (!leftTip || !rightTip) {
    noStroke(); fill(255, 220, 80);
    textSize(clamp(width * 0.028, 16, 24));
    textAlign(CENTER, CENTER); textStyle(BOLD);
    text('請伸出雙手食指！', width / 2, height - height * 0.08);
  }

  // 兩盤皆對準 → 計時確認後過關
  if (!lv3.cleared) {
    if (alignedL && alignedR) {
      if (lv3.alignTimer < 0) {
        lv3.alignTimer = millis();
        playTone(700, 0.08, 0.1);          // 兩盤同時對準瞬間給一個提示音
      } else if (millis() - lv3.alignTimer > 600) {
        lv3.cleared = true;
      }
    } else {
      if (lv3.alignTimer >= 0) {            // 確認中途偏離 → 給予回饋
        triggerShake(5);
        playBuzz();
      }
      lv3.alignTimer = -1;
    }
  }

  if (lv3.cleared) {
    if (!lv3.fxFired) {
      spawnBurst(width / 2, height * 0.40, LEVEL_THEME[3], 54);
      playSuccessChime();
      triggerShake(10);
      lv3.fxFired = true;
    }
    drawClearedOverlay('兩個轉盤皆已對準目標角度，解鎖成功！');
  }
}

// 繪製單一轉盤：外環、刻度、目標虛線、指針、對準狀態
function drawDial(cx, cy, r, currentAngle, targetAngle, diff, label, fingerTip) {
  let aligned   = abs(diff) <= 10;
  let themeCol  = aligned ? color(80, 255, 150) : color(180, 100, 255);

  // 外環光暈
  noFill();
  stroke(red(themeCol), green(themeCol), blue(themeCol), 50);
  strokeWeight(14);
  circle(cx, cy, r * 2);

  // 主環
  stroke(themeCol); strokeWeight(3);
  circle(cx, cy, r * 2);
  stroke(red(themeCol), green(themeCol), blue(themeCol), 90);
  strokeWeight(1);
  circle(cx, cy, r * 1.55);

  // 刻度
  for (let a = 0; a < 360; a += 30) {
    let aRad = radians(a);
    let major = (a % 90 === 0);
    stroke(210, 195, 240, 140);
    strokeWeight(major ? 2 : 1);
    let innerR = major ? r * 0.80 : r * 0.88;
    line(cx + cos(aRad) * innerR, cy + sin(aRad) * innerR,
         cx + cos(aRad) * r * 0.96, cy + sin(aRad) * r * 0.96);
  }

  // 目標角度（虛線 + 端點標記）
  let tRad = radians(targetAngle);
  drawDashedRadial(cx, cy, tRad, r * 0.18, r * 0.92, color(255, 200, 60));
  noStroke(); fill(255, 200, 60);
  circle(cx + cos(tRad) * r * 0.92, cy + sin(tRad) * r * 0.92, 9);

  // 食指 → 中心參考線（細線，協助瞄準）
  if (fingerTip) {
    stroke(255, 255, 255, 50); strokeWeight(1);
    line(cx, cy, fingerTip.x, fingerTip.y);
  }

  // 指針
  let cRad = radians(currentAngle);
  let pointerCol = aligned ? color(80, 255, 150) : color(255, 255, 255);
  stroke(pointerCol); strokeWeight(4); strokeCap(ROUND);
  line(cx, cy, cx + cos(cRad) * r * 0.74, cy + sin(cRad) * r * 0.74);
  noStroke(); fill(pointerCol);
  circle(cx + cos(cRad) * r * 0.74, cy + sin(cRad) * r * 0.74, 13);

  // 中心樞紐
  noStroke(); fill(200, 180, 255);
  circle(cx, cy, 16);

  // 標籤與狀態
  fill(themeCol); textStyle(BOLD); textAlign(CENTER, CENTER);
  textSize(clamp(width * 0.024, 14, 20));
  text(label, cx, cy - r - 26);

  textStyle(NORMAL);
  textSize(clamp(width * 0.018, 11, 15));
  if (aligned) {
    fill(80, 255, 150);
    text('✓ 已對準', cx, cy + r + 22);
  } else {
    fill(170, 150, 210);
    text(`誤差 ${nf(abs(diff), 1, 0)}°`, cx, cy + r + 22);
  }
}

// 從圓心向外畫虛線（起始偏移 startR，到 endR）
function drawDashedRadial(cx, cy, angleRad, startR, endR, col) {
  let dx = cos(angleRad), dy = sin(angleRad);
  let dashLen = (endR - startR) * 0.16;
  let gapLen  = (endR - startR) * 0.10;
  let d = startR;
  let drawing = true;
  strokeWeight(2.5);
  stroke(col);
  while (d < endR) {
    if (drawing) {
      let endD = min(d + dashLen, endR);
      line(cx + dx * d, cy + dy * d, cx + dx * endD, cy + dy * endD);
      d = endD;
    } else {
      d += gapLen;
    }
    drawing = !drawing;
  }
}

// 計算兩角度差，回傳範圍 [-180, 180]
function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

// ─── 過關覆蓋層（含閃爍光暈與粒子動畫） ───────────────────
function drawClearedOverlay(subtitle) {
  noStroke(); fill(0, 0, 0, 185);
  rect(0, 0, width, height);

  let cx = width / 2, cy = height * 0.38;
  let glow = (sin(frameCount * 0.08) + 1) * 0.5;       // 0~1 呼吸節奏

  // 脈動光暈背景
  noStroke();
  fill(80, 255, 150, 22 + glow * 35);
  circle(cx, cy, width * (0.34 + glow * 0.09));

  // 環繞閃爍的粒子裝飾
  for (let i = 0; i < 10; i++) {
    let a   = frameCount * 0.018 + i * (TWO_PI / 10);
    let rad = width * 0.17 + sin(frameCount * 0.06 + i * 1.3) * (width * 0.012);
    let px  = cx + cos(a) * rad;
    let py  = cy + sin(a) * rad * 0.55;
    let tw  = (sin(frameCount * 0.12 + i * 2) + 1) * 0.5;
    noStroke();
    fill(255, 250, 200, 70 + tw * 170);
    circle(px, py, 4 + tw * 5);
  }

  // 縮放跳動 + 發光的「過關！」文字
  let scalePulse = 1 + sin(frameCount * 0.12) * 0.05;
  push();
  translate(cx, cy);
  scale(scalePulse);
  textAlign(CENTER, CENTER); textStyle(BOLD);
  drawGlowText('過關！', 0, 0, clamp(width * 0.1, 48, 90),
    color(80, 255, 150), color(120, 255, 190), 24 + glow * 26);
  pop();

  noStroke();
  fill(200, 240, 210);
  textSize(clamp(width * 0.028, 16, 24));
  textStyle(NORMAL);
  textAlign(CENTER, CENTER);
  text(subtitle, width / 2, height * 0.52);

  drawButton(buttons.backSelect, color(60, 120, 255), color(255));
}

// ─── 慶祝粒子效果 ────────────────────────────────────────
function spawnBurst(x, y, col, count = 46) {
  for (let i = 0; i < count; i++) {
    let a     = random(TWO_PI);
    let speed = random(2, 8);
    particles.push({
      x, y,
      vx: cos(a) * speed,
      vy: sin(a) * speed - 3,
      life: 70, maxLife: 70,
      col, size: random(3, 7),
    });
  }
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.16;     // 重力
    p.life--;
    noStroke();
    fill(red(p.col), green(p.col), blue(p.col), map(p.life, 0, p.maxLife, 0, 255));
    circle(p.x, p.y, p.size);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─── 畫面震動回饋 ────────────────────────────────────────
function triggerShake(amount) {
  shakeAmount = max(shakeAmount, amount);
}

// ─── 簡易音效（震盪器即時合成，不需音檔） ─────────────────
function playTone(freq, dur = 0.12, vol = 0.15) {
  if (!audioStarted) return;
  sfx.osc.freq(freq);
  sfx.osc.amp(vol, 0.01);
  setTimeout(() => sfx.osc.amp(0, 0.06), dur * 1000);
}

function playSuccessChime() {
  if (!audioStarted) return;
  let notes = [523.25, 659.25, 783.99, 1046.5];   // C5 E5 G5 C6 上揚琶音
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.16, 0.18), i * 90));
}

function playBuzz() {
  if (!audioStarted) return;
  playTone(110, 0.18, 0.12);
}

// ─── 共用工具 ─────────────────────────────────────────────
function getIndexTips() {
  let tips = [];
  for (let hand of hands) {
    let kp = hand.keypoints[8];
    if (kp) tips.push({ x: kp.x * scaleX, y: kp.y * scaleY });
  }
  return tips;
}

function drawFingerDot(x, y, col, label) {
  let r = max(14, width * 0.018);
  noStroke();
  fill(red(col), green(col), blue(col), 60); circle(x, y, r * 3);
  fill(col); circle(x, y, r);
  fill(255); textSize(13); textAlign(CENTER, BOTTOM); textStyle(NORMAL);
  text(label, x, y - r - 2);
}

function drawButton(btn, bgCol, textCol) {
  let hovered = isHovered(btn);
  let lift    = hovered ? -3 : 0;     // 滑過時微微浮起
  noStroke();
  if (hovered) {
    drawingContext.shadowBlur  = 22;  // 滑過時外圍發光
    drawingContext.shadowColor = bgCol;
  }
  fill(hovered ? lerpColor(bgCol, color(255), 0.3) : bgCol);
  rect(btn.x, btn.y + lift, btn.w, btn.h, 10);
  drawingContext.shadowBlur = 0;

  fill(textCol); textSize(18); textAlign(CENTER, CENTER); textStyle(BOLD);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + lift);
}

function isHovered(btn) {
  return mouseX >= btn.x && mouseX <= btn.x + btn.w &&
         mouseY >= btn.y && mouseY <= btn.y + btn.h;
}

function clamp(val, lo, hi) {
  return max(lo, min(hi, val));
}

// 主背景 + 朝中心暈染的主題色光暈，用於區分各關卡氛圍
function drawThemedBackground(themeCol) {
  background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);
  noStroke();
  for (let i = 3; i >= 1; i--) {
    fill(red(themeCol), green(themeCol), blue(themeCol), 5 * i);
    circle(width * 0.5, height * 0.46, max(width, height) * 0.22 * i);
  }
}

// 帶發光效果的文字（呼叫前請先設定 textAlign / textStyle）
function drawGlowText(str, x, y, size, fillCol, glowCol, glowAmt) {
  textSize(size);
  noStroke();
  drawingContext.shadowBlur  = glowAmt;
  drawingContext.shadowColor = glowCol;
  fill(fillCol);
  text(str, x, y);
  drawingContext.shadowBlur = 0;
}

// ─── 點擊處理 ────────────────────────────────────────────
function mouseClicked() {
  if (!audioStarted) {            // 瀏覽器需使用者手勢才能播放音訊
    userStartAudio();
    audioStarted = true;
  }

  if (gameState === 'start') {
    if (isHovered(buttons.start)) gameState = 'select';

  } else if (gameState === 'select') {
    for (let i = 0; i < buttons.level.length; i++) {
      if (isHovered(buttons.level[i])) {
        currentLevel = i + 1;
        gameState    = 'playing';
        if (currentLevel === 1) resetLevel1();
        if (currentLevel === 2) resetLevel2();
        if (currentLevel === 3) resetLevel3();
      }
    }

  } else if (gameState === 'playing') {
    if (isCurrentLevelCleared() && isHovered(buttons.backSelect)) {
      gameState = 'select';
    } else if (!isCurrentLevelCleared() && isHovered(buttons.back)) {
      gameState = 'select';
    }
  }
}
