import { useState } from 'react';
import { BottomTabs } from '../components/BottomTabs';
import { TopBar } from '../components/TopBar';
import { COVERED_ZIPS, PLATFORMS } from '../data/mock';
import { usePrefs } from '../hooks/usePrefs';
import { useToast } from '../hooks/useToast';
import { zipLabel } from '../lib/prefs';

const coverage = `${[...COVERED_ZIPS].slice(0, -1).join(', ')} and ${COVERED_ZIPS[COVERED_ZIPS.length - 1]}`;

/** Zip + pass toggles. Both feed every total in the app. */
export function Account() {
  const { prefs, setZip, setTipPct, toggleSubscription } = usePrefs();
  const toast = useToast();
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
            if (!valid || draft === prefs.zip) return;
            setZip(draft);
            toast('Prices updated');
          }}
        >
          <input
            className="input num"
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
          Currently <span className="num">{prefs.zip}</span> · {zipLabel(prefs.zip)}. We cover Pittsburgh zips {coverage}{' '}
          right now.
        </p>
      </section>

      <section className="card card--gap" aria-labelledby="tip-title">
        <h3 id="tip-title" className="card__title">
          Tip included in comparisons
        </h3>
        <div className="tip-options" role="radiogroup" aria-label="Tip percentage">
          {[0, 0.1, 0.15, 0.2, 0.25].map((tip) => {
            const on = prefs.tipPct === tip;
            return (
              <button
                key={tip}
                type="button"
                role="radio"
                aria-checked={on}
                className={`tip-option${on ? ' tip-option--active' : ''}`}
                onClick={() => {
                  setTipPct(tip);
                  toast(`Totals updated with ${Math.round(tip * 100)}% tip`);
                }}
              >
                {Math.round(tip * 100)}%
              </button>
            );
          })}
        </div>
        <p className="card__foot">Tip is shown separately in the fee math and can change which app wins.</p>
      </section>

      <section className="card card--gap" aria-labelledby="subs-title">
        <h3 id="subs-title" className="card__title">
          Your passes
        </h3>
        <ul className="toggles">
          {PLATFORMS.map((p) => {
            const on = prefs.subscriptions.includes(p.slug);
            return (
              <li key={p.slug} className="toggle">
                <span className="toggle__text">
                  <span className="toggle__name">{p.subscriptionName}</span>
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
                  onClick={() => {
                    toggleSubscription(p.slug);
                    toast(`Prices updated for ${p.subscriptionName}`);
                  }}
                >
                  <span className="switch__knob" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="card__foot">
          All off unless you turn one on. Every total in Forkcast then drops the delivery fee on that app.
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
