# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PickRanky (formerly PickTrend) is a trending shopping product ranking service that:
- Allows admin to manually register products with YouTube review videos
- Ranks products by calculated score (views, engagement, virality, recency)
- Categories: electronics, beauty, appliances, food (Korean market focus)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS + Radix UI primitives
- **State**: React Query (server) + Zustand (client)
- **Auth**: NextAuth.js with Credentials provider
- **APIs**: YouTube Data API v3, Coupang affiliate
- **Utilities**: cheerio (HTML parsing), date-fns (date formatting), zod (validation)

## Commands

```bash
# Development
npm run dev          # Start dev server (runs prisma generate via predev hook)
npm run build        # Production build (includes prisma generate)
npm run lint         # ESLint

# Database (Prisma)
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema changes (no migration)
npm run db:migrate   # Create and run migrations (dev only)
npm run db:studio    # Open Prisma Studio GUI
```

Note: On Windows, `predev` script may not run automatically. Run `npm run db:generate` manually if Prisma client is not generated.

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
3. For each product: select category, enter affiliate URL, optionally search/select videos
4. Register all products at once (videos are optional)

### Key Modules

- `src/lib/youtube/client.ts` - YouTube Data API v3 integration (search, video details, channel details)
- `src/lib/ranking/score-calculator.ts` - Scoring algorithm (100 points max)
- `src/lib/coupang/parser.ts` - Coupang HTML/JSON parser for bulk registration
- `src/app/admin/products/new/page.tsx` - Single product registration UI
- `src/app/admin/products/bulk/page.tsx` - Bulk product registration UI
- `src/hooks/useFormPersist.ts` - localStorage-based form persistence with debouncing
- `src/hooks/useCategories.ts` - Category fetching hook with React Query

### Trend Data Collection

Multi-source trend keyword collection system:

**Search Trend Sources:**
- `src/lib/trends/naver-datalab.ts` - Naver DataLab API (requires API keys)
- `src/lib/trends/google-trends.ts` - Google Trends RSS feed (`https://trends.google.com/trending/rss?geo=KR`)
- `src/lib/trends/zum-crawler.ts` - Zum homepage crawler (extracts from `window.__INITIAL_STATE__`)
- `src/lib/trends/daum-crawler.ts` - Daum (non-functional: 투데이 버블 requires JS rendering)

**Community Crawlers:**
- `src/lib/trends/dcinside-crawler.ts` - DC Inside 실시간 베스트 (`gall.dcinside.com/board/lists/?id=dcbest`)
- `src/lib/trends/fmkorea-crawler.ts` - FM Korea 인기글 (`www.fmkorea.com/best`)
- `src/lib/trends/theqoo-crawler.ts` - TheQoo HOT (`theqoo.net/hot`)

**Key Components:**
- `src/lib/trends/matcher.ts` - Matches trend keywords to products (name similarity, category matching)
- `src/lib/trends/keyword-cluster.ts` - Similarity-based keyword clustering (Jaro-Winkler + N-gram)
- `src/app/admin/trends/page.tsx` - Admin trend management UI

**Clustering System:**
- Groups similar keywords from different sources using similarity threshold (default: 0.7)
- Uses combined Jaro-Winkler and N-gram similarity for better matching
- Cross-source bonus applied when keyword appears in multiple sources
- Models: `TrendKeywordCluster`, `TrendKeywordClusterMember`

**Data Flow:**
1. Collection job fetches trending keywords from enabled sources
2. Keywords normalized and saved to `TrendKeyword` table
3. Metrics (search volume, rank) saved to `TrendMetric` table
4. Clustering groups similar keywords via `TrendKeywordCluster`
5. Matcher associates keywords with products via `TrendProductMatch`

