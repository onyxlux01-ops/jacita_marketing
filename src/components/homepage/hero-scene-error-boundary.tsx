"use client";

import { Component, type ReactNode } from "react";
import { HeroFallback } from "./hero-fallback";

type Props = {
  children: ReactNode;
  isMobile: boolean;
};

type State = { failed: boolean };

export class HeroSceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    /* decorative layer — swallow */
  }

  render() {
    if (this.state.failed) {
      return <HeroFallback isMobile={this.props.isMobile} />;
    }
    return this.props.children;
  }
}
