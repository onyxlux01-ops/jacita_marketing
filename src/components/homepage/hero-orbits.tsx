export function HeroOrbits() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1600 900"
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      preserveAspectRatio="xMidYMid slice"
    >
      <ellipse
        cx="800"
        cy="430"
        rx="520"
        ry="250"
        fill="none"
        stroke="#d4d7de"
        strokeWidth="1"
        opacity="0.55"
      />
      <ellipse
        cx="800"
        cy="455"
        rx="430"
        ry="210"
        fill="none"
        stroke="#d9dce3"
        strokeWidth="1"
        opacity="0.4"
      />
    </svg>
  );
}
