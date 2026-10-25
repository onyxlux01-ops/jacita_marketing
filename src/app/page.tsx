import type { Metadata } from "next";
import { LandingHero } from "@/components/landing/hero";
import { TrafficTunnel } from "@/components/landing/traffic-tunnel";
import { WorkflowStack } from "@/components/landing/workflow-stack";
import { OutcomeWord } from "@/components/landing/outcome-word";
import { MarketingFlow } from "@/components/landing/marketing-flow";
import {
  ServicesSection,
  OutcomesSection,
  PersonalServiceSection,
  ClientsSection,
  FaqSection,
  ContactSection,
} from "@/components/landing/sections";
import styles from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: {
    absolute: "JACITA Marketing | Be discovered. Be remembered. Be booked.",
  },
  description:
    "JACITA Marketing helps businesses plan, create and manage social media content with personal oversight.",
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <LandingHero />
      <ServicesSection />
      <TrafficTunnel />
      <WorkflowStack />
      <OutcomeWord />
      <OutcomesSection />
      <PersonalServiceSection />
      <MarketingFlow />
      <ClientsSection />
      <FaqSection />
      <ContactSection />
    </main>
  );
}
