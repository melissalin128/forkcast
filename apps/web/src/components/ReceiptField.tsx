import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../lib/motion';

const COUNT = 40;
const MAX_TILT = THREE.MathUtils.degToRad(6);

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Receipt {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  baseX: number;
  vy: number;
  vr: number;
  phase: number;
  sway: number;
}

/**
 * A slow-drifting field of translucent receipt-shaped planes behind the
 * landing headline. Transparent canvas, additive tangerine tint, pointer
 * parallax capped at 6 degrees, paused when off-screen, and completely still
 * under prefers-reduced-motion.
 */
export function ReceiptField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const host = canvas.parentElement ?? document.body;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      return; // no WebGL: the video + gradient still carry the hero
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.z = 14;
    const rig = new THREE.Group();
    scene.add(rig);

    const geometry = new THREE.PlaneGeometry(1, 2.6);
    const rand = seeded(20260911);
    const receipts: Receipt[] = [];
    for (let i = 0; i < COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xf0873f,
        transparent: true,
        opacity: 0.08 + rand() * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const s = 0.3 + rand() * 0.55;
      mesh.scale.set(s, s * (0.8 + rand() * 0.7), 1);
      const baseX = (rand() - 0.5) * 24;
      mesh.position.set(baseX, (rand() - 0.5) * 16, -6 + rand() * 9);
      mesh.rotation.set((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.9, (rand() - 0.5) * 0.5);
      rig.add(mesh);
      receipts.push({
        mesh,
        baseX,
        vy: 0.12 + rand() * 0.3,
        vr: (rand() - 0.5) * 0.22,
        phase: rand() * Math.PI * 2,
        sway: 0.15 + rand() * 0.35,
      });
    }

    const reduced = prefersReducedMotion();
    const target = { x: 0, y: 0 };

    const onPointer = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      target.x = THREE.MathUtils.clamp(ny * MAX_TILT, -MAX_TILT, MAX_TILT);
      target.y = THREE.MathUtils.clamp(nx * MAX_TILT, -MAX_TILT, MAX_TILT);
    };

    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduced) renderer.render(scene, camera);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let running = false;
    let visible = true;
    let last = performance.now();
    let t = 0;

    const frame = (now: number) => {
      if (!visible) {
        running = false;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      for (const r of receipts) {
        const p = r.mesh.position;
        p.y += r.vy * dt;
        if (p.y > 9) p.y = -9;
        p.x = r.baseX + Math.sin(t * r.sway + r.phase) * 0.6;
        r.mesh.rotation.z += r.vr * dt;
        r.mesh.rotation.y += r.vr * 0.5 * dt;
      }
      rig.rotation.x += (target.x - rig.rotation.x) * 0.06;
      rig.rotation.y += (target.y - rig.rotation.y) * 0.06;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      running = false;
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : visible && start());
    document.addEventListener('visibilitychange', onVisibility);

    renderer.render(scene, camera); // one static frame for reduced motion / first paint
    if (!reduced) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      start();
    }

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      geometry.dispose();
      receipts.forEach((r) => r.mesh.material.dispose());
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className="hero__canvas" aria-hidden="true" />;
}
