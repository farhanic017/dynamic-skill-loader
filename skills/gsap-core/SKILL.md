---
name: gsap-core
description: >
  # GSAP Core
triggers:
  - "gsap"
  - "web animation"
  - "tween"
  - "easing"
---

# GSAP Core

GreenSock Animation Platform core library.

## Quick Reference

```javascript
gsap.to('.box', { x: 100, duration: 1, ease: 'power2.out' });
gsap.from('.box', { opacity: 0, y: 50 });
gsap.timeline()
  .to('.a', { x: 100 })
  .to('.b', { x: 200 }, '-=0.5');
```
