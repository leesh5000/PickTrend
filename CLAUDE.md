# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PickTrend is a trending shopping product ranking service that:
- Allows admin to manually register products with YouTube review videos
- Ranks products by calculated score (views, engagement, virality, recency)
- Categories: electronics, beauty, appliances, food (Korean market focus)

## Commands

```bash
# Development
npm run dev          # Start dev server (auto-runs prisma generate)
npm run build        # Production build (includes prisma generate)
npm run lint         # ESLint

# Database (Prisma)
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema changes (no migration)
npm run db:migrate   # Create and run migrations (dev only)
npm run db:studio    # Open Prisma Studio GUI
```

## Architecture

### Product Registration Flow

**Single Registration** (`/admin/products/new`):
1. Enter product info (name, category, affiliate URL)
2. Search YouTube videos by keyword
3. Select videos to associate
4. Score calculated automatically (max 100 points)

**Bulk Registration** (`/admin/products/bulk`):
1. Run Console script on Coupang Goldbox page to extract products as JSON
2. Paste JSON into bulk registration page
3. For each product: select category, enter affiliate URL, search/select videos
4. Register all products at once

### Key Modules

- `src/lib/youtube/client.ts` - YouTube Data API v3 integration (search, video details, channel details)
- `src/lib/ranking/score-calculator.ts` - Scoring algorithm (100 points max)
- `src/lib/coupang/parser.ts` - Coupang HTML/JSON parser for bulk registration
- `src/app/admin/products/new/page.tsx` - Single product registration UI
- `src/app/admin/products/bulk/page.tsx` - Bulk product registration UI

### Score Algorithm (100 Points Max)

**Video Score Components:**
- View Score (0-35 points): log scale based on view count
- Engagement Score (0-30 points): (likes + comments*2) / views ratio
- Virality Score (0-20 points): views / subscribers ratio
- Recency Score (0-15 points): exponential decay (45-day half-life)
- Shorts Bonus: 1.05x multiplier for Shorts videos

**Product Score:**
- Weighted average of top 5 video scores (weights: 1.0, 0.7, 0.5, 0.35, 0.25)
- Video count bonus: 0-5 points based on number of videos
- Final score capped at 100

### Admin APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/youtube/search` | POST | Search YouTube videos |
| `/api/admin/products` | GET | List products with pagination |
| `/api/admin/products` | POST | Create product with videos |
| `/api/admin/products/[id]` | GET/PATCH/DELETE | Product CRUD |
| `/api/admin/videos` | GET/POST | Video management |
| `/api/admin/videos/[id]` | GET/PATCH/DELETE | Video CRUD |

### UI & Theming

- `src/components/providers.tsx` - App-level providers (ThemeProvider, QueryClient, SessionProvider)
- `src/app/globals.css` - CSS variables for light/dark mode (HSL format)
- `src/components/ui/` - Reusable UI components (Button, Card, Badge, etc.)
- Dark/light mode via `next-themes` with `class` attribute strategy
- Blue brand color (#3B82F6) with Vercel-style backgrounds

### Authentication

Admin-only NextAuth.js with Credentials provider:
- Single password stored in `ADMIN_PASSWORD` env var (plain text comparison)
- Middleware protects `/admin/*` and `/api/admin/*` routes
- JWT sessions with 24-hour expiry

### Database Schema

Core models in `prisma/schema.prisma`:
- `Product` - Products with normalized names and affiliate links
- `Video` - YouTube videos linked to products
- `VideoMetric` - Video metrics (views, likes, comments) at registration time
- `RankingPeriod` - Time periods (YEARLY, MONTHLY, DAILY, FOUR_HOURLY)
- `ProductRanking` - Ranked products per period
- `LinkClick` / `PageView` - Analytics tracking
- `SystemConfig` - Key-value system configuration

## Environment Variables

Required (see `.env.example`):
- `DATABASE_URL` / `DIRECT_URL` - PostgreSQL (Supabase recommended)
- `YOUTUBE_API_KEY` - YouTube Data API v3 (must be enabled in Google Cloud Console)
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL`
- `ADMIN_PASSWORD` - Admin password (plain text)
