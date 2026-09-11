import type { Transition } from "motion/react";

/** Critically damped UI spring — Apple default for reposition / chrome */
export const springUi: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.4,
};

/** Slightly snappier chrome (sheets, dialogs) */
export const springChrome: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.32,
};

/** Momentum / flick only — slight overshoot */
export const springMomentum: Transition = {
  type: "spring",
  bounce: 0.2,
  duration: 0.4,
};

export const fadeQuick: Transition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
};
