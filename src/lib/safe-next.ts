/**
 * Validate a post-login "next" target. Returns a same-origin path
 * (pathname + search + hash) or the fallback.
 *
 * String prefix checks are not enough: URL parsing strips tabs / newlines
 * and treats "\" as "/", so "/\t/evil.example" or "/\\evil.example" become
 * "//evil.example" (another host). Resolve against our origin with the same
 * parser the browser uses and keep only the path parts if the origin is
 * unchanged.
 */
export function safeNextPath(
  next: string | null | undefined,
  origin: string,
  fallback = "/app"
): string {
  if (!next) return fallback;
  let base: URL;
  let target: URL;
  try {
    base = new URL(origin);
    target = new URL(next, base);
  } catch {
    return fallback;
  }
  if (target.origin !== base.origin) return fallback;
  const path = `${target.pathname}${target.search}${target.hash}`;
  // Defence in depth: never hand back something protocol-relative.
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return fallback;
  }
  return path;
}
