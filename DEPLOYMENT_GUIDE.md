# AuraPoS Deployment Guide

**Status**: Production Ready ✅  
**Last Updated**: Jun 23, 2026
**Version**: 1.0.0

---

## Quick Start (5 minutes)

### Prerequisites
- Node.js 20.x+
- PostgreSQL 12+ (or Neon PostgreSQL)
- Docker (optional)

### Local Development
```bash
# Install dependencies
pnpm install

# Start the API dev server (canonical API port: 5000)
pnpm dev

# In separate terminals, start frontend apps as needed
pnpm --filter @pos/terminal-web dev  # POS terminal: http://localhost:5173
pnpm --filter @pos/web dev           # Admin/Web app: http://localhost:3000

# API base URL
# Visit: http://localhost:5000
# Tenant: demo-tenant (Demo Restaurant)
```

### Production Deployment
```bash
# Build for production
pnpm build

# Start production server
pnpm start

# Environment variables (set in production):
# See docs/ENVIRONMENT.md for the complete production checklist.
# Never commit real secrets or production credentials.
```

---

## Architecture Overview

### Technology Stack
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Express, TypeScript, Drizzle ORM
- **Database**: PostgreSQL
- **Monorepo**: Turborepo
- **Package Manager**: pnpm

### Project Structure
```
.
├── apps/
│   ├── api/                      # Express backend server
│   │   └── src/
│   │       └── http/
│   │           ├── routes/       # API endpoints
│   │           └── controllers/  # Business logic
│   └── pos-terminal-web/         # React frontend POS terminal
│       └── src/
│           ├── pages/            # Page components
│           ├── components/       # Reusable UI components
│           ├── lib/              # Utilities & hooks
│           └── hooks/            # Custom React hooks
├── packages/
│   ├── domain/                   # Business domain types
│   ├── application/              # Use case logic
│   └── infrastructure/           # Repository implementations
└── shared/                       # Database schema & types
```

---

## Core Features

### Order Management ✅
- **Create Orders** - Add items to cart and checkout
- **Order Types** - Support dine-in, takeaway, delivery
- **Payment Processing** - Full and partial payments
- **Kitchen Integration** - Automatic ticket generation
- **Order Tracking** - Real-time order queue display

### Quick Charge (P2) ✅
- Skip order dialog when metadata pre-set
- 1-click counter service checkout
- Works for pre-assigned tables or takeaway

### Atomic Transactions (P3) ✅
- Order + Payment created atomically
- No orphaned orders if payment fails
- Cart preserved on error for retry

### Multi-Tenancy ✅
- Complete data isolation per tenant
- Feature flags per business type
- Configurable business modules

---

## API Endpoints

### Orders
```
POST   /api/orders                    Create order
GET    /api/orders                    List orders
GET    /api/orders/:id                Get order details
PATCH  /api/orders/:id                Update order
POST   /api/orders/create-and-pay     Create + pay atomically

POST   /api/orders/:id/confirm        Confirm order
POST   /api/orders/:id/complete       Mark complete
POST   /api/orders/:id/cancel         Cancel order
```

### Payments
```
POST   /api/orders/:id/payments       Record payment
GET    /api/orders/:id/payments       Get payment history
```

### Kitchen
```
POST   /api/kitchen-tickets           Create kitchen ticket
GET    /api/kitchen-tickets           List tickets
PATCH  /api/kitchen-tickets/:id       Update ticket status
```

### Tables
```
GET    /api/tables                    List tables
POST   /api/tables                    Create table
PATCH  /api/tables/:id                Update table
```

### Products
```
GET    /api/products                  List products
GET    /api/products/:id              Get product details
```

### Tenants
```
GET    /api/tenants/profile           Get tenant config
```

---

## Configuration

### Environment Variables

`docs/ENVIRONMENT.md` is the canonical reference for all AuraPoS environment variables, including the minimum dev/staging/production requirements and secret-handling rules. Use `.env.example` only as a safe local development template.

#### Development (.env.local)
```
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aurapos_dev
BETTER_AUTH_SECRET=local-dev-secret-change-me-at-least-32-chars
BETTER_AUTH_URL=http://localhost:5000
VITE_API_URL=http://localhost:5000
VITE_APP_ENV=development
```

Canonical local ports:

| Service | Port | Command |
| --- | ---: | --- |
| API | `5000` | `pnpm dev` or `pnpm --filter @pos/api dev` |
| POS Terminal Web | `5173` | `pnpm --filter @pos/terminal-web dev` |
| Admin/Web app | `3000` | `pnpm --filter @pos/web dev` |

The POS terminal Vite config is `apps/pos-terminal-web/vite.config.ts`. The repository root `vite.config.ts` is retained only for the legacy/Replit root-client build path and should not be used as the POS terminal config.