**Environment Variables:**
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` - Naver DataLab API
- `GOOGLE_TRENDS_ENABLED` - Enable Google Trends RSS collection
- `ZUM_CRAWLING_ENABLED` - Enable Zum homepage crawling
- `DCINSIDE_CRAWLING_ENABLED` - Enable DC Inside 실시간 베스트 crawling
- `FMKOREA_CRAWLING_ENABLED` - Enable FM Korea 인기글 crawling
- `THEQOO_CRAWLING_ENABLED` - Enable TheQoo HOT crawling
- `CLUSTER_SIMILARITY_THRESHOLD` - Minimum similarity for clustering (default: 0.7)

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

### Trend Score Algorithm (125 Points Max)

`src/lib/trends/ranking-generator.ts` - Generates trend keyword rankings

**Score Components:**
- Base Score (0-100 points): Latest search volume from trend sources (Google Trends, Zum)
- Recency Bonus (0-10 points): How recent the latest metric is (6h: +10, 24h: +7, 72h: +4, 1w: +2)
- Consistency Bonus (0-10 points): Number of metrics collected (20+: +10, 10+: +7, 5+: +4, 2+: +2)
- Product Match Bonus (0-5 points): Number of matched products (5+: +5, 3+: +3, 1+: +1)

**Ranking Generation:**
- Rankings are generated per period (DAILY, MONTHLY)
- Previous period's ranks are compared for rank change display (UP/DOWN/NEW/SAME)
- Admin triggers ranking generation via `/api/admin/trends/rankings`

### Public APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/rankings` | GET | Fetch rankings with pagination (period, category, sortBy filters) |
| `/api/products/[id]` | GET | Fetch single product with videos and metrics |
| `/api/products/popular` | GET | Fetch popular products by all-time click count (limit param) |
| `/api/products/new` | GET | Fetch newest products by creation date (limit param) |
| `/api/videos/popular` | GET | Fetch popular videos by view count (limit param) |
| `/api/categories` | GET | Fetch active categories |
| `/api/track/click` | POST | Track affiliate link clicks |
| `/api/track/view` | POST | Track page views |

### Admin APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/youtube/search` | POST | Search YouTube videos |
| `/api/admin/products` | GET | List products with pagination |
| `/api/admin/products` | POST | Create product with videos |
| `/api/admin/products/[id]` | GET/PATCH/DELETE | Product CRUD |
| `/api/admin/videos` | GET/POST | Video management |
| `/api/admin/videos/[id]` | GET/PATCH/DELETE | Video CRUD |
| `/api/admin/categories` | GET/POST | Category management |
| `/api/admin/categories/[id]` | GET/PATCH/DELETE | Category CRUD |
| `/api/admin/dashboard` | GET | Dashboard stats |
| `/api/admin/analytics` | GET | Analytics data |
| `/api/admin/opengraph` | GET | Fetch Open Graph metadata |
| `/api/admin/rankings/[id]` | DELETE | Delete ranking period |
| `/api/admin/trends` | GET/POST | Trend keyword management |
| `/api/admin/trends/[id]` | GET/PATCH/DELETE | Trend keyword CRUD |
| `/api/admin/trends/collect` | POST/GET | Trigger/view trend data collection |
| `/api/admin/trends/match` | POST | Match keywords to products |
| `/api/admin/trends/rankings` | POST/GET | Generate rankings / List ranking periods |
| `/api/admin/trends/cluster` | POST/GET | Cluster keywords by similarity / List clusters |

### Trend APIs (Public)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/trends` | GET | List trend keywords with filters |
| `/api/trends/[id]` | GET | Get trend keyword with matched products |
| `/api/trends/popular` | GET | Get popular trending keywords |
| `/api/trends/method` | GET | Get ranking calculation method description |

### Homepage Grid Components

- `src/components/products/product-grid.tsx` - Auto-rotating product grid with slide animation
- `src/components/videos/video-grid.tsx` - Auto-rotating video grid with YouTube link handling

Features:
- Display 5 items per page (responsive: 2-5 columns based on viewport)
- Auto-rotation with configurable interval (staggered: 5s, 7s, 6s to avoid sync)
- Pause on hover, manual navigation buttons
- CSS transform slide animation (translateX, 500ms duration)
- Click tracking for products, YouTube link handling for videos

### SEO Implementation

**Metadata & Structured Data:**
- `src/app/layout.tsx` - Root metadata with OG tags, Twitter Cards, Google/Naver verification
- `src/app/robots.ts` - Crawler rules (blocks `/admin/`, `/api/admin/`)
- `src/app/sitemap.ts` - Dynamic sitemap (products, categories, static pages)

**Dynamic Metadata Pages:**
- `src/app/products/[id]/page.tsx` - Product schema JSON-LD + BreadcrumbList
- `src/app/categories/[category]/page.tsx` - Category ItemList JSON-LD
- `src/app/rankings/layout.tsx` - Rankings page metadata
- `src/app/page.tsx` - Organization + WebSite schema JSON-LD

**Page Architecture:**
- Dynamic pages converted to server components for SEO
- Client interactivity moved to `*-client.tsx` files (e.g., `product-client.tsx`)
- Server fetches data → passes to client component as `initialData`

### UI & Theming

