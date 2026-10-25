"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "./use-media-query";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
function cardStyle(index: number, progress: number): CSSProperties {
  const delta = index - progress,
    depth = Math.abs(delta);
  return {
    transform:
      "translateX(-50%) translateY(" +
      (delta < 0 ? delta * 105 : delta * 23) +
      "px) scale(" +
      clamp(1 - depth * 0.055, 0.78, 1) +
      ") rotate(" +
      (delta < 0 ? delta * -0.7 : delta * 0.45) +
      "deg)",
    opacity: delta < -0.85 ? 0.08 : clamp(1 - depth * 0.18, 0.28, 1),
    zIndex: Math.round(100 - depth * 12),
  };
}

export function WorkflowStack() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || reducedMotion) return;
    const cards = Array.from(
      scroller.querySelectorAll<HTMLElement>(".stack-card"),
    );
    let frame = 0;
    function render() {
      frame = 0;
      const range = Math.max(1, scroller!.offsetHeight - innerHeight);
      const progress =
        clamp(-scroller!.getBoundingClientRect().top / range, 0, 1) * 4;
      cards.forEach((card, index) => {
        const style = cardStyle(index, progress);
        card.style.transform = String(style.transform);
        card.style.opacity = String(style.opacity);
        card.style.zIndex = String(style.zIndex);
      });
      setActive((current) =>
        current === Math.round(progress) ? current : Math.round(progress),
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(render);
    }
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, [reducedMotion]);
  function jumpToStep(index: number) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    setActive(index);
    if (reducedMotion) {
      scroller
        .querySelectorAll(".stack-step")
        [index]?.scrollIntoView({ block: "center" });
      return;
    }
    const top = scroller.getBoundingClientRect().top + scrollY;
    scrollTo({
      top: top + (index / 4) * Math.max(0, scroller.offsetHeight - innerHeight),
      behavior: "smooth",
    });
  }
  return (
    <section className="workflow" id="how">
      <svg
        className="traffic"
        viewBox="0 0 1440 850"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path
          className="base"
          d="M-120 170 C250 80 350 420 725 290 S1110 100 1560 200"
        ></path>
        <path
          className="pulse"
          d="M-120 170 C250 80 350 420 725 290 S1110 100 1560 200"
        ></path>
        <path
          className="base"
          d="M-120 500 C240 620 425 330 745 540 S1120 760 1560 550"
        ></path>
        <path
          className="pulse purple"
          d="M-120 500 C240 620 425 330 745 540 S1120 760 1560 550"
        ></path>
        <path
          className="base"
          d="M-80 760 C275 575 325 780 680 690 S1140 380 1540 740"
        ></path>
        <path
          className="pulse"
          style={{ animationDelay: "-9s" } as CSSProperties}
          d="M-80 760 C275 575 325 780 680 690 S1140 380 1540 740"
        ></path>
      </svg>
      <div className="container">
        <div className="workflow-header">
          <div>
            <div className="eyebrow">THE JACITA METHOD</div>
            <h2>
              One connected flow.
              <br />
              Clear human control.
            </h2>
          </div>
          <p>
            From your first brief to the next week&apos;s decisions, every stage has
            a purpose. Scroll through how we work together.
          </p>
        </div>
      </div>
      <div className="workflow-scroll" id="workflowScroll" ref={scrollRef}>
        <div className="workflow-sticky">
          <div className="container stack-layout">
            <div className="stack-stage" aria-hidden="true">
              <div className="stack-card" style={cardStyle(0, 0)}>
                <span className="counter">01 / 05</span>
                <span className="stack-symbol">✧</span>
                <h3>Understand</h3>
                <p>Learn the business, its audience and its voice</p>
              </div>
              <div className="stack-card" style={cardStyle(1, 0)}>
                <span className="counter">02 / 05</span>
                <span className="stack-symbol">◇</span>
                <h3>Plan</h3>
                <p>Choose the week&apos;s topics, channels and goals</p>
              </div>
              <div className="stack-card" style={cardStyle(2, 0)}>
                <span className="counter">03 / 05</span>
                <span className="stack-symbol">✎</span>
                <h3>Create</h3>
                <p>Prepare content, then check and refine it</p>
              </div>
              <div className="stack-card" style={cardStyle(3, 0)}>
                <span className="counter">04 / 05</span>
                <span className="stack-symbol">↗</span>
                <h3>Publish</h3>
                <p>Schedule approved posts and verify delivery</p>
              </div>
              <div className="stack-card" style={cardStyle(4, 0)}>
                <span className="counter">05 / 05</span>
                <span className="stack-symbol">◎</span>
                <h3>Improve</h3>
                <p>Learn from reach, enquiries and bookings</p>
              </div>
            </div>
            <div className="stack-timeline" aria-label="JACITA method stages">
              <button
                className={"stack-step" + (active === 0 ? " active" : "")}
                type="button"
                data-step="0"
                aria-current={active === 0 ? "step" : undefined}
                onClick={() => jumpToStep(0)}
              >
                <span className="stage-kicker">STEP 1</span>
                <strong>Understand the business</strong>
                <span className="stage-description">
                  Map services, audience, tone, approved facts and goals.
                </span>
              </button>
              <button
                className={"stack-step" + (active === 1 ? " active" : "")}
                type="button"
                data-step="1"
                aria-current={active === 1 ? "step" : undefined}
                onClick={() => jumpToStep(1)}
              >
                <span className="stage-kicker">STEP 2</span>
                <strong>Plan the week</strong>
                <span className="stage-description">
                  Connect your goals to ideas, channels and calls to action.
                </span>
              </button>
              <button
                className={"stack-step" + (active === 2 ? " active" : "")}
                type="button"
                data-step="2"
                aria-current={active === 2 ? "step" : undefined}
                onClick={() => jumpToStep(2)}
              >
                <span className="stage-kicker">STEP 3</span>
                <strong>Create and review</strong>
                <span className="stage-description">
                  Prepare captions and visuals, then check the exact version.
                </span>
              </button>
              <button
                className={"stack-step" + (active === 3 ? " active" : "")}
                type="button"
                data-step="3"
                aria-current={active === 3 ? "step" : undefined}
                onClick={() => jumpToStep(3)}
              >
                <span className="stage-kicker">STEP 4</span>
                <strong>Publish with permission</strong>
                <span className="stage-description">
                  Send approved content to authorised channels and verify it
                  posted.
                </span>
              </button>
              <button
                className={"stack-step" + (active === 4 ? " active" : "")}
                type="button"
                data-step="4"
                aria-current={active === 4 ? "step" : undefined}
                onClick={() => jumpToStep(4)}
              >
                <span className="stage-kicker">STEP 5</span>
                <strong>Measure and improve</strong>
                <span className="stage-description">
                  Review reach, enquiries and bookings to guide the next week.
                </span>
              </button>
            </div>
          </div>
          <span className="stack-hint">Scroll to explore the process ↓</span>
        </div>
      </div>
    </section>
  );
}
