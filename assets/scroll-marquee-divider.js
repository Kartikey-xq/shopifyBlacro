import { Component } from '@theme/component';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

class ScrollMarqueeDivider extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.track = this.querySelector('[data-scroll-marquee]');
    if (!this.track) return;

    this.direction = this.track.dataset.direction === 'reverse' ? -1 : 1;
    this.sensitivity = Number(this.track.dataset.sensitivity) || 1;

    this.handleScroll = this.handleScroll.bind(this);
    this.frameId = null;

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.update();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('scroll', this.handleScroll);
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  handleScroll() {
    if (this.frameId) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.update();
    });
  }

  update() {
    const rect = this.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
    const movement = this.direction * -1 * progress * 50 * this.sensitivity;
    this.track.style.transform = `translateX(${movement}%)`;
  }
}

customElements.define('scroll-marquee-divider', ScrollMarqueeDivider);
