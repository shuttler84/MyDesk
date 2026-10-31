// 生成 MyDesk 应用图标：薄荷渐变圆角方块 + 白色 M
import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'

const S = 512
const png = new PNG({ width: S, height: S })

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const l2 = dx * dx + dy * dy
  let t = ((px - x1) * dx + (py - y1) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx, cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

const R = 96 // 圆角半径
const strokes = [
  [150, 372, 150, 150],
  [150, 150, 256, 296],
  [256, 296, 362, 150],
  [362, 150, 362, 372]
]
const HALF = 21

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const idx = (S * y + x) << 2
    // 圆角矩形 mask
    const cx = Math.max(R, Math.min(S - R, x))
    const cy = Math.max(R, Math.min(S - R, y))
    const inside = Math.hypot(x - cx, y - cy) <= R || (x >= R && x <= S - R) || (y >= R && y <= S - R)
    if (!inside) {
      png.data[idx + 3] = 0
      continue
    }
    // 垂直渐变：薄荷绿
    const t = y / S
    let r = Math.round(95 + (47 - 95) * t)
    let g = Math.round(191 + (125 - 191) * t)
    let b = Math.round(143 + (92 - 143) * t)
    // 白色 M
    let onM = false
    for (const [x1, y1, x2, y2] of strokes) {
      if (distToSeg(x, y, x1, y1, x2, y2) <= HALF) { onM = true; break }
    }
    if (onM) { r = 255; g = 255; b = 255 }
    png.data[idx] = r
    png.data[idx + 1] = g
    png.data[idx + 2] = b
    png.data[idx + 3] = 255
  }
}

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', PNG.sync.write(png))
console.log('icon written: build/icon.png (512x512)')
