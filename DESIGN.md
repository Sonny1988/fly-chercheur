# Design System — FlySearch

## Color Strategy: Restrained + committed accent

Scene: professionnel qui vérifie des vols depuis son bureau le matin, écran bien éclairé.
→ Light mode. Warm cream base, jade accent distinctive.

### Tokens OKLCH

```
/* Backgrounds — warm cream, not cold white */
--bg:              oklch(97% 0.008 85)
--bg-surface:      oklch(95% 0.010 85)
--bg-elevated:     oklch(93% 0.012 85)

/* Text — near-black with cool undertone */
--text-primary:    oklch(18% 0.010 240)
--text-secondary:  oklch(42% 0.008 240)
--text-muted:      oklch(62% 0.006 240)

/* Accent — jade, not blue */
--accent:          oklch(55% 0.150 175)
--accent-hover:    oklch(49% 0.160 175)
--accent-bg:       oklch(94% 0.040 175)
--accent-bg-hover: oklch(91% 0.060 175)

/* Borders */
--border:          oklch(86% 0.012 85)
--border-subtle:   oklch(91% 0.008 85)
```

## Typography

Font: system-ui, -apple-system, 'Segoe UI', sans-serif (zero web font loading)

Scale:
- 11px / 500 / uppercase 0.05em — field labels
- 12px — metadata, small labels
- 13px — pills, badges, secondary UI
- 14px — inputs, table cells
- 15px — body text, main copy
- 17px — section headings
- 22px — page-level headings

Line height: 1.55 base, 1.65 for long-form prose
Cap body at 72ch

## Layout

- Max-width container: 1280px
- Base spacing unit: 8px
- Vary rhythm deliberately — identical padding everywhere is monotony

## Components

- Feature nav: horizontal pill row (not card grid)
- Panels: inline collapsible (no modals)
- Inputs: field-label + field-input pattern, 40px height
- CTA button: solid accent, 40px height, 600 weight

## Bans (applied)

- No glassmorphism
- No gradient text
- No side-stripe borders
- No identical card grid
- No modal-first
- No emoji in navigation or headings
