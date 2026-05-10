'use strict';
/* global window */

window.SKINS = [
  {
    id: 'default', name: 'Default', color: null,
    drawHead(_ctx, _x, _y, _r, _a) {},
    drawBodyMark(_ctx, _x, _y, _r) {},
  },
  {
    id: 'snowflake', name: 'Snowflake', color: '#93C5FD',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.25, -s * 0.75);
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(-s * 0.25, -s * 0.75);
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(2, r * 0.4);
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    id: 'fire', name: 'Fire', color: '#F97316',
    drawHead(ctx, x, y, r, a) {
      const s = r * 1.1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.bezierCurveTo(-s * 0.6, s * 0.1, -s * 0.5, -s * 0.6, 0, -s);
      ctx.bezierCurveTo(s * 0.5, -s * 0.6, s * 0.6, s * 0.1, 0, s * 0.5);
      ctx.fillStyle = '#F97316'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.2);
      ctx.bezierCurveTo(-s * 0.3, -s * 0.1, -s * 0.2, -s * 0.55, 0, -s * 0.72);
      ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 0.3, -s * 0.1, 0, s * 0.2);
      ctx.fillStyle = 'rgba(255,220,60,0.92)'; ctx.fill();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,60,0.55)'; ctx.fill();
    },
  },
  {
    id: 'neon', name: 'Neon', color: '#A855F7',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(240,240,80,0.95)';
      ctx.lineWidth = 3; ctx.shadowColor = 'rgba(240,240,80,0.8)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s); ctx.lineTo(-s * 0.15, -s * 0.08);
      ctx.lineTo(s * 0.2, -s * 0.08); ctx.lineTo(-s * 0.3, s);
      ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.35);
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(240,240,80,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s * 0.15, -s); ctx.lineTo(-s * 0.1, 0);
      ctx.lineTo(s * 0.1, 0); ctx.lineTo(-s * 0.15, s);
      ctx.stroke(); ctx.restore();
    },
  },
  {
    id: 'sakura', name: 'Sakura', color: '#F9A8D4',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * 2 * Math.PI) / 5 - Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.28, s * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,190,215,0.92)'; ctx.fill(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,230,100,0.95)'; ctx.fill();
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.32);
      ctx.save(); ctx.translate(x, y);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * 2 * Math.PI) / 5);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.58, s * 0.2, s * 0.34, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,190,215,0.45)'; ctx.fill(); ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    id: 'cyber', name: 'Cyber', color: '#06B6D4',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(0,255,255,0.92)'; ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(0,255,255,0.7)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 - Math.PI / 6;
        i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
                : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
      }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,255,255,0.9)'; ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.28);
      ctx.fillStyle = 'rgba(0,255,255,0.35)';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    },
  },
  {
    id: 'venom', name: 'Venom', color: '#7C3AED',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.72, Math.PI, 0);
      ctx.lineTo(s * 0.52, s * 0.32); ctx.lineTo(-s * 0.52, s * 0.32);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      for (const dx of [-s * 0.26, s * 0.26]) {
        ctx.beginPath(); ctx.arc(dx, -s * 0.18, s * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(60,0,100,0.95)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,0,100,0.75)'; ctx.fill();
      ctx.fillStyle = 'rgba(60,0,100,0.82)';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * s * 0.33 - s * 0.09, s * 0.2, s * 0.18, s * 0.27);
      }
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    },
  },
  {
    id: 'ocean', name: 'Ocean', color: '#0EA5E9',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-s, 0);
      for (let i = 0; i <= 12; i++) {
        const wx = -s + (i / 12) * s * 2;
        const wy = Math.sin(i * Math.PI * 0.75) * s * 0.5;
        ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s, s * 0.38);
      for (let i = 0; i <= 12; i++) {
        const wx = -s + (i / 12) * s * 2;
        const wy = s * 0.38 + Math.sin(i * Math.PI * 0.75 + Math.PI * 0.5) * s * 0.3;
        ctx.lineTo(wx, wy);
      }
      ctx.stroke(); ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.3);
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    },
  },
  {
    id: 'galaxy', name: 'Galaxy', color: '#6366F1',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (i * Math.PI) / 5 - Math.PI / 2;
        const len = i % 2 === 0 ? s : s * 0.4;
        const px = Math.cos(ang) * len, py = Math.sin(ang) * len;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,200,0.92)';
      ctx.shadowColor = 'rgba(255,255,200,0.8)'; ctx.shadowBlur = 12;
      ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.26);
      ctx.save(); ctx.translate(x, y); ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 - Math.PI / 2;
        const len = i % 2 === 0 ? s : s * 0.4;
        const px = Math.cos(ang) * len, py = Math.sin(ang) * len;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(255,255,200,0.42)'; ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'gold', name: 'Gold', color: '#FACC15',
    drawHead(ctx, x, y, r, a) {
      const s = r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, s * 0.4); ctx.lineTo(-s * 0.85, -s * 0.05);
      ctx.lineTo(-s * 0.55, -s * 0.72);
      ctx.lineTo(-s * 0.22, -s * 0.15);
      ctx.lineTo(0, -s);
      ctx.lineTo(s * 0.22, -s * 0.15);
      ctx.lineTo(s * 0.55, -s * 0.72);
      ctx.lineTo(s * 0.85, -s * 0.05);
      ctx.lineTo(s * 0.85, s * 0.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,215,50,0.92)'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,140,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      for (const [gx, gy] of [[0, -s * 0.1], [-s * 0.52, s * 0.12], [s * 0.52, s * 0.12]]) {
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,80,80,0.88)'; ctx.fill();
      }
      ctx.restore();
    },
    drawBodyMark(ctx, x, y, r) {
      const s = Math.max(1.5, r * 0.3);
      ctx.save(); ctx.translate(x, y); ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0);
      ctx.closePath(); ctx.fillStyle = 'rgba(255,220,50,0.42)'; ctx.fill();
      ctx.restore();
    },
  },
];

window.SKINS_MAP = Object.fromEntries(window.SKINS.map(s => [s.id, s]));
