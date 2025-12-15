import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trends/[id]
 * Public API to get a single trend keyword with details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const keyword = await prisma.trendKeyword.findUnique({
      where: { id, isActive: true },
      include: {
        productMatches: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: true,
                thumbnailUrl: true,
                price: true,
                originalPrice: true,
                discountRate: true,
                affiliateUrl: true,
                isActive: true,
                _count: {
                  select: { videos: true },
                },
              },
            },
          },
          where: {
            product: { isActive: true },
          },
          orderBy: { matchScore: "desc" },
        },
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 30, // Last 30 data points for chart
        },
        rankings: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            period: true,
          },
        },
      },
    });

    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "Keyword not found" },
        { status: 404 }
      );
    }

    // Transform metrics for chart
    const chartData = keyword.metrics
      .map((m) => ({
        date: m.collectedAt.toISOString().split("T")[0],
        volume: m.searchVolume,
        source: m.source,
        rank: m.rank,
      }))
      .reverse(); // Chronological order

    // Get current rank info
    const currentRanking = keyword.rankings[0];
    const rankInfo = currentRanking
      ? {
          rank: currentRanking.rank,
          previousRank: currentRanking.previousRank,
          score: currentRanking.score,
          period: {
            type: currentRanking.period.periodType,
            year: currentRanking.period.year,
            month: currentRanking.period.month,
            day: currentRanking.period.day,
          },
        }
      : null;

    // Calculate rank change
    let rankChange = null;
    if (rankInfo && rankInfo.previousRank !== null) {
      const diff = rankInfo.previousRank - rankInfo.rank;
      rankChange = {
        type: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "SAME",
        value: Math.abs(diff),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        keyword: {
          id: keyword.id,
          keyword: keyword.keyword,
          category: keyword.category,
          source: keyword.source,
          createdAt: keyword.createdAt,
        },
        ranking: rankInfo,
        rankChange,
        products: keyword.productMatches.map((m) => ({
          ...m.product,
          matchScore: m.matchScore,
          matchType: m.matchType,
          videoCount: m.product._count.videos,
        })),
        chartData,
        latestMetric: keyword.metrics[0]
          ? {
              searchVolume: keyword.metrics[0].searchVolume,
              collectedAt: keyword.metrics[0].collectedAt,
              source: keyword.metrics[0].source,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Trend detail API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trend details" },
      { status: 500 }
    );
  }
}
