"use client";

import { useEffect } from "react";
import * as CookieConsent from "vanilla-cookieconsent";
import "vanilla-cookieconsent/dist/cookieconsent.css";

const RYBBIT_SCRIPT_ID = "rybbit-analytics";
const RYBBIT_SITE_ID = "8832222005db";

function loadRybbit() {
  if (document.getElementById(RYBBIT_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = RYBBIT_SCRIPT_ID;
  script.src = "https://rybbit.taros.ai/api/script.js";
  script.defer = true;
  script.setAttribute("data-site-id", RYBBIT_SITE_ID);
  document.body.appendChild(script);
}

function removeRybbit() {
  const script = document.getElementById(RYBBIT_SCRIPT_ID);
  if (script) script.remove();

  try {
    localStorage.removeItem("rybbit-user-id");
  } catch {
    // Ignore if localStorage is unavailable.
  }
}

export function CookieConsentBanner() {
  useEffect(() => {
    CookieConsent.run({
      guiOptions: {
        consentModal: {
          layout: "box inline",
          position: "bottom center",
        },
        preferencesModal: {
          layout: "box",
        },
      },
      categories: {
        necessary: {
          enabled: true,
          readOnly: true,
        },
        analytics: {
          autoClear: {
            cookies: [],
          },
        },
      },
      language: {
        default: "en",
        autoDetect: "document",
        translations: {
          en: {
            consentModal: {
              title: "Cookies",
              description:
                "We use cookies for analytics to improve your experience.",
              acceptAllBtn: "Accept",
              acceptNecessaryBtn: "Decline",
              showPreferencesBtn: "Manage",
            },
            preferencesModal: {
              title: "Cookie preferences",
              acceptAllBtn: "Accept all",
              acceptNecessaryBtn: "Reject all",
              savePreferencesBtn: "Save",
              sections: [
                {
                  title: "Necessary",
                  description:
                    "Essential for the website to function correctly.",
                  linkedCategory: "necessary",
                },
                {
                  title: "Analytics",
                  description: "Help us understand how visitors use our site.",
                  linkedCategory: "analytics",
                },
              ],
            },
          },
        },
      },
      onConsent: () => {
        if (CookieConsent.acceptedCategory("analytics")) {
          loadRybbit();
        }
      },
      onChange: () => {
        if (CookieConsent.acceptedCategory("analytics")) {
          loadRybbit();
        } else {
          removeRybbit();
        }
      },
    });
  }, []);

  return null;
}
