"use client";

import * as React from "react";

export type ThemePref = "system" | "light" | "dark";
import { THEME_KEY as KEY } from "./theme-boot";
const META: Record<"light" | "dark", string> = { light: "#f4f6f7", dark: "#0d1619" };


const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(pref: ThemePref, animate: boolean) {
  const root = document.documentElement;
  const next = resolve(pref);
  if (root.dataset.theme === next) return;
  if (animate) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 320);
  }
  root.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META[next]);
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref, true);
  listeners.forEach((l) => l());
}

/** the chosen theme ("system" follows the device), kept in sync with the device setting */
export function useThemePref(): ThemePref {
  React.useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(read(), true);
    mq.addEventListener("change", onChange);
    apply(read(), false);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system",
  );
}
