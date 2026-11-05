import { useEffect, useRef, useState } from "react";

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// A strip-warped bitmap keeps the card artwork attached to its curved surface.
export function RiffleDeck({ duration }: { duration: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 240 * ratio;
    canvas.height = 160 * ratio;
    ctx.scale(ratio, ratio);
    const texture = document.createElement("canvas");
    texture.width = 140;
    texture.height = 88;
    const ink = texture.getContext("2d");
    const art = new Image();
    art.src = `${import.meta.env.BASE_URL}donkey-golden-intro.png`;
    let alive = true;
    let textured = false;
    art.onload = () => {
      if (!alive || !ink) return;
      ink.fillStyle = "#fff5dc";
      ink.fillRect(0, 0, 140, 88);
      ink.save();
      ink.translate(70, 44);
      ink.rotate(Math.PI / 2);
      ink.drawImage(art, -40, -66, 80, 132);
      ink.restore();
      textured = true;
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const started = performance.now();
    let frame = 0;

    function draw(now: number) {
      if (!ctx) return;
      const t = reduced.matches ? 1 : Math.min(1, (now - started) / duration);
      ctx.clearRect(0, 0, 240, 160);
      ctx.save();
      ctx.translate(120, 85);
      const finish = ease((t - .8) / .2);
      ctx.rotate(-Math.PI / 2 * finish);
      const merge = ease((t - .38) / .38);
      const lift = ease(t / .15) * (1 - ease((t - .22) / .22));
      const bridge = Math.sin(Math.PI * ease((t - .48) / .34));

      ctx.fillStyle = "#001b1655";
      ctx.beginPath();
      ctx.ellipse(0, 17, 80 - merge * 38, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      // Alternate left/right layers so they visibly interleave at the meeting edge.
      for (let layer = 0; layer < 10; layer++) {
        for (const side of [-1, 1]) {
          const center = side * 37 * (1 - merge);
          const depth = 44;
          const width = 70;
          const release = ease((t - .24 - layer * .009) / .15);
          const bend = lift * (1 - release) * 24;
          const y = 8 - layer * 1.15 - (side === 1 ? .45 : 0);
          const curve = (u: number) => {
            const inner = side === -1 ? u : 1 - u;
            return y - bend * inner * inner - bridge * (10 + layer * .9) * Math.sin(Math.PI * u);
          };
          ctx.beginPath();
          for (let j = 0; j <= 24; j++) {
            const u = j / 24;
            const x = center + (u - .5) * width;
            if (j === 0) ctx.moveTo(x, curve(u) - depth / 2);
            else ctx.lineTo(x, curve(u) - depth / 2);
          }
          for (let j = 24; j >= 0; j--) {
            const u = j / 24;
            ctx.lineTo(center + (u - .5) * width, curve(u) + depth / 2);
          }
          ctx.closePath();
          ctx.fillStyle = layer === 9 ? "#075434" : "#f9f2dc";
          ctx.fill();
          ctx.strokeStyle = "#a6aeaa";
          ctx.lineWidth = .65;
          ctx.stroke();

          if (layer === 9 && textured) {
            ctx.save();
            ctx.clip();
            for (let j = 0; j < 32; j++) {
              const u = j / 32;
              const next = (j + 1) / 32;
              const dx = width / 32;
              ctx.save();
              ctx.transform(1, (curve(next) - curve(u)) / dx, 0, 1,
                center + (u - .5) * width, curve(u) - depth / 2);
              ctx.drawImage(texture, u * 140, 0, 140 / 32, 88, 0, 0, dx + .3, depth);
              ctx.restore();
            }
            ctx.restore();
          }
        }
      }
      ctx.restore();
      setPainted(true);
      if (alive && (t < 1 || (!textured && !art.complete))) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(frame); art.onload = null; };
  }, [duration]);
  return <div className="riffle-deck" aria-hidden="true">
    {!painted && <img src={`${import.meta.env.BASE_URL}donkey-golden-intro.png`} alt="" />}
    <canvas ref={ref} />
  </div>;
}
