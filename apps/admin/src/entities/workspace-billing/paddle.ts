/**
 * Paddle.js v2, loaded lazily and once (SDL-748).
 *
 * Only the surface the plan tab uses is typed. The script is added on the
 * first «Upgrade» click, never on page load: a person who never pays never
 * talks to Paddle. A failed load forgets its promise, so the next click
 * tries again.
 */
export const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

export interface PaddleEvent {
  name?: string;
  data?: { transaction_id?: string } | null;
}

export interface PaddleGlobal {
  Environment: { set: (environment: "sandbox" | "production") => void };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Initialized?: boolean;
  Checkout: {
    open: (options: { transactionId: string }) => void;
    close?: () => void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

let loading: Promise<PaddleGlobal> | null = null;

export function loadPaddle(): Promise<PaddleGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("paddle_unavailable"));
  }
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (loading) return loading;
  loading = new Promise<PaddleGlobal>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PADDLE_JS_URL;
    script.async = true;
    script.dataset.paddle = "v2";
    script.onload = () => {
      if (window.Paddle) resolve(window.Paddle);
      else reject(new Error("paddle_unavailable"));
    };
    script.onerror = () => reject(new Error("paddle_unavailable"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    document
      .querySelectorAll(`script[src="${PADDLE_JS_URL}"]`)
      .forEach((node) => node.remove());
    throw error;
  });
  return loading;
}

/*
  Paddle.Initialize runs once per page. The event callback given to it is a
  trampoline into whichever listener the mounted screen set last, so a tab
  switch or a second workspace never needs a re-initialization.
*/
let listener: ((event: PaddleEvent) => void) | null = null;
let initializedWith: string | null = null;

export function setPaddleListener(
  next: ((event: PaddleEvent) => void) | null
): void {
  listener = next;
}

export function initPaddle(
  paddle: PaddleGlobal,
  options: { token: string; environment: string }
): void {
  if (initializedWith === options.token) return;
  if (options.environment === "sandbox") paddle.Environment.set("sandbox");
  paddle.Initialize({
    token: options.token,
    eventCallback: (event) => listener?.(event),
  });
  initializedWith = options.token;
}

/** Tests only: forget the loaded script and the initialization. */
export function resetPaddleForTests(): void {
  loading = null;
  listener = null;
  initializedWith = null;
}
