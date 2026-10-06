// face.js — 민서 에이전트 픽셀 얼굴 (안경)
// 상태(idle / listening / processing / speaking)에 따라 표정과 모션이 바뀐다.
// 이미지 파일이 아니라 픽셀 격자를 코드로 그려서 해상도가 자유롭고 모션을 넣을 수 있다.

(function () {
  // 32 x 18 격자, 한 칸 60px = 1920 x 1080.
  // 모니터 비율이 바뀌면 이 세 숫자만 고치면 된다.
  const COLS = 32, ROWS = 18, PX = 60;

  const C = {
    bg: "#F9503C",     // 배경 (토마토)
    ink: "#121212",    // 안경테 · 눈동자 · 입
    white: "#FFFFFF",  // 흰자
    pink: "#F2A3C4",   // 혀
    blush: "#FB8B79",  // 볼터치
  };
  const MAP = { "#": C.ink, w: C.white, W: C.white, p: C.pink, b: C.blush };

  // ===================== 스프라이트 ('.' 은 투명) =====================

  // 안경알 테두리 (11 x 10)
  const LENS = [
    "..#######..",
    ".#########.",
    "##.......##",
    "#.........#",
    "#.........#",
    "#.........#",
    "#.........#",
    "##.......##",
    ".#########.",
    "..#######..",
  ];

  // 눈알 내용 (7 x 5) — 안경알 안쪽에 그린다
  const EYE_IDLE = [     // 흰자 + 오른쪽 눈동자
    ".wwww..",
    "wwwwww.",
    "www##w.",
    "www##..",
    ".wwww..",
  ];
  const EYE_ROUND = [    // 정면을 똑바로 — 가운데 눈동자
    ".wwwww.",
    "wwwwwww",
    "ww###ww",
    "ww###ww",
    ".wwwww.",
  ];
  const EYE_BAR = [      // 가늘게 뜬 눈 — 가로 띠
    ".......",
    "wwwwwww",
    "ww###ww",
    "wwwwwww",
    ".......",
  ];
  const EYE_SHINE = [    // 눈동자에 하이라이트
    ".wwww..",
    "wwwwww.",
    "www#Ww.",
    "www##..",
    ".wwww..",
  ];
  const EYE_SHUT = ["#####"];   // 감은 눈

  // 입
  const MOUTH_IDLE = [   // 혀 살짝
    "#...#",
    "#####",
    ".#p#.",
    ".###.",
  ];
  const MOUTH_IDLE_UP = [ // 혀 집어넣음 (아랫줄 사라짐)
    "#...#",
    "#####",
    ".###.",
  ];
  const MOUTH_LINE = [   // 한일자 + 끝이 살짝 올라감
    "...#",
    "###.",
  ];
  const MOUTH_SMILE = [  // 작게 웃음
    "#...#",
    ".###.",
  ];
  // speaking — 크기를 키우는 게 아니라 아랫줄 픽셀이 생겼다 사라진다
  const MOUTH_SHUT = [
    ".###.",
    ".###.",
  ];
  const MOUTH_HALF = [
    ".###.",
    "#ppp#",
    ".###.",
  ];
  const MOUTH_WIDE = [
    ".###.",
    "#ppp#",
    "#ppp#",
    ".#p#.",
    "..#..",
  ];

  const BLUSH = [
    ".b.",
    "bbb",
    ".b.",
  ];

  // ===================== 배치 =====================
  const LENS_L_X = 4, LENS_R_X = 18, LENS_Y = 3;  // 안경알 (폭 11)
  const EYE_L_X = 6, EYE_R_X = 20, EYE_Y = 6;     // 눈알 (안경알 안쪽)
  const BRIDGE_Y = 7;                              // 안경 다리
  const MOUTH_CX = 16, MOUTH_Y = 14;
  const BLUSH_L_CX = 3, BLUSH_R_CX = 29, BLUSH_Y = 13;

  let cv, ctx, state = "idle", t0 = performance.now(), mouthLevel = 0;
  let lastLoudMouthAt = 0;   // 마지막으로 소리가 났던 시각

  function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * PX, y * PX, PX, PX);
  }

  function at(rows, gx, gy) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if (ch === ".") continue;
        px(gx + c, gy + r, MAP[ch] || C.ink);
      }
    }
  }

  // 가로 중심 기준 배치 (폭이 달라도 가운데가 안 흔들린다)
  function atC(rows, cx, gy) {
    at(rows, cx - Math.floor(rows[0].length / 2), gy);
  }

  // 안경테는 모든 상태에서 똑같이 그린다
  function glasses() {
    at(LENS, LENS_L_X, LENS_Y);
    at(LENS, LENS_R_X, LENS_Y);
    px(15, BRIDGE_Y, C.ink); px(16, BRIDGE_Y, C.ink); px(17, BRIDGE_Y, C.ink); // 콧대
    px(2, BRIDGE_Y, C.ink); px(3, BRIDGE_Y, C.ink);                            // 왼쪽 다리
    px(29, BRIDGE_Y, C.ink); px(30, BRIDGE_Y, C.ink);                          // 오른쪽 다리
  }

  function eyes(shape, blink) {
    if (blink) {
      at(EYE_SHUT, EYE_L_X + 1, EYE_Y + 2);
      at(EYE_SHUT, EYE_R_X + 1, EYE_Y + 2);
      return;
    }
    at(shape, EYE_L_X, EYE_Y);
    at(shape, EYE_R_X, EYE_Y);
  }

  // 주기의 '끝'에서 감는다. 시작에서 감으면 페이지를 열자마자 눈을 감고 있다.
  function blinking(periodMs, blinkMs) {
    return (performance.now() % periodMs) > periodMs - blinkMs;
  }

  function blush() {
    atC(BLUSH, BLUSH_L_CX, BLUSH_Y);
    atC(BLUSH, BLUSH_R_CX, BLUSH_Y);
  }

  // ===================== 상태별 =====================

  function drawIdle(t) {
    glasses();
    eyes(EYE_IDLE, blinking(7000, 260));       // 7초에 한 번 느린 깜빡임
    // 혀가 아주 느리게 들어갔다 나온다 (픽셀이 생겼다 사라지는 방식)
    atC(Math.floor(t / 1100) % 2 ? MOUTH_IDLE_UP : MOUTH_IDLE, MOUTH_CX, MOUTH_Y);
  }

  function drawListening() {
    glasses();
    eyes(EYE_ROUND, blinking(2600, 180));      // 크기 변화 없이 깜빡이기만
    blush();
    atC(MOUTH_LINE, MOUTH_CX, MOUTH_Y + 1);
  }

  function drawProcessing(t) {
    glasses();
    const blink = blinking(5200, 200);
    if (blink) {
      eyes(EYE_BAR, true);
    } else {
      // 눈동자가 좌우로 천천히 굴러간다 = 생각 중
      const shift = [0, 1, 2, 1][Math.floor(t / 380) % 4] - 1;
      at(EYE_BAR, EYE_L_X + shift, EYE_Y);
      at(EYE_BAR, EYE_R_X + shift, EYE_Y);
    }
    atC(MOUTH_SMILE, MOUTH_CX, MOUTH_Y + 1);
  }

  const MOUTH_SILENT_MS = 260;  // 이만큼 조용하면 입을 다문 것으로 본다
  const EYE_SWAP_MS = 700;      // 말하는 동안 눈이 정면 <-> 측면 바뀌는 주기

  function drawSpeaking(t) {
    // 입을 다물고 있으면(문장 사이 쉼, 말이 끝남) idle 얼굴로 돌아간다.
    // 짧은 쉼마다 깜빡이지 않게 260ms 는 버틴 뒤에 넘어간다.
    if (performance.now() - lastLoudMouthAt > MOUTH_SILENT_MS) {
      drawIdle(t);
      return;
    }

    glasses();
    // 눈: 정면과 측면을 번갈아 본다
    const front = Math.floor(t / EYE_SWAP_MS) % 2 === 1;
    eyes(front ? EYE_ROUND : EYE_SHINE, blinking(4400, 200));
    blush();

    // 입: 타이머가 아니라 '지금 나오는 목소리 크기'에 맞춰 벌어진다.
    // 윗줄을 고정해서 크기가 변하는 게 아니라 아랫줄 픽셀이 생겼다 사라지게 한다.
    const frame = mouthLevel > 0.075 ? MOUTH_WIDE
                : mouthLevel > 0.030 ? MOUTH_HALF
                : MOUTH_SHUT;
    atC(frame, MOUTH_CX, MOUTH_Y);
  }

  const DRAW = { idle: drawIdle, listening: drawListening, processing: drawProcessing, speaking: drawSpeaking };

  function loop() {
    const t = performance.now() - t0;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, COLS * PX, ROWS * PX);
    try { (DRAW[state] || drawIdle)(t); } catch (e) { /* 한 프레임 실패로 루프가 죽지 않게 */ }
    requestAnimationFrame(loop);
  }

  window.FACE = {
    mount(canvas) {
      cv = canvas;
      cv.width = COLS * PX;
      cv.height = ROWS * PX;
      ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      requestAnimationFrame(loop);
    },
    setState(s) { if (s !== state) { state = s; t0 = performance.now(); } },
    getState() { return state; },
    setLevel(v) { mouthLevel = v; if (v > 0.02) lastLoudMouthAt = performance.now(); },
    BG: C.bg,
  };
})();
