import { Bodies, Body, Composite, Constraint, Engine, Sleeping } from "matter-js";

/** DOM-rendered rigid bodies: one shared floor, with no canvas/input interception. */
export function startLogoPile(wall: HTMLElement) {
  const hero = wall.closest(".hero")!;
  hero.classList.add("physics-ready");
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = 1;
  const tiles = Array.from(wall.querySelectorAll<HTMLElement>(".social-logo"));
  let width = wall.clientWidth, height = wall.clientHeight;
  // Logos may leave the strip and fly over the hero copy; the hero's top edge is the ceiling.
  const measureCeiling = () => {
    const heroTop = hero.getBoundingClientRect?.().top;
    return heroTop === undefined ? -1000 : Math.min(0, heroTop - wall.getBoundingClientRect().top);
  };
  let ceiling = measureCeiling();
  const items = tiles.map((el, i) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    const columns = width < 650 ? 4 : 10;
    const body = Bodies.rectangle(
      width * 0.18 + (i % columns + 0.5) * width * 0.64 / columns,
      Math.max(ceiling + h, -h - Math.floor(i / columns) * 100),
      w, h,
      { chamfer: { radius: Math.min(12, h / 4) }, restitution: 0.42,
        friction: 0.55, frictionAir: 0.018, angle: (i % 3 - 1) * 0.18 },
    );
    el.style.left = el.style.top = "0";
    return { el, body, w, h };
  });
  Composite.add(engine.world, items.map(item => item.body));
  let boundaries: Body[] = [];
  function fit() {
    const oldWidth = width;
    width = wall.clientWidth; height = wall.clientHeight; ceiling = measureCeiling();
    Composite.remove(engine.world, boundaries);
    const sideHeight = height - ceiling + 200, sideY = (ceiling + height) / 2;
    boundaries = [
      Bodies.rectangle(width / 2, height + 20, width + 160, 60, { isStatic: true }),
      Bodies.rectangle(width / 2, ceiling - 30, width + 160, 60, { isStatic: true }),
      Bodies.rectangle(-30, sideY, 60, sideHeight, { isStatic: true }),
      Bodies.rectangle(width + 30, sideY, 60, sideHeight, { isStatic: true }),
    ];
    Composite.add(engine.world, boundaries);
    items.forEach(item => {
      const w = item.el.offsetWidth, h = item.el.offsetHeight;
      Body.scale(item.body, w / item.w, h / item.h);
      item.w = w; item.h = h;
      const radius = Math.hypot(w, h) / 2;
      Body.setPosition(item.body, {
        x: Math.max(radius, Math.min(width - radius, item.body.position.x * width / oldWidth)),
        y: Math.max(ceiling + radius, Math.min(height - radius, item.body.position.y)),
      });
      Sleeping.set(item.body, false);
    });
    resume();
  }
  let frame = 0, last = 0, accumulator = 0, visible = true, disposed = false;
  function paint() {
    items.forEach(({ el, body, w, h }) => {
      el.style.transform = `translate3d(${body.position.x - w / 2}px,${body.position.y - h / 2}px,0) rotate(${body.angle}rad)`;
    });
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    accumulator += Math.min(50, now - last); last = now;
    while (accumulator >= 1000 / 60) {
      items.forEach(({ body }) => {
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (speed > 22) Body.setVelocity(body, { x: body.velocity.x * 22 / speed, y: body.velocity.y * 22 / speed });
      });
      Engine.update(engine, 1000 / 60); accumulator -= 1000 / 60;
    }
    paint();
    if (grab || items.some(({ body }) => !body.isSleeping)) frame = requestAnimationFrame(tick);
  }
  function resume() {
    if (!disposed && visible && !document.hidden && !frame) {
      last = performance.now(); accumulator = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  let grab: { id: number; el: HTMLElement; joint: Constraint; radius: number } | null = null;
  let tap: { id: number; x: number; y: number } | null = null;
  const local = (event: PointerEvent) => {
    const rect = wall.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function release() {
    if (!grab) return;
    const { el, id, joint } = grab;
    grab = null;
    Composite.remove(engine.world, joint);
    el.classList.remove("is-dragging");
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  }
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    const point = local(event);
    const item = items.find(({ el }) => el.contains(event.target as Node));
    if (!item) { tap = { id: event.pointerId, x: event.clientX, y: event.clientY }; return; }
    release(); tap = null;
    Sleeping.set(item.body, false);
    const joint = Constraint.create({ pointA: point, bodyB: item.body,
      pointB: { x: point.x - item.body.position.x, y: point.y - item.body.position.y },
      stiffness: 0.18, damping: 0.12, length: 0 });
    Composite.add(engine.world, joint);
    grab = { id: event.pointerId, el: item.el, joint, radius: Math.hypot(item.w, item.h) / 2 };
    item.el.setPointerCapture(event.pointerId);
    item.el.classList.add("is-dragging");
    resume();
  }
  function move(event: PointerEvent) {
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = null;
    if (grab?.id !== event.pointerId) return;
    const point = local(event);
    grab.joint.pointA = { x: Math.max(0, Math.min(width, point.x)), y: Math.max(ceiling + grab.radius, Math.min(height, point.y)) };
    Sleeping.set(grab.joint.bodyB!, false);
  }
  const ripple = document.createElement("div");
  ripple.className = "floor-ripple"; wall.appendChild(ripple);
  let rippleAnimation: Animation | undefined;
  function up(event: PointerEvent) {
    if (grab?.id === event.pointerId) release();
    if (tap?.id !== event.pointerId) return;
    tap = null;
    const point = local(event);
    items.forEach(({ body }) => {
      const distance = Math.hypot(point.x - body.position.x, point.y - body.position.y);
      const strength = Math.max(0, 1 - distance / 280);
      if (!strength) return;
      Sleeping.set(body, false);
      Body.setVelocity(body, { x: (body.position.x - point.x) * 0.035 * strength, y: -12 * strength - 2 });
      Body.setAngularVelocity(body, (body.position.x - point.x) * 0.0005 * strength);
    });
    ripple.style.left = `${point.x}px`; ripple.style.top = `${point.y}px`;
    rippleAnimation?.cancel();
    rippleAnimation = ripple.animate([
      { transform: "translate(-50%, -50%) scale(0.1)", opacity: 0.35 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
    ], { duration: 650, easing: "ease-out" });
    resume();
  }
  function cancel(event: PointerEvent) {
    if (grab?.id === event.pointerId) release();
    if (tap?.id === event.pointerId) tap = null;
  }
  function blur() { release(); tap = null; }
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, lostpointercapture: cancel };
  Object.entries(events).forEach(([name, handler]) => wall.addEventListener(name, handler as EventListener, { passive: true }));
  window.addEventListener("blur", blur);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) blur(); resume(); });
  const resize = new ResizeObserver(fit);
  fit(); paint(); intersection.observe(wall); resize.observe(wall);
  document.addEventListener("visibilitychange", resume); resume();
  return () => {
    disposed = true; release(); cancelAnimationFrame(frame); rippleAnimation?.cancel(); ripple.remove();
    intersection.disconnect(); resize.disconnect();
    document.removeEventListener("visibilitychange", resume); window.removeEventListener("blur", blur);
    Object.entries(events).forEach(([name, handler]) => wall.removeEventListener(name, handler as EventListener));
    Composite.clear(engine.world, false); Engine.clear(engine);
    items.forEach(({ el }) => { el.style.removeProperty("left"); el.style.removeProperty("top"); el.style.removeProperty("transform"); });
    hero.classList.remove("physics-ready");
  };
}
