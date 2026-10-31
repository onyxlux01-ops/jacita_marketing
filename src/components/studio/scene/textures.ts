import * as THREE from "three";
import type { Bubble } from "./director";

/*
 * Procedural artwork for the studio: everything is drawn once into canvases at
 * load time, so the feature ships no image assets and needs no services.
 */

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  let tex = cache.get(key);
  if (!tex) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(key, tex);
  }
  return tex;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const FONT = "600 {s}px Manrope, ui-sans-serif, system-ui, sans-serif";
const font = (s: number, weight = 600) => FONT.replace("600", String(weight)).replace("{s}", String(s));

function boardFrame(ctx: CanvasRenderingContext2D, w: number, h: number, title: string) {
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1f2c4d";
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = "#e9d9a6";
  ctx.font = font(22, 700);
  ctx.textBaseline = "middle";
  ctx.fillText(title, 18, 23);
  ctx.fillStyle = "#c9a24a";
  ctx.beginPath();
  ctx.arc(w - 26, 22, 9, 0, Math.PI * 2);
  ctx.fill();
}

function photo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sky: string, hill: string) {
  ctx.save();
  rounded(ctx, x, y, w, h, 6);
  ctx.clip();
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#f7e3a3";
  ctx.beginPath();
  ctx.arc(x + w * 0.72, y + h * 0.32, h * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hill;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.35, y + h * 0.45);
  ctx.lineTo(x + w * 0.6, y + h * 0.75);
  ctx.lineTo(x + w * 0.8, y + h * 0.55);
  ctx.lineTo(x + w, y + h);
  ctx.fill();
  ctx.restore();
}

function lines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, count: number, color = "#b9b1a0") {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    rounded(ctx, x, y + i * 14, w * (i === count - 1 ? 0.6 : 1 - (i % 3) * 0.08), 7, 3);
    ctx.fill();
  }
}

export function brandBoardTexture() {
  return make("board:brand", 512, 384, (ctx) => {
    boardFrame(ctx, 512, 384, "BRAND BOARD");
    ["#1f2c4d", "#c9a24a", "#f3ecdd", "#2ac2a8", "#7a5a7c"].forEach((c, i) => {
      ctx.fillStyle = c;
      rounded(ctx, 20 + i * 52, 64, 44, 44, 8);
      ctx.fill();
      ctx.strokeStyle = "#d8cfbd";
      ctx.stroke();
    });
    ctx.fillStyle = "#1f2c4d";
    ctx.beginPath();
    ctx.arc(400, 110, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a24a";
    ctx.font = font(56, 800);
    ctx.textAlign = "center";
    ctx.fillText("J", 400, 114);
    ctx.textAlign = "left";
    ctx.fillStyle = "#1f2c4d";
    ctx.font = font(48, 700);
    ctx.fillText("Aa", 22, 160);
    lines(ctx, 100, 140, 170, 2);
    photo(ctx, 20, 200, 150, 110, "#9cc3d5", "#5f7d67");
    photo(ctx, 182, 200, 150, 110, "#e8c4a8", "#7a5a7c");
    photo(ctx, 344, 200, 150, 110, "#c5d9c0", "#2f6f6a");
    lines(ctx, 20, 328, 470, 3);
  });
}

export function creativeBoardTexture() {
  return make("board:creative", 512, 384, (ctx) => {
    boardFrame(ctx, 512, 384, "DRAFTS · VISUALS");
    photo(ctx, 18, 60, 150, 150, "#f2d29b", "#b4562c");
    photo(ctx, 180, 60, 150, 150, "#a9cfe0", "#1f2c4d");
    // Video frame with play button.
    ctx.fillStyle = "#1d2230";
    rounded(ctx, 342, 60, 152, 150, 8);
    ctx.fill();
    ctx.fillStyle = "#f6f1e6";
    ctx.beginPath();
    ctx.moveTo(402, 110);
    ctx.lineTo(402, 160);
    ctx.lineTo(442, 135);
    ctx.fill();
    ctx.fillStyle = "#2ac2a8";
    ctx.fillRect(352, 194, 90, 6);
    // Caption cards.
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = "#ffffff";
      rounded(ctx, 18 + i * 246, 226, 230, 138, 8);
      ctx.fill();
      ctx.fillStyle = "#1f2c4d";
      ctx.font = font(18, 700);
      ctx.fillText(i ? "Hook" : "Caption", 32 + i * 246, 248);
      lines(ctx, 32 + i * 246, 266, 196, 5);
    }
  });
}

