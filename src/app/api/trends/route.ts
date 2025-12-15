import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PeriodType, TrendSource } from "@prisma/client";

/**
 * GET /api/trends
 * Public API to fetch trend keyword rankings
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20")), 100);
    const category = searchParams.get("category");
    const source = searchParams.get("source") as TrendSource | null;
    const sortBy = searchParams.get("sortBy") || "score";
    const period = searchParams.get("period") || "daily";

    // Get current date for period calculation
    const now = new Date();
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month")!)
      : now.getMonth() + 1;
    const day = searchParams.get("day")
      ? parseInt(searchParams.get("day")!)
      : now.getDate();

    // Determine period type
    let periodType: PeriodType;
    switch (period) {
      case "monthly":
        periodType = "MONTHLY";
        break;
      case "daily":
      default:
        periodType = "DAILY";
        break;
    }

    // Find the ranking period
    const rankingPeriod = await prisma.trendRankingPeriod.findFirst({
      where: {
        periodType,
        year,
        ...(periodType === "MONTHLY" ? { month } : { month, day }),
      },
      orderBy: { createdAt: "desc" },
    });

    // If no ranking period exists, fetch directly from keywords with metrics
    if (!rankingPeriod) {
      // Fallback: Get keywords with their latest metrics
      const where: any = { isActive: true };
      if (category) {
        where.category = category;
      }
      if (source && Object.values(TrendSource).includes(source)) {
        where.source = source;
      }

      const keywords = await prisma.trendKeyword.findMany({
        where,
        include: {
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
          },
          productMatches: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  thumbnailUrl: true,
                  price: true,
                },
              },
            },
            orderBy: { matchScore: "desc" },
            take: 3,
          },
          _count: {
            select: { productMatches: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      });

      const total = await prisma.trendKeyword.count({ where });

      // Transform to ranking format
      const rankings = keywords.map((keyword, index) => ({
        id: keyword.id,
        rank: (page - 1) * limit + index + 1,
        previousRank: null,
        score: keyword.metrics[0]?.searchVolume || 0,
        searchVolume: keyword.metrics[0]?.searchVolume || 0,
        productCount: keyword._count.productMatches,
        keyword: {
          id: keyword.id,
          keyword: keyword.keyword,
          category: keyword.category,
          source: keyword.source,
        },
        products: keyword.productMatches.map((m) => m.product),
        change: { type: "NEW" as const, value: 0, label: "NEW" },
      }));

      return NextResponse.json({
        success: true,
        data: {
          period: null,
          rankings,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    }

    // Build ranking query filters
    const rankingWhere: any = { periodId: rankingPeriod.id };

    // Category filter needs to go through keyword relation
    if (category || source) {
      rankingWhere.keyword = {};
      if (category) {
        rankingWhere.keyword.category = category;
      }
      if (source && Object.values(TrendSource).includes(source)) {
        rankingWhere.keyword.source = source;
      }
    }

    // Determine sort order
    let orderBy: any = { rank: "asc" };
    switch (sortBy) {
      case "score":
        orderBy = { score: "desc" };
        break;
      case "volume":
        orderBy = { searchVolume: "desc" };
        break;
      case "products":
        orderBy = { productCount: "desc" };
        break;
      case "rank":
      default:
        orderBy = { rank: "asc" };
        break;
    }

    // Fetch rankings
    const [rankings, total] = await Promise.all([
      prisma.trendKeywordRanking.findMany({
        where: rankingWhere,
        include: {
          keyword: {
            include: {
              productMatches: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      thumbnailUrl: true,
                      price: true,
                    },
                  },
                },
                orderBy: { matchScore: "desc" },
                take: 3,
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trendKeywordRanking.count({ where: rankingWhere }),
    ]);

    // Calculate rank changes
    const transformedRankings = rankings.map((ranking) => {
      let change: { type: "UP" | "DOWN" | "SAME" | "NEW"; value: number; label: string };

      if (ranking.previousRank === null) {
        change = { type: "NEW", value: 0, label: "NEW" };
      } else if (ranking.previousRank > ranking.rank) {
        change = {
          type: "UP",
          value: ranking.previousRank - ranking.rank,
          label: `+${ranking.previousRank - ranking.rank}`,
        };
      } else if (ranking.previousRank < ranking.rank) {
        change = {
          type: "DOWN",
          value: ranking.rank - ranking.previousRank,
          label: `-${ranking.rank - ranking.previousRank}`,
        };
      } else {
        change = { type: "SAME", value: 0, label: "-" };
      }

      return {
        id: ranking.id,
        rank: ranking.rank,
        previousRank: ranking.previousRank,
        score: ranking.score,
        searchVolume: ranking.searchVolume,
        productCount: ranking.productCount,
        keyword: {
          id: ranking.keyword.id,
          keyword: ranking.keyword.keyword,
          category: ranking.keyword.category,
          source: ranking.keyword.source,
        },
        products: ranking.keyword.productMatches.map((m) => m.product),
        change,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        period: {
          id: rankingPeriod.id,
          year: rankingPeriod.year,
          month: rankingPeriod.month,
          day: rankingPeriod.day,
          startedAt: rankingPeriod.startedAt,
        },
        rankings: transformedRankings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Trends API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
