/** One lifecycle-bound tracker shared by every eye on the homepage. */
export function startEyeTracking(root: HTMLElement) {
  const eyes = Array.from(root.querySelectorAll<HTMLElement>(".eye"));
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let point: { x: number; y: number } | null = null;
  let contact: number | null = null;
  let frame = 0;
  const options = { passive: true, capture: true };

  function paint() {
    frame = 0;
    // Read all geometry before writing styles to avoid layout thrashing.
    const offsets = eyes.map((eye) => {
      if (!point || preference.matches) return { x: 0, y: 0 };
      const rect = eye.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0, y: 0 };
      const dx = point.x - rect.left - rect.width / 2;
      const dy = point.y - rect.top - rect.height / 2;
      const length = Math.hypot(dx, dy);
      const scale = length ? Math.min(6, length * 0.12) / length : 0;
      return { x: dx * scale, y: dy * scale };
    });
    eyes.forEach((eye, index) => {
      eye.style.setProperty("--px", offsets[index].x + "px");
      eye.style.setProperty("--py", offsets[index].y + "px");
    });
  }
  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(paint);
  }
  function reset() {
    point = null;
    contact = null;
    schedule();
  }
  function down(event: PointerEvent) {
    if (preference.matches) return;
    if (event.pointerType !== "mouse") contact = event.pointerId;
    else if (contact !== null) return;
    point = { x: event.clientX, y: event.clientY };
    schedule();
  }
  function move(event: PointerEvent) {
    if (preference.matches) return;
    if (
      event.pointerType === "mouse"
        ? contact !== null
        : event.pointerId !== contact
    )
      return;
    point = { x: event.clientX, y: event.clientY };
    schedule();
  }
  function release(event: PointerEvent) {
    if (event.pointerId === contact) reset();
  }
  function leave(event: PointerEvent) {
    if (
      event.pointerType === "mouse" &&
      event.relatedTarget === null &&
      contact === null
    )
      reset();
  }
  function visibility() {
    if (document.hidden) reset();
  }
  function geometryChanged() {
    if (point) schedule();
  }

  window.addEventListener("pointerdown", down, options);
  window.addEventListener("pointermove", move, options);
  window.addEventListener("pointerup", release, options);
  window.addEventListener("pointercancel", release, options);
  window.addEventListener("pointerout", leave, options);
  window.addEventListener("scroll", geometryChanged, options);
  window.addEventListener("resize", geometryChanged, options);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", visibility);
  preference.addEventListener("change", reset);

  return () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("pointerdown", down, options);
    window.removeEventListener("pointermove", move, options);
    window.removeEventListener("pointerup", release, options);
    window.removeEventListener("pointercancel", release, options);
    window.removeEventListener("pointerout", leave, options);
    window.removeEventListener("scroll", geometryChanged, options);
    window.removeEventListener("resize", geometryChanged, options);
    window.removeEventListener("blur", reset);
    document.removeEventListener("visibilitychange", visibility);
    preference.removeEventListener("change", reset);
    eyes.forEach((eye) => {
      eye.style.removeProperty("--px");
      eye.style.removeProperty("--py");
    });
  };
}