export function reviewBoardTexture() {
  return make("board:review", 512, 384, (ctx) => {
    boardFrame(ctx, 512, 384, "REVIEW CHECKLIST");
    photo(ctx, 18, 60, 140, 120, "#f2d29b", "#b4562c");
    photo(ctx, 172, 60, 140, 120, "#a9cfe0", "#1f2c4d");
    const items = ["Brand voice", "Approved facts", "Image rights", "Call to action", "Hashtags"];
    items.forEach((label, i) => {
      const y = 205 + i * 34;
      ctx.fillStyle = i === 3 ? "#e07a5f" : "#47c27a";
      rounded(ctx, 22, y, 24, 24, 6);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (i === 3) {
        ctx.moveTo(28, y + 6);
        ctx.lineTo(40, y + 18);
        ctx.moveTo(40, y + 6);
        ctx.lineTo(28, y + 18);
      } else {
        ctx.moveTo(27, y + 12);
        ctx.lineTo(32, y + 18);
        ctx.lineTo(41, y + 6);
      }
      ctx.stroke();
      ctx.fillStyle = "#2a3346";
      ctx.font = font(18, 600);
      ctx.fillText(label, 58, y + 13);
    });
    ctx.fillStyle = "#1f2c4d";
    rounded(ctx, 330, 64, 164, 116, 8);
    ctx.fill();
    ctx.fillStyle = "#e9d9a6";
    ctx.font = font(16, 700);
    ctx.fillText("NEEDS YOU", 350, 92);
    lines(ctx, 350, 112, 124, 4, "#55648a");
    ctx.fillStyle = "#e2a83c";
    rounded(ctx, 330, 200, 164, 160, 8);
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
    lines(ctx, 346, 220, 130, 8);
  });
}

export function calendarBoardTexture() {
  return make("board:calendar", 512, 384, (ctx) => {
    boardFrame(ctx, 512, 384, "PUBLISHING CALENDAR");
    const cols = 7;
    const cw = 68;
    const ch = 52;
    ctx.font = font(13, 700);
    ["M", "T", "W", "T", "F", "S", "S"].forEach((d, i) => {
      ctx.fillStyle = "#7d7563";
      ctx.fillText(d, 22 + i * cw + 26, 62);
    });
    const cards: Record<number, string> = { 2: "#2ac2a8", 4: "#c9a24a", 8: "#6ea8e6", 11: "#2ac2a8", 15: "#c9a24a", 17: "#7a5a7c", 22: "#6ea8e6", 24: "#2ac2a8" };
    for (let i = 0; i < 28; i++) {
      const x = 16 + (i % cols) * cw;
      const y = 76 + Math.floor(i / cols) * ch + 4;
      ctx.fillStyle = "#ffffff";
      rounded(ctx, x, y, cw - 8, ch - 8, 6);
      ctx.fill();
      ctx.fillStyle = "#b9b1a0";
      ctx.font = font(11, 600);
      ctx.fillText(String(i + 1), x + 6, y + 12);
      const card = cards[i];
      if (card) {
        ctx.fillStyle = card;
        rounded(ctx, x + 6, y + 20, cw - 20, 18, 4);
        ctx.fill();
      }
    }
  });
}

export function analyticsBoardTexture() {
  return make("board:analytics", 512, 384, (ctx) => {
    boardFrame(ctx, 512, 384, "PERFORMANCE · LEADS");
    ctx.fillStyle = "#ffffff";
    rounded(ctx, 18, 60, 300, 190, 8);
    ctx.fill();
    ctx.strokeStyle = "#e5ddcc";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(34, 90 + i * 40);
      ctx.lineTo(304, 90 + i * 40);
      ctx.stroke();
    }
    const pts = [210, 196, 204, 170, 176, 140, 118, 124, 92];
    ctx.strokeStyle = "#2ac2a8";
    ctx.lineWidth = 5;
    ctx.beginPath();
    pts.forEach((y, i) => (i ? ctx.lineTo(40 + i * 32, y) : ctx.moveTo(40, y)));
    ctx.stroke();
    ctx.fillStyle = "#c9a24a";
    [70, 110, 90, 140, 120, 160].forEach((h, i) => {
      rounded(ctx, 30 + i * 46, 360 - h * 0.6 - 20, 30, h * 0.6, 4);
      ctx.fill();
    });
    // Lead inbox.
    ctx.fillStyle = "#1f2c4d";
    rounded(ctx, 332, 60, 162, 300, 8);
    ctx.fill();
    ctx.fillStyle = "#e9d9a6";
    ctx.font = font(16, 700);
    ctx.fillText("LEAD INBOX", 350, 86);
    for (let i = 0; i < 4; i++) {
      const y = 106 + i * 62;
      ctx.fillStyle = i === 0 ? "#b58bd8" : "#2c3c63";
      rounded(ctx, 344, y, 138, 50, 6);
      ctx.fill();
      ctx.fillStyle = "#f6f1e6";
      ctx.fillRect(354, y + 12, 24, 18);
      ctx.strokeStyle = i === 0 ? "#b58bd8" : "#2c3c63";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(354, y + 12);
      ctx.lineTo(366, y + 22);
      ctx.lineTo(378, y + 12);
      ctx.stroke();
      lines(ctx, 388, y + 12, 84, 2, i === 0 ? "#efe3fa" : "#55648a");
    }
  });
}

