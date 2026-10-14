export class RedirectError extends Error {
  constructor(url) {
    super(`NEXT_REDIRECT:${url}`);
    this.url = url;
  }
}

export function redirect(url) {
  throw new RedirectError(url);
}

export function notFound() {
  throw new Error("NEXT_NOT_FOUND");
}
