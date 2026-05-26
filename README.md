# RC Slab Design Calculator

Standalone Vite + React deployment for the reinforced concrete slab design calculator.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Vercel

Import this folder/repository into Vercel. Use the defaults:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

The calculator uses browser `localStorage` for saved calculations, so it does not require a database or server API.