- `src/components/providers.tsx` - App-level providers (ThemeProvider, QueryClient, SessionProvider)
- `src/app/globals.css` - CSS variables for light/dark mode (HSL format)
- `src/components/ui/` - Reusable UI components (Button, Card, Badge, etc.)
- Dark/light mode via `next-themes` with `class` attribute strategy
- Blue brand color (#3B82F6) with Vercel-style backgrounds
- PWA support: `manifest.ts` + SVG icons (`icon.svg`, `apple-icon.svg`)

### Authentication

Admin-only NextAuth.js with Credentials provider:
- Single password stored in `ADMIN_PASSWORD` env var (plain text comparison)
- Middleware protects `/admin/*` and `/api/admin/*` routes
- JWT sessions with 24-hour expiry

### Database Schema

Core models in `prisma/schema.prisma`:
- `Category` - Dynamic categories with sort order and active flag
- `Product` - Products with normalized names and affiliate links
- `Video` - YouTube videos linked to products (REGULAR or SHORTS)
- `VideoMetric` - Video metrics (views, likes, comments) at collection time
- `RankingPeriod` - Ranking periods (YEARLY, MONTHLY, DAILY, FOUR_HOURLY)
- `ProductRanking` - Ranked products per period with score breakdown
- `LinkClick` / `PageView` - Analytics tracking
- `AdminAction` - Admin action audit log
- `CollectionJob` - Background job status tracking
- `SystemConfig` - Key-value system configuration

**Trend Models:**
- `TrendKeyword` - Trend keywords with source (NAVER_DATALAB, GOOGLE_TRENDS, ZUM, DAUM, DCINSIDE, FMKOREA, THEQOO, MANUAL)
- `TrendMetric` - Search volume/rank metrics per keyword and collection time
- `TrendProductMatch` - Keyword-to-product associations with match score
- `TrendRankingPeriod` / `TrendKeywordRanking` - Trend keyword rankings by period
- `TrendCollectionJob` - Trend collection job tracking
- `TrendKeywordCluster` - Groups of similar keywords from multiple sources
- `TrendKeywordClusterMember` - Keyword membership in clusters with similarity scores

### Form State Persistence

Admin product registration forms persist data to localStorage:
- Survives page refresh and browser back/forward navigation
- Uses `useMultiFormPersist` hook with 500ms debounce
- Cleared automatically on successful submission
- Storage keys: `admin-product-form`, `admin-bulk-product-form`

### Video Search Results Sorting

Search results are sorted by: score (desc) → viewCount (desc) → likeCount (desc)

### Responsive Design

Mobile-first approach with Tailwind breakpoints:
- Rankings page: Vertical card layout on mobile (`sm:hidden`), horizontal on sm+
- Product detail: Responsive text sizes (`text-xl sm:text-2xl md:text-3xl`)
- Admin layout: Slide-out sidebar on mobile, fixed sidebar on lg+
- Key patterns: `sm:hidden` / `hidden sm:flex` for conditional layouts

## Environment Variables

Required (see `.env.example`):
- `DATABASE_URL` / `DIRECT_URL` - PostgreSQL (Supabase recommended)
- `YOUTUBE_API_KEY` - YouTube Data API v3 (must be enabled in Google Cloud Console)
- `NEXTAUTH_SECRET` - Random string for JWT encryption (min 32 chars)
- `ADMIN_PASSWORD` - Admin password (plain text)

Optional (Trend Collection):
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` - Naver DataLab API keys
- `GOOGLE_TRENDS_ENABLED` - Set to "true" to enable Google Trends RSS
- `ZUM_CRAWLING_ENABLED` - Set to "true" to enable Zum crawling
- `DCINSIDE_CRAWLING_ENABLED` - Set to "true" to enable DC Inside crawling
- `FMKOREA_CRAWLING_ENABLED` - Set to "true" to enable FM Korea crawling
- `THEQOO_CRAWLING_ENABLED` - Set to "true" to enable TheQoo crawling
- `CLUSTER_SIMILARITY_THRESHOLD` - Similarity threshold for clustering (default: 0.7)

## Known Limitations

### Coupang Server-Side Requests

Coupang blocks all server-side requests (403 Access Denied), including:
- Affiliate link redirects (`link.coupang.com/a/xxx`)
- Product page scraping (`www.coupang.com/vp/products/xxx`)
- Open Graph metadata fetching

The `/api/admin/opengraph` route already handles this with `COUPANG_BLOCKED` error.

**Why auto-fetching from affiliate links is not possible:**
1. Coupang's bot detection blocks server requests regardless of User-Agent
2. Coupang Partners API only provides:
   - Search API: keyword → product list (rate limited: 10 calls/hour)
   - Deeplink API: product URL → affiliate link (opposite direction)
3. No API endpoint exists for: affiliate link → product info

**Current workaround:** Use the Goldbox console script to extract product data client-side, then paste into bulk registration.

## Deployment Notes

### Supabase with PgBouncer

When using Supabase pooler (port 6543), add `?pgbouncer=true` to `DATABASE_URL` to avoid "prepared statement already exists" errors:
```
DATABASE_URL=postgresql://...@pooler.supabase.com:6543/postgres?pgbouncer=true
```
Use `DIRECT_URL` (port 5432) for migrations.
