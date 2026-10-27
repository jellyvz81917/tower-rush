import { CONFIG } from '../config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('Canvas 2D недоступен в этом браузере.');
    this.width = 0;
    this.height = 0;
    this.effects = [];
    this.age = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.text = value => value;
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
    this.width = box.width;
    this.height = box.height;
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset() { this.effects = []; this.age = 0; }
  event(event) {
    if (this.reduced || !event.cut) return;
    this.effects.push({ ...event.cut, floor: event.floor, age: 0 });
    this.effects = this.effects.slice(-12);
  }
  update(ms) {
    this.age += ms;
    for (const effect of this.effects) effect.age += ms;
    this.effects = this.effects.filter(effect => effect.age < 650);
  }

  draw(game, preview = false) {
    const c = this.context;
    const w = this.width, h = this.height;
    if (!w || !h) return;
    c.clearRect(0, 0, w, h);
    const background = c.createLinearGradient(0, 0, w, h);
    background.addColorStop(0, '#122237');
    background.addColorStop(0.6, '#101e30');
    background.addColorStop(1, '#0a1727');
    c.fillStyle = background;
    c.fillRect(0, 0, w, h);
    const halo = c.createRadialGradient(w * .53, h * .35, 0, w * .53, h * .35, Math.max(w, h) * .6);
    halo.addColorStop(0, '#284a4c4d'); halo.addColorStop(1, '#10203000');
    c.fillStyle = halo; c.fillRect(0, 0, w, h);

    c.strokeStyle = '#698da00b'; c.lineWidth = 1;
    for (let x = 25; x < w; x += 32) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, h); c.stroke(); }
    for (let y = 40; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let i = 0; i < 22; i += 1) {
      const x = (i * 127 + 31) % w, y = 60 + ((i * 67) % Math.max(1, h * .45));
      c.fillStyle = i % 3 ? '#abc5d125' : '#abc5d14a'; c.fillRect(x, y, 1.5, 1.5);
    }

    this.city(c, w, h);
    const scale = Math.min((w - 32) / 360, h / 430, 1.65);
    const offset = (w - 360 * scale) / 2;
    const floorHeight = CONFIG.floorHeight * scale;
    const base = preview ? h * .57 : h * .8;
    const camera = preview ? 0 : Math.max(0, (game.floors + 1) * floorHeight - h * .43);
    const yFor = floor => base - floor * floorHeight + camera;
    const demo = [
      { x: 65000, width: 230000 }, { x: 65000, width: 230000 },
      { x: 78000, width: 217000 }, { x: 78000, width: 204000 },
      { x: 90000, width: 192000 }, { x: 90000, width: 182000 },
      { x: 90000, width: 182000 },
    ].map((block, floor) => ({ ...block, floor }));
    const blocks = preview ? demo : game.blocks;

    // Keep the foundation visible without retaining the whole tower in memory.
    if (!preview && blocks[0].floor > 0) {
      const first = blocks[0];
      c.fillStyle = '#23424c';
      c.fillRect(offset + first.x / 1000 * scale, yFor(first.floor), first.width / 1000 * scale, h);
    }
    for (const block of blocks) {
      const y = yFor(block.floor);
      if (y < -floorHeight || y > h + floorHeight) continue;
      this.block(c, offset + block.x / 1000 * scale, y, block.width / 1000 * scale, floorHeight - 2 * scale, block.floor, false);
    }

    if (preview) {
      this.block(c, offset + 112 * scale, yFor(7) - 9 * scale, 182 * scale, floorHeight - 2 * scale, 7, true);
      c.fillStyle = '#8cadb34d'; c.font = '9px Segoe UI, sans-serif'; c.textAlign = 'center';
      if (h > 500) c.fillText(this.text('КАЖДЫЙ ЭТАЖ ИМЕЕТ ЗНАЧЕНИЕ'), w / 2, yFor(7) - 30 * scale);
    } else if (game.phase !== 'settling') {
      const y = yFor(game.floors + 1);
      c.setLineDash([3, 5]); c.strokeStyle = '#70f0c84d';
      c.strokeRect(offset + game.top.x / 1000 * scale, y, game.top.width / 1000 * scale, floorHeight - 2 * scale);
      c.setLineDash([]);
      this.block(c, offset + game.moving.x / 1000 * scale, y, game.moving.width / 1000 * scale,
        floorHeight - 2 * scale, game.floors + 1, true, game.phase === 'failed');
    }
    for (const piece of this.effects) {
      const t = piece.age / 1000;
      c.save(); c.globalAlpha = Math.max(0, 1 - piece.age / 650);
      const x = offset + piece.x / 1000 * scale + piece.direction * t * 40 * scale;
      const y = yFor(piece.floor) + t * t * 850 * scale;
      c.translate(x, y); c.rotate(piece.direction * t * 1.2);
      this.block(c, 0, 0, piece.width / 1000 * scale, floorHeight - 2 * scale, piece.floor, false);
      c.restore();
    }
    if (!preview && game.floors < 6) {
      c.fillStyle = '#6c8a9d'; c.font = '8px Segoe UI, sans-serif'; c.textAlign = 'center';
      c.fillText(this.text('ФУНДАМЕНТ'), w / 2, base + floorHeight + 17);
    }
  }

  block(c, x, y, width, height, floor, moving, failed = false) {
    const colors = ['#5edbc1', '#64d0c7', '#70c2d0', '#7eb3d8', '#a0b0e1', '#8ac8d8'];
    const color = failed ? '#ef887f' : moving ? '#ffcda0' : colors[Math.floor(floor / 3) % colors.length];
    c.save();
    c.shadowColor = moving ? '#ffcda033' : '#61dcc522'; c.shadowBlur = moving ? 17 : 9;
    c.fillStyle = color; c.fillRect(x, y, width, height); c.shadowBlur = 0;
    c.fillStyle = '#ffffff48'; c.fillRect(x, y, width, Math.max(1, height * .12));
    c.fillStyle = '#08223435'; c.fillRect(x, y + height * .7, width, height * .3);
    c.fillStyle = '#0822341c';
    const spacing = Math.max(7, height * .7);
    for (let wx = x + spacing; wx < x + width - 3; wx += spacing) c.fillRect(wx, y + height * .34, 2, height * .25);
    c.restore();
  }

  city(c, w, h) {
    const horizon = h * .79;
    for (let layer = 0; layer < 2; layer += 1) {
      for (let i = 0; i < 14; i += 1) {
        const bw = w / 10 + 10;
        const x = i * (w / 12) - 15 + layer * 20;
        const bh = (20 + (i * 47 + layer * 31) % 110) * (h / 700);
        const y = horizon - bh + layer * 55;
        c.fillStyle = layer ? '#101f30' : '#172c3b'; c.fillRect(x, y, bw - 8, h - y);
        c.strokeStyle = '#36506333'; c.strokeRect(x, y, bw - 8, h - y);
        for (let wy = y + 12; wy < horizon + 40; wy += 14) {
          for (let wx = x + 10; wx < x + bw - 15; wx += 13) {
            c.fillStyle = ((Math.round(wx + wy) + i) % 4) ? '#44657518' : '#86bead45';
            c.fillRect(wx, wy, 3, 4);
          }
        }
      }
    }
  }
}