#### Production
Do not commit `.env.production`. Configure production values in the deployment platform secret manager and follow `docs/ENVIRONMENT.md`. Minimum production categories are:

- Runtime: `NODE_ENV`, `PORT`, `TRUST_PROXY`, `LOG_LEVEL`
- Data stores: `DATABASE_URL`, `REDIS_URL`, `RATE_LIMIT_STORE`
- Server secrets: `BETTER_AUTH_SECRET`, `TERMINAL_TOKEN_SECRET`, `ENTITLEMENT_SNAPSHOT_SECRET`
- Public URLs/origins: `BETTER_AUTH_URL`, `CORS_ALLOWED_ORIGINS`, `VITE_API_URL`, `VITE_APP_ENV`

### Database Setup
```bash
# Push schema to database
pnpm db:push

# Generate database types
pnpm db:generate

# Seed demo data
pnpm db:seed
```

---

## Deployment Platforms

### Replit
1. Import repository to Replit
2. Run `pnpm install`
3. Run `pnpm dev`
4. Application accessible via Replit domain

### Vercel (Frontend)
```bash
# Build
pnpm build

# Deploy apps/pos-terminal-web/dist/ or the platform-specific frontend output
```

### Railway/Heroku (Backend)
```bash
# Set DATABASE_URL environment variable
# Deploy apps/api/ with `pnpm --filter @pos/api start` or the platform start command
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
EXPOSE 5000
CMD ["pnpm", "start"]
```

---

## Monitoring & Logs

### Backend Logs
- Check Express console output
- Tenant profile loading confirmed
- Order creation/payment logged

### Frontend Logs
- Check browser console (F12)
- Vite hot-reload messages
- API request/response in Network tab

### Database
```bash
# View recent orders
psql $DATABASE_URL
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;

# View payments
SELECT * FROM order_payments ORDER BY created_at DESC LIMIT 10;

# View kitchen tickets
SELECT * FROM kitchen_tickets ORDER BY created_at DESC LIMIT 10;
```

---

## Troubleshooting

### Port Already in Use
```bash
# Kill process on the relevant canonical port
lsof -ti:5000 | xargs kill -9  # API
lsof -ti:5173 | xargs kill -9  # POS Terminal Web
lsof -ti:3000 | xargs kill -9  # Admin/Web app

# Or override the API port when running the API only
PORT=5002 pnpm dev
```

### Database Connection Issues
```bash
# Test connection
psql $DATABASE_URL

# Check environment variable
echo $DATABASE_URL
```

### Frontend Not Loading
- Clear browser cache (Ctrl+Shift+Delete)
- Check Vite server in terminal
- Verify API_URL in environment

### Hot Reload Not Working
- Restart Vite server (Ctrl+C, `pnpm --filter @pos/terminal-web dev`)
- Check for syntax errors in changed file
- Verify file is in correct directory

---

## Performance Optimization

### Frontend
- Code splitting enabled (Vite)
- React Query caching active
- Images lazy-loaded
- CSS optimized with Tailwind

### Backend
- Database indexes created
- Query optimization in place
- Connection pooling configured
- Request compression enabled

### Database
- Indexes on tenant_id, status fields
- Proper foreign keys configured
- Query performance monitored

---

## Security Checklist

- [x] Multi-tenant data isolation
- [x] Input validation (Zod schemas)
- [x] SQL injection prevention (Drizzle ORM)
- [x] CORS configured properly
- [x] XSS protection via React
- [x] Environment variables for secrets
- [ ] HTTPS enabled (configure in production)
- [ ] Authentication added (JWT or OAuth)
- [ ] Rate limiting (implement in production)
- [ ] OWASP compliance review

---

## Support & Resources

### Documentation
- `docs/ORDER_LIFECYCLE.md` - Order flow explanation
- `docs/FEATURES_CHECKLIST.md` - Complete feature list
- `IMPLEMENTATION_STATUS.md` - Technical status

### Code References
- `packages/core/utils/orderStatus.ts` - Order status helpers
- `apps/api/src/http/routes/orders.ts` - Order API
- `apps/pos-terminal-web/src/pages/pos.tsx` - POS UI

---

## Next Steps

### Before Production Launch
1. ✅ Test order creation and payment flows
2. ✅ Verify kitchen ticket generation
3. ✅ Test multi-tenant isolation
4. ⏳ Set up monitoring and alerts
5. ⏳ Configure backup strategy
6. ⏳ Add HTTPS/SSL certificate
7. ⏳ Set up authentication (if needed)
8. ⏳ Performance load testing

### Post-Launch
1. Monitor error rates in production
2. Gather user feedback
3. Plan Phase 2 features (Bills, Analytics, etc.)
4. Scale database/server as needed

---

**Built with**: TypeScript, React, Express, Drizzle ORM, PostgreSQL  
**Status**: Production Ready ✅  
**Support**: See docs/ directory for detailed documentation
