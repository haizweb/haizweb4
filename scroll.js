import { clamp, damp } from './math.js';

/**
 * Scroll-driven progress with inertia.
 *
 * The page uses the browser's native scrolling (so wheel, touch, keyboard, scrollbar and
 * accessibility all keep working). `target` is the raw progress (0..1) of the tall
 * #scroll-space element, `value` follows it with exponential damping — this is what
 * the whole timeline is driven by.
 *
 * Debug / capture hooks:  ?p=0.42  -> fixed progress,  window.__setProgress(p)
 */
export class Scroll {
  constructor({ damping = 5.2, fixed = null } = {}) {
    this.damping = damping;
    this.target = 0;
    this.value = 0;
    this.velocity = 0;
    this.fixed = fixed;
    this._last = 0;
    if (fixed !== null) {
      this.target = this.value = fixed;
    } else {
      this._read();
      this.value = this.target;
      addEventListener('scroll', () => this._read(), { passive: true });
      addEventListener('resize', () => this._read());
    }
  }

  _read() {
    const max = document.documentElement.scrollHeight - innerHeight;
    this.target = max > 0 ? clamp(scrollY / max) : 0;
  }

  set(p) {
    this.fixed = p;
    this.target = this.value = clamp(p);
    this.velocity = 0;
  }

  /** scroll the page to a progress value (used by keyboard helpers) */
  scrollToProgress(p, behavior = 'smooth') {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: clamp(p) * max, behavior });
  }

  update(dt) {
    if (this.fixed !== null) {
      this.velocity = 0;
      return this.value;
    }
    const prev = this.value;
    this.value = damp(this.value, this.target, this.damping, dt);
    if (Math.abs(this.value - this.target) < 1e-5) this.value = this.target;
    this.velocity = dt > 0 ? (this.value - prev) / dt : 0;
    return this.value;
  }
}
