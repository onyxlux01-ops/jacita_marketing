"use client";
import { useState } from "react";
import { useMediaQuery } from "./use-media-query";

export function MarketingFlow() {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const [replay, setReplay] = useState(0);
  return (
    <section
      className="exception-section"
      id="workflow"
      aria-labelledby="exception-title"
    >
      <div className="container">
        <div className="exception-panel">
          <div className="exception-intro">
            <div>
              <div className="eyebrow">THE CONNECTED WORKFLOW</div>
              <h2 id="exception-title">
                One business brief. A connected marketing workflow.
              </h2>
            </div>
            <p>
              Your services, audience and brand rules guide the work. From that
              foundation, JACITA creates, publishes and learns with you.
            </p>
          </div>
          <div
            className="exception-map"
            id="exceptionMap"
            aria-label="Illustrative marketing workflow"
          >
            <svg
              className="exception-lines"
              viewBox="0 0 1000 340"
              preserveAspectRatio="none"
              aria-hidden="true"
              key={replay}
            >
              <path
                className="route-base"
                d="M275 170 C455 170 505 56 742 56"
              ></path>
              <path className="route-base" d="M275 170 L742 170"></path>
              <path
                className="route-base"
                d="M275 170 C455 170 505 284 742 284"
              ></path>
              <path
                className="route-pulse"
                d="M275 170 C455 170 505 56 742 56"
              ></path>
              <path className="route-pulse" d="M275 170 L742 170"></path>
              <path
                className="route-pulse"
                d="M275 170 C455 170 505 284 742 284"
              ></path>
              <circle className="signal-dot" r="6" opacity="0">
                <set
                  attributeName="opacity"
                  to="1"
                  begin="0s"
                  fill="freeze"
                ></set>
                <animateMotion
                  dur="3.2s"
                  begin="0s"
                  repeatCount="indefinite"
                  path="M275 170 C455 170 505 56 742 56"
                ></animateMotion>
              </circle>
              <circle className="signal-dot" r="6" opacity="0">
                <set
                  attributeName="opacity"
                  to="1"
                  begin=".8s"
                  fill="freeze"
                ></set>
                <animateMotion
                  dur="3.2s"
                  begin=".8s"
                  repeatCount="indefinite"
                  path="M275 170 L742 170"
                ></animateMotion>
              </circle>
              <circle className="signal-dot" r="6" opacity="0">
                <set
                  attributeName="opacity"
                  to="1"
                  begin="1.6s"
                  fill="freeze"
                ></set>
                <animateMotion
                  dur="3.2s"
                  begin="1.6s"
                  repeatCount="indefinite"
                  path="M275 170 C455 170 505 284 742 284"
                ></animateMotion>
              </circle>
            </svg>
            <button
              className="flow-node flow-trigger"
              id="replayFlow"
              type="button"
              aria-label="Replay illustrative marketing workflow"
              onClick={() => {
                if (!reducedMotion) setReplay((value) => value + 1);
              }}
            >
              <span className="flow-icon" aria-hidden="true">
                ✦
              </span>
              <span>
                <strong>Your business brief</strong>
                <small>Goals, audience and brand voice</small>
              </span>
            </button>
            <div className="flow-outputs">
              <div className="flow-node">
                <span className="flow-icon" aria-hidden="true">
                  Ⅱ
                </span>
                <span>
                  <strong>Plan &amp; create</strong>
                  <small>Ideas, captions and visuals in your voice</small>
                </span>
              </div>
              <div className="flow-node">
                <span className="flow-icon" aria-hidden="true">
                  ↗
                </span>
                <span>
                  <strong>Review &amp; publish</strong>
                  <small>
                    Approve content, then share it on connected channels
                  </small>
                </span>
              </div>
              <div className="flow-node">
                <span className="flow-icon" aria-hidden="true">
                  ≡
                </span>
                <span>
                  <strong>Measure &amp; improve</strong>
                  <small>
                    Use reach, enquiries and bookings to guide the next week
                  </small>
                </span>
              </div>
            </div>
          </div>
          <p className="exception-note">
            Illustrative workflow. Publishing and reporting integrations are not
            active in this preview.
          </p>
        </div>
      </div>
    </section>
  );
}
