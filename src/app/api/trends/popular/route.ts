import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/trends/popular
 * Public API to fetch popular/trending keywords (for homepage)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "10")), 50);
    const category = searchParams.get("category");

    // Build filter
    const where: any = { isActive: true };
    if (category) {
      where.category = category;
    }

    // Get keywords with their latest metrics, sorted by search volume
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
          where: {
            product: { isActive: true },
          },
          orderBy: { matchScore: "desc" },
          take: 1,
        },
        _count: {
          select: { productMatches: true },
        },
      },
    });

    // Sort by latest search volume
    const sortedKeywords = keywords
      .map((keyword) => ({
        id: keyword.id,
        keyword: keyword.keyword,
        category: keyword.category,
        source: keyword.source,
        searchVolume: keyword.metrics[0]?.searchVolume || 0,
        productCount: keyword._count.productMatches,
        topProduct: keyword.productMatches[0]?.product || null,
        collectedAt: keyword.metrics[0]?.collectedAt || keyword.createdAt,
      }))
      .sort((a, b) => b.searchVolume - a.searchVolume)
      .slice(0, limit);

    // Add rank
    const rankedKeywords = sortedKeywords.map((keyword, index) => ({
      ...keyword,
      rank: index + 1,
    }));

    return NextResponse.json({
      success: true,
      data: {
        keywords: rankedKeywords,
        total: rankedKeywords.length,
      },
    });
  } catch (error) {
    console.error("Popular trends API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch popular trends" },
      { status: 500 }
    );
  }
}
