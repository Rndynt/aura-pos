# AuraPoS Landing App

`apps/landing` is the public AuraPoS marketing landing app. It hosts the landing page and internal mockup-preview routes used by the landing page iframe previews.

## Commands

- Dev: `pnpm --filter @pos/landing dev`
- Build: `pnpm --filter @pos/landing build`
- Preview: `pnpm --filter @pos/landing preview`

## Environment

- `VITE_POS_APP_URL` is optional and points CTA links to the POS app domain.
  - Example: `VITE_POS_APP_URL=https://app.yourdomain.com`
  - When empty, CTA links such as `/register` and `/login` stay same-origin for local monorepo/dev use.

## Routes

The mockup routes are internal to the landing app and are used by iframe previews:

- `/`
- `/landing`
- `/mockup-assets/pos-desktop`
- `/mockup-assets/active-orders`
- `/mockup-assets/reports-mobile`
- `/mockup-assets/payment-dialog`
- `/mockup-assets/inventory`
- `/mockup-assets/products`
- `/mockup-assets/restaurant-tables`
- `/mockup-assets/dashboard`
