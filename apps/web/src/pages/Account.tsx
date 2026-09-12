import { useState } from 'react';
import { BottomTabs } from '../components/BottomTabs';
import { PlatformDot } from '../components/PlatformDot';
import { TopBar } from '../components/TopBar';
import { PLATFORMS } from '../data/mock';
import { usePrefs } from '../hooks/usePrefs';
import { zipLabel } from '../lib/prefs';

/** Zip + subscription toggles. Both feed every total in the app. */
export function Account() {
  const { prefs, setZip, toggleSubscription } = usePrefs();
  const [draft, setDraft] = useState(prefs.zip);
  const valid = /^\d{5}$/.test(draft);

  return (
    <div className="page">
      <TopBar title="Account" />

      <section className="card card--gap" aria-labelledby="zip-title">
        <h3 id="zip-title" className="card__title">
          Deliver to
        </h3>
        <form
          className="zipform"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setZip(draft);
          }}
        >
          <input
            className="input mono"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
            aria-label="Zip code"
          />
          <button type="submit" className="btn btn--accent" disabled={!valid || draft === prefs.zip}>
            Save
          </button>
        </form>
        <p className="card__foot">
          Currently <span className="mono">{prefs.zip}</span> · {zipLabel(prefs.zip)}. Demo prices cover{' '}
          <span className="mono">15213</span>; other zips show what the API returns.
        </p>
      </section>

      <section className="card card--gap" aria-labelledby="subs-title">
        <h3 id="subs-title" className="card__title">
          Your subscriptions
        </h3>
        <ul className="toggles">
          {PLATFORMS.map((p) => {
            const on = prefs.subscriptions.includes(p.slug);
            return (
              <li key={p.slug} className="toggle">
                <span className="toggle__text">
                  <span className="toggle__name">
                    <PlatformDot slug={p.slug} />
                    {p.subscriptionName}
                  </span>
                  <span className="toggle__perks">
                    {p.name} · {p.subscriptionPerks.join(', ')}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${p.subscriptionName} ${on ? 'on' : 'off'}`}
                  className={`switch${on ? ' switch--on' : ''}`}
                  onClick={() => toggleSubscription(p.slug)}
                >
                  <span className="switch__knob" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="card__foot">
          Every total in Forkcast is recomputed with your passes: the delivery fee is waived where you hold one and
          added back where you do not.
        </p>
      </section>

      <section className="card card--gap" aria-labelledby="about-title">
        <h3 id="about-title" className="card__title">
          About
        </h3>
        <p className="card__foot">
          Forkcast compares the delivered total for the same order on DoorDash, Uber Eats and Grubhub and links you
          out to the cheapest one. We do not process payment.
        </p>
      </section>

      <BottomTabs />
    </div>
  );
}
