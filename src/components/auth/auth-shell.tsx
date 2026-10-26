import Link from "next/link";
import { HeroCloudBackground } from "@/components/landing/hero-cloud-background";
import styles from "./auth-shell.module.css";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${styles.shell} brand-scope`}>
      <HeroCloudBackground />
      <header className={styles.topbar}>
        <Link
          href="/"
          aria-label="JACITA Marketing home"
          className={styles.brand}
        />
      </header>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