export function screenTexture(kind: "brief" | "content" | "review" | "publishing" | "analytics") {
  return make(`screen:${kind}`, 256, 160, (ctx) => {
    ctx.fillStyle = "#14203a";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = "#1f2c4d";
    ctx.fillRect(0, 0, 256, 22);
    ctx.fillStyle = "#c9a24a";
    ctx.fillRect(10, 8, 34, 6);
    if (kind === "content") {
      photo(ctx, 12, 32, 110, 80, "#f2d29b", "#b4562c");
      lines(ctx, 134, 36, 110, 5, "#55648a");
    } else if (kind === "analytics") {
      ctx.strokeStyle = "#2ac2a8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      [120, 110, 116, 92, 96, 70, 52].forEach((y, i) => (i ? ctx.lineTo(16 + i * 36, y) : ctx.moveTo(16, y)));
      ctx.stroke();
    } else if (kind === "publishing") {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 4 === 1 ? "#2ac2a8" : "#2c3c63";
        rounded(ctx, 12 + (i % 4) * 60, 32 + Math.floor(i / 4) * 40, 52, 32, 4);
        ctx.fill();
      }
    } else lines(ctx, 14, 36, 228, 7, "#55648a");
  });
}

export function woodTexture() {
  const tex = make("floor:wood", 512, 512, (ctx) => {
    const tones = ["#c99b6a", "#c3955f", "#cfa476", "#bf8f5c", "#c79a68"];
    const rowH = 64;
    for (let row = 0; row < 8; row++) {
      let x = row % 2 ? -120 : 0;
      while (x < 512) {
        const len = 180 + ((row * 37 + x) % 140);
        ctx.fillStyle = tones[(row + Math.floor(x / 97)) % tones.length];
        ctx.fillRect(x, row * rowH, len, rowH);
        ctx.fillStyle = "rgba(90,58,30,0.35)";
        ctx.fillRect(x, row * rowH, 2, rowH);
        x += len;
      }
      ctx.fillStyle = "rgba(90,58,30,0.4)";
      ctx.fillRect(0, row * rowH, 512, 2);
      ctx.strokeStyle = "rgba(255,240,215,0.08)";
      for (let g = 0; g < 4; g++) {
        ctx.beginPath();
        ctx.moveTo(0, row * rowH + 12 + g * 13);
        ctx.bezierCurveTo(170, row * rowH + 8 + g * 13, 340, row * rowH + 18 + g * 13, 512, row * rowH + 10 + g * 13);
        ctx.stroke();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function dashTexture(color: string) {
  const tex = make(`dash:${color}`, 128, 16, (ctx) => {
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = color;
    // Chevrons pointing along +u.
    for (let i = 0; i < 2; i++) {
      const x = i * 64 + 14;
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x + 18, 8);
      ctx.lineTo(x, 14);
      ctx.lineTo(x + 8, 8);
      ctx.closePath();
      ctx.fill();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

const BUBBLE_COLORS: Record<Exclude<Bubble, null>, string> = {
  waiting: "#e2a83c",
  scheduled: "#6ea8e6",
  blocked: "#e5534b",
  attention: "#b58bd8",
  done: "#47c27a",
  revision: "#e07a5f",
};

export function bubbleTexture(kind: Exclude<Bubble, null>) {
  return make(`bubble:${kind}`, 128, 128, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(64, 68, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.arc(64, 62, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BUBBLE_COLORS[kind];
    ctx.beginPath();
    ctx.arc(64, 62, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    switch (kind) {
      case "waiting":
        ctx.moveTo(46, 38);
        ctx.lineTo(82, 38);
        ctx.lineTo(46, 86);
        ctx.lineTo(82, 86);
        ctx.closePath();
        ctx.stroke();
        break;
      case "scheduled":
        ctx.arc(64, 62, 26, 0, Math.PI * 2);
        ctx.moveTo(64, 46);
        ctx.lineTo(64, 62);
        ctx.lineTo(76, 70);
        ctx.stroke();
        break;
      case "blocked":
      case "attention":
        ctx.moveTo(64, 36);
        ctx.lineTo(64, 70);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(64, 86, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "done":
        ctx.moveTo(44, 64);
        ctx.lineTo(58, 78);
        ctx.lineTo(86, 46);
        ctx.stroke();
        break;
      case "revision":
        ctx.arc(66, 66, 20, -Math.PI * 0.9, Math.PI * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(34, 52);
        ctx.lineTo(46, 40);
        ctx.lineTo(54, 56);
        ctx.closePath();
        ctx.fill();
        break;
    }
  });
}
