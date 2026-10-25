import { EyeLink, LandingHeader } from "./landing-navigation";
import { HeroStickers } from "./hero-stickers";

export function LandingHero() {
  return (
    <section className="hero" id="top">
      <div className="orbit"></div>
      <div className="orbit two"></div>
      <div className="orbit-glow"></div>
      <HeroStickers />
      <LandingHeader />
      <div className="hero-content">
        <div className="eyebrow">
          <span className="eyebrow-dot"></span> Personal marketing,
          intelligently managed
        </div>
        <h1>
          Be discovered.
          <br />
          Be remembered.
          <br />
          <em>Be booked.</em>
        </h1>
        <p className="hero-copy">
          We learn your business, shape content around your voice, and manage
          the weekly work that keeps you in front of the people who matter.
        </p>
        <div className="hero-actions">
          <EyeLink href="#contact">Discuss your business</EyeLink>
          <a href="#flow" className="pill light">
            See how it works <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="hero-note">
          Drag the logos to play. Channels shown are illustrative, not live
          account connections.
        </p>
      </div>
    </section>
  );
}
