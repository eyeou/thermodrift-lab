---
name: td-illustration-adaptation
description: Adapt an explanatory animation (e.g. from a video editor such as Compound) into a web component for the Thermodrift site. Use when turning video motion graphics into an accessible, scientifically correct web illustration.
---

# Illustration adaptation (video → web)

## Before you start
Get the original composition as reference only. Do not copy proprietary runtime code, bundled fonts, music or personal media.

## Steps
1. List what the animation claims; correct the science before porting (e.g. what REF and the − input do, what is and is not cancelled).
2. Rebuild with SVG/CSS and the design tokens; label it "Illustration".
3. Respect `prefers-reduced-motion` (static final frame) and provide a text description.
4. Real data only from approved exports; otherwise clearly synthetic.

## Stop if
The original's claim cannot be verified, or an asset's licence is unknown.

## Check
Reduced-motion screenshot, keyboard focus order, contrast; reviewer reads the text alone and gets the same message.
