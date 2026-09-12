import { animate, stagger } from 'animejs';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PinIcon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { ReceiptField } from '../components/ReceiptField';
import { PLATFORMS, ZIP } from '../data/mock';
import { prefersReducedMotion } from '../lib/motion';

export function Landing() {
  const navigate = useNavigate();
  const [zip, setZip] = useState(ZIP);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
    if (prefersReducedMotion()) {
      targets.forEach((t) => (t.style.opacity = '1'));
      return;
    }
    const anim = animate(targets, {
      translateY: [12, 0],
      opacity: [0, 1],
      duration: 900,
      delay: stagger(60, { start: 80 }),
      ease: 'outExpo',
    });
    return () => {
      anim.cancel();
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set('zip', zip.trim() || ZIP);
    if (q.trim()) params.set('q', q.trim());
    navigate(`/browse?${params.toString()}`);
  };

  return (
    <main className="hero" ref={rootRef}>
      <video
        className="hero__video"
        src="/hero.mp4"
        poster="/hero.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="hero__grad" aria-hidden="true" />
      <ReceiptField />

      <nav className="hero__nav">
        <Logo size={24} />
        <div className="hero__links">
          <a href="#how">How it works</a>
          <a href="#history">Price history</a>
          <a href="#signin" className="btn">
            Sign in
          </a>
        </div>
      </nav>

      <section className="hero__copy">
        <div className="hero__live reveal">
          <span className="dot" style={{ background: 'var(--win)' }} />
          <span>Live across 3 platforms</span>
        </div>
        <h1 className="hero__h1">
          <span className="reveal">Same food.</span>
          <span className="reveal">Three prices.</span>
          <span className="reveal accent">One answer.</span>
        </h1>
        <p className="hero__lede reveal">
          Forkcast compares the true delivered total on DoorDash, Uber Eats and Grubhub, applies
          your subscriptions and every live promo, and tells you which hour is cheapest to order.
        </p>

        <form className="searchbar reveal" onSubmit={submit} role="search">
          <label className="searchbar__zip">
            <PinIcon stroke="#a39c92" size={18} />
            <span className="sr-only">Zip code</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              inputMode="numeric"
              placeholder="15213"
              aria-label="Zip code"
            />
          </label>
          <span className="searchbar__sep" aria-hidden="true" />
          <label className="searchbar__q">
            <span className="sr-only">What are you hungry for?</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ramen, tacos, a place…"
              aria-label="Cuisine, dish or restaurant"
            />
          </label>
          <button type="submit" className="searchbar__go">
            Compare
          </button>
        </form>

        <div className="hero__platforms reveal">
          {PLATFORMS.map((p) => (
            <span key={p.slug}>
              <span className="dot" style={{ background: p.brandColor }} />
              {p.name}
            </span>
          ))}
        </div>
      </section>

      <section className="hero__stats" aria-label="Forkcast at a glance">
        <div className="stat reveal">
          <span className="stat__n win">$6.40</span>
          <span className="stat__l">avg. saved per order</span>
        </div>
        <div className="stat reveal">
          <span className="stat__n">7 days</span>
          <span className="stat__l">of price history per restaurant</span>
        </div>
        <div className="stat reveal">
          <span className="stat__n">2–4 pm</span>
          <span className="stat__l">typical cheapest window</span>
        </div>
      </section>
    </main>
  );
}
