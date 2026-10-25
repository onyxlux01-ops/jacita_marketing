import type { CSSProperties } from "react";
import { ClientLogos } from "./client-logos";
import { PreviewEnquiryForm } from "./preview-enquiry-form";

export function ServicesSection() {
  return (
    <section className="intro section-pad" id="services">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">WHAT WE DO</div>
          <h2>
            Your business has a story.
            <br />
            We help people find it.
          </h2>
          <p>
            JACITA brings the strategy, production and day-to-day management
            together, while keeping your business&apos;s voice at the centre.
          </p>
        </div>
        <div className="service-grid">
          <article className="service">
            <div className="service-icon" aria-hidden="true">
              ✦
            </div>
            <h3>Know your business</h3>
            <p>
              We begin with your services, audience, brand language, approved
              offers and what success means to you.
            </p>
          </article>
          <article className="service">
            <div className="service-icon" aria-hidden="true">
              ◈
            </div>
            <h3>Make content that fits</h3>
            <p>
              Ideas, captions, graphics and video are prepared around your real
              materials, with the right review before publishing.
            </p>
          </article>
          <article className="service">
            <div className="service-icon" aria-hidden="true">
              ↗
            </div>
            <h3>Learn what moves people</h3>
            <p>
              We look at delivery, engagement, enquiries and bookings where
              reliable data exists, then improve the next round.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export function OutcomesSection() {
  return (
    <section className="outcomes section-pad" id="results">
      <div className="container outcome-grid">
        <div>
          <div className="eyebrow">REAL BUSINESS OUTCOMES</div>
          <h2>More than a prettier feed.</h2>
          <p>
            Good marketing earns attention, but the useful question is what
            happens next. We separate visibility from enquiries and confirmed
            bookings so the conversation stays honest.
          </p>
          <div className="outcome-list">
            <div>
              <span className="tick">✓</span> Reach and engagement show how
              content travels.
            </div>
            <div>
              <span className="tick">✓</span> Enquiries show who took the next
              step.
            </div>
            <div>
              <span className="tick">✓</span> Confirmed bookings show completed
              intent.
            </div>
          </div>
        </div>
        <div className="report" aria-label="Illustrative reporting categories">
          <div className="report-top">
            <strong>What we review each week</strong>
            <span>EXAMPLE VIEW</span>
          </div>
          <div className="report-row">
            <b>Visibility</b>
            <div
              className="report-line"
              style={{ "--w": "78%" } as CSSProperties}
            ></div>
            <em>Reach</em>
          </div>
          <div className="report-row">
            <b>Interest</b>
            <div
              className="report-line"
              style={{ "--w": "59%" } as CSSProperties}
            ></div>
            <em>Engage</em>
          </div>
          <div className="report-row">
            <b>Action</b>
            <div
              className="report-line"
              style={{ "--w": "40%" } as CSSProperties}
            ></div>
            <em>Enquire</em>
          </div>
          <div className="report-row">
            <b>Outcome</b>
            <div
              className="report-line"
              style={{ "--w": "27%" } as CSSProperties}
            ></div>
            <em>Book</em>
          </div>
          <div className="report-foot">
            Illustrative categories and shapes, not actual client figures or
            conversion rates. Live reports would show their source, period and
            data quality.
          </div>
        </div>
      </div>
    </section>
  );
}

export function PersonalServiceSection() {
  return (
    <section className="personal section-pad">
      <div className="container">
        <div className="personal-card">
          <div>
            <div className="eyebrow">PERSONAL BY DESIGN</div>
            <h2>Smart tools. Someone accountable.</h2>
            <p>
              Automation helps with the repetitive work. A person still checks
              the business facts, reviews decisions and deals with the
              exceptions that matter.
            </p>
          </div>
          <div className="personal-points">
            <div className="personal-point">
              <span>1</span>Your brand rules guide the work.
            </div>
            <div className="personal-point">
              <span>2</span>Offers and sensitive claims are checked.
            </div>
            <div className="personal-point">
              <span>3</span>Publishing follows your agreed permissions.
            </div>
            <div className="personal-point">
              <span>4</span>Weekly reviews lead to the next action.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClientsSection() {
  return (
    <section className="clients" id="clients">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">ENDORSED BUSINESSES</div>
          <h2>
            Different businesses.
            <br />
            One commitment to growth.
          </h2>
          <p>Meet the businesses in the JACITA network.</p>
        </div>
        <div className="logo-stage">
          <ClientLogos />
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section className="faq" id="faq">
      <div className="container faq-panel">
        <div className="faq-layout">
          <div className="faq-left">
            <div className="eyebrow">COMMON QUESTIONS</div>
            <h2>Questions &amp; answers</h2>
            <p>
              Every business works differently. We can talk through the details
              together.
            </p>
            <a className="faq-contact" href="#contact">
              <span aria-hidden="true">↗</span>Ask us about your business
            </a>
            <div className="faq-watermark" aria-hidden="true">
              FAQ
            </div>
          </div>
          <div className="faq-list">
            <details open name="jacita-questions">
              <summary>
                <span className="faq-num">01</span>
                <span className="faq-question">
                  Will the content sound like my business?
                </span>
              </summary>
              <p>
                We start with your brand voice, services, audience and approved
                facts. Drafts are checked against that context before they are
                used.
              </p>
            </details>
            <details name="jacita-questions">
              <summary>
                <span className="faq-num">02</span>
                <span className="faq-question">
                  Do I have to hand over my social passwords?
                </span>
              </summary>
              <p>
                The intended setup uses each platform&apos;s authorised account
                connection. Access and supported actions depend on the platform
                and are confirmed during onboarding.
              </p>
            </details>
            <details name="jacita-questions">
              <summary>
                <span className="faq-num">03</span>
                <span className="faq-question">
                  Can you use my photos and videos?
                </span>
              </summary>
              <p>
                Yes, when you provide them and confirm their permitted use.
                Existing footage can guide the content plan and any agreed
                editing workflow.
              </p>
            </details>
            <details name="jacita-questions">
              <summary>
                <span className="faq-num">04</span>
                <span className="faq-question">
                  How will I know if it is working?
                </span>
              </summary>
              <p>
                We review publication, engagement and the enquiries or bookings
                that can be verified. Missing or uncertain data is labelled
                clearly.
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section className="contact" id="contact">
      <div className="container">
        <div className="contact-layout">
          <div>
            <div className="eyebrow">LET&apos;S BEGIN</div>
            <h2>
              Tell us about
              <br />
              your business.
            </h2>
            <p>
              Share what you sell, who you want to reach and what you want to
              improve. The live site will route your enquiry privately to
              JACITA.
            </p>
          </div>
          <PreviewEnquiryForm />
        </div>
        <footer className="footer">
          <div>© JACITA Marketing</div>
          <div className="footer-links">
            <a href="#top">Back to top</a>
            <a href="#contact">Contact</a>
            <span>Privacy and terms to be connected</span>
          </div>
        </footer>
      </div>
    </section>
  );
}
