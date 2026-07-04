/**
 * Fine film-grain noise texture, layered at low opacity over dark imagery
 * (hero backdrop, section-break band) to avoid a flat, banded look.
 * Single source of truth — previously duplicated verbatim in two components.
 */
export const GRAIN_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
