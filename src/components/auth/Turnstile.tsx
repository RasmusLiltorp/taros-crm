"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

export function Turnstile({ onToken, onExpire }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Stable refs so the effect deps don't change on every render
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const handleToken = useCallback((token: string) => {
    onTokenRef.current(token);
  }, []);

  const handleExpire = useCallback(() => {
    onExpireRef.current?.();
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    // Guard: don't render a second widget into the same container
    if (widgetId.current) return;

    function render() {
      if (!containerRef.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: handleToken,
        "expired-callback": handleExpire,
        theme: "light",
        size: "normal",
      });
    }

    if (window.turnstile) {
      render();
    } else {
      // Only inject the script once (check DOM)
      const existing = document.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"]'
      );
      if (!existing) {
        window.onTurnstileLoad = render;
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      } else {
        // Script already in DOM but turnstile not ready yet — poll
        const interval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(interval);
            render();
          }
        }, 100);
        return () => clearInterval(interval);
      }
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey, handleToken, handleExpire]);

  if (!siteKey) return null;

  return <div ref={containerRef} className="mt-1" />;
}
