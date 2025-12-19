import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PeriodType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "daily";
    const category = searchParams.get("category");
    const source = searchParams.get("source");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Date parameters for specific period lookup
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year")!)
      : undefined;
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month")!)
      : undefined;
    const day = searchParams.get("day")
      ? parseInt(searchParams.get("day")!)
      : undefined;

    // Map period string to PeriodType
    const periodTypeMap: Record<string, PeriodType> = {
      daily: "DAILY",
      monthly: "MONTHLY",
    };
    const periodType = periodTypeMap[period] || "DAILY";

    // Find ranking period - either by specific date or latest
    let rankingPeriod;
    let specificDateRequested = false;

    if (year && month) {
      specificDateRequested = true;
      // Look for specific period
      rankingPeriod = await prisma.articleRankingPeriod.findFirst({
        where: {
          periodType,
          year,
          month,
          ...(periodType === "DAILY" && day ? { day } : {}),
        },
        orderBy: { startedAt: "desc" },
      });
    }

    // Only fallback to latest if no specific date was requested
    if (!rankingPeriod && !specificDateRequested) {
      rankingPeriod = await prisma.articleRankingPeriod.findFirst({
        where: { periodType },
        orderBy: { startedAt: "desc" },
      });
    }

    // Build article filter
    const articleWhere: any = { isActive: true };
    if (category) articleWhere.category = category;
    if (source) articleWhere.source = source;

    // If specific date requested, filter by publishedAt date range
    if (specificDateRequested && year && month) {
      let startDate: Date;
      let endDate: Date;

      if (periodType === "DAILY" && day) {
        // Filter for specific day
        startDate = new Date(year, month - 1, day, 0, 0, 0);
        endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
      } else {
        // Filter for specific month
        startDate = new Date(year, month - 1, 1, 0, 0, 0);
        endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
      }

      articleWhere.publishedAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    // If no ranking period exists, return articles directly sorted by publishedAt
    if (!rankingPeriod) {
      const [articles, total] = await Promise.all([
        prisma.article.findMany({
          where: articleWhere,
          include: {
            products: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    thumbnailUrl: true,
                    affiliateUrl: true,
                  },
                },
              },
              take: 3,
            },
            _count: {
              select: { views: true, shares: true },
            },
          },
          orderBy: { publishedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.article.count({ where: articleWhere }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          period: null,
          articles: articles.map((article, index) => ({
            ...article,
            rank: (page - 1) * limit + index + 1,
            previousRank: null,
            score: 0,
            products: article.products.map((ap) => ap.product),
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    }

    // Get rankings for this period
    const [rankings, total] = await Promise.all([
      prisma.articleRanking.findMany({
        where: {
          periodId: rankingPeriod.id,
          article: articleWhere,
        },
        include: {
          article: {
            include: {
              products: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      thumbnailUrl: true,
                      affiliateUrl: true,
                    },
                  },
                },
                take: 3,
              },
              _count: {
                select: { views: true, shares: true },
              },
            },
          },
        },
        orderBy: { rank: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.articleRanking.count({
        where: {
          periodId: rankingPeriod.id,
          article: articleWhere,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        period: {
          id: rankingPeriod.id,
          type: rankingPeriod.periodType,
          startedAt: rankingPeriod.startedAt,
          endedAt: rankingPeriod.endedAt,
        },
        articles: rankings.map((ranking) => ({
          ...ranking.article,
          rank: ranking.rank,
          previousRank: ranking.previousRank,
          score: ranking.score,
          products: ranking.article.products.map((ap) => ap.product),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("News API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
