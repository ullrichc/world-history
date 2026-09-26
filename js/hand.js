/* A negative hand stencil, sprayed in red ochre the way it was done from Sulawesi to Patagonia:
   pigment blown around a hand held against the rock. */
(function () {
  const BB = window.BB;

  function handMask(w, h, s) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.scale(s, s);
    x.fillStyle = x.strokeStyle = '#000';
    x.lineCap = 'round';
    x.beginPath(); x.ellipse(130, 192, 46, 55, -0.12, 0, Math.PI * 2); x.fill();
    const lines = [
      [[132, 232], [134, 305], 64],
      [[92, 205], [44, 152], 27],
      [[106, 150], [88, 60], 22],
      [[129, 144], [127, 44], 23],
      [[151, 150], [165, 62], 21],
      [[166, 170], [203, 104], 18],
    ];
    for (const [[a, b], [c2, d], lw] of lines) { x.lineWidth = lw; x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); }
    return x.getImageData(0, 0, w, h).data;
  }

  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  BB.drawHand = function (canvas) {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth || 260, ch = canvas.clientHeight || 300;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    const k = (cw / 260) * dpr;
    const ctx = canvas.getContext('2d');
    const mask = handMask(canvas.width, canvas.height, k);
    const inside = (px, py) => {
      const i = (Math.floor(py) * canvas.width + Math.floor(px)) * 4 + 3;
      return mask[i] > 10;
    };
    const total = 16000;
    let done = 0;
    const batch = BB.reducedMotion() ? total : 420;
    const step = () => {
      for (let n = 0; n < batch && done < total; n++, done++) {
        const px = (130 + gauss() * 72) * k, py = (165 + gauss() * 78) * k;
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height || inside(px, py)) continue;
        const r = (0.35 + Math.random() * 1.5) * dpr;
        const a = 0.05 + Math.random() * 0.32;
        ctx.fillStyle = `rgba(${188 + Math.floor(Math.random() * 30)}, ${78 + Math.floor(Math.random() * 30)}, ${52 + Math.floor(Math.random() * 16)}, ${a})`;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
      if (done < total) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
})();
