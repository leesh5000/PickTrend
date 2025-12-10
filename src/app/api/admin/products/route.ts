import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";
import {
  calculateVideoScore,
  calculateProductScoreWithBreakdown,
  VideoMetricsForScore,
  VideoWithScore,
} from "@/lib/ranking/score-calculator";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { PeriodType, Prisma } from "@prisma/client";

/**
 * Get or create a ranking period
 */
async function getOrCreatePeriod(
  tx: Prisma.TransactionClient,
  periodType: PeriodType,
  year: number,
  month: number | null,
  day: number | null,
  hourSlot: number | null,
  startedAt: Date,
  endedAt: Date
) {
  let period = await tx.rankingPeriod.findFirst({
    where: { periodType, year, month, day, hourSlot },
  });

  if (!period) {
    period = await tx.rankingPeriod.create({
      data: { periodType, year, month, day, hourSlot, startedAt, endedAt },
    });
  }

  return period;
}

/**
 * Get or create ranking periods for a given date
 */
async function getOrCreateRankingPeriods(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hourSlot = Math.floor(now.getHours() / 4);

  const periods: { type: PeriodType; id: string }[] = [];

  // DAILY period
  const dailyPeriod = await getOrCreatePeriod(
    tx, "DAILY", year, month, day, null,
    startOfDay(now), endOfDay(now)
  );
  periods.push({ type: "DAILY", id: dailyPeriod.id });

  // FOUR_HOURLY period
  const fourHourlyStart = new Date(now);
  fourHourlyStart.setHours(hourSlot * 4, 0, 0, 0);
  const fourHourlyEnd = new Date(now);
  fourHourlyEnd.setHours((hourSlot + 1) * 4 - 1, 59, 59, 999);

  const fourHourlyPeriod = await getOrCreatePeriod(
    tx, "FOUR_HOURLY", year, month, day, hourSlot,
    fourHourlyStart, fourHourlyEnd
  );
  periods.push({ type: "FOUR_HOURLY", id: fourHourlyPeriod.id });

  // MONTHLY period
  const monthlyPeriod = await getOrCreatePeriod(
    tx, "MONTHLY", year, month, null, null,
    startOfMonth(now), endOfMonth(now)
  );
  periods.push({ type: "MONTHLY", id: monthlyPeriod.id });

  return periods;
}

/**
 * Recalculate rankings for all active products in a period
 */
async function recalculateRankings(
  tx: Prisma.TransactionClient,
  periodId: string,
  productScoreData: {
    productId: string;
    score: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    videoCount: number;
    avgEngagement: number;
  }
) {
  // Get all existing rankings for this period
  const existingRankings = await tx.productRanking.findMany({
    where: { periodId },
    orderBy: { score: "desc" },
  });

  // Check if product already has a ranking
  const existingProductRanking = existingRankings.find(
    (r) => r.productId === productScoreData.productId
  );

  if (existingProductRanking) {
    // Update existing ranking
    await tx.productRanking.update({
      where: { id: existingProductRanking.id },
      data: {
        score: productScoreData.score,
        totalViews: productScoreData.totalViews,
        totalLikes: productScoreData.totalLikes,
        totalComments: productScoreData.totalComments,
        videoCount: productScoreData.videoCount,
        avgEngagement: productScoreData.avgEngagement,
      },
    });
  } else {
    // Create new ranking
    await tx.productRanking.create({
      data: {
        productId: productScoreData.productId,
        periodId,
        rank: 0, // Will be updated below
        previousRank: null,
        score: productScoreData.score,
        totalViews: productScoreData.totalViews,
        totalLikes: productScoreData.totalLikes,
        totalComments: productScoreData.totalComments,
        videoCount: productScoreData.videoCount,
        avgEngagement: productScoreData.avgEngagement,
      },
    });
  }

  // Recalculate all ranks for this period
  const allRankings = await tx.productRanking.findMany({
    where: { periodId },
    orderBy: { score: "desc" },
  });

  // Update ranks
  for (let i = 0; i < allRankings.length; i++) {
    const ranking = allRankings[i];
    const newRank = i + 1;
    if (ranking.rank !== newRank) {
      await tx.productRanking.update({
        where: { id: ranking.id },
        data: {
          previousRank: ranking.rank > 0 ? ranking.rank : null,
          rank: newRank,
        },
      });
    }
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category");
    const isActive = searchParams.get("isActive");
    const sortBy = searchParams.get("sortBy") || "createdAtDesc";

    // Build filter
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { normalizedName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) {
      where.category = category;
    }
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    // Build orderBy based on sortBy parameter
    let orderBy: any = { createdAt: "desc" };
    switch (sortBy) {
      case "createdAtAsc":
        orderBy = { createdAt: "asc" };
        break;
      case "createdAtDesc":
        orderBy = { createdAt: "desc" };
        break;
      case "name":
        orderBy = { name: "asc" };
        break;
      case "nameDesc":
        orderBy = { name: "desc" };
        break;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          _count: {
            select: {
              videos: true,
              clicks: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Admin products API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

interface VideoInput {
  youtubeId: string;
  title: string;
  description?: string;
  channelId: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  isShorts: boolean;
  subscriberCount: number | null;
}

interface CreateProductRequest {
  name: string;
  category: string;
  affiliateUrl: string;
  productUrl?: string;
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  price?: number;
  originalPrice?: number;
  discountRate?: number;
  videos: VideoInput[];
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateProductRequest = await request.json();
    const { name, category, affiliateUrl, productUrl, thumbnailUrl, thumbnailUrls, price, originalPrice, discountRate, videos } = body;

    // Validation
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Product name is required" },
        { status: 400 }
      );
    }

    if (!category || category.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Category is required" },
        { status: 400 }
      );
    }

    // Verify category exists in database
    const categoryExists = await prisma.category.findUnique({
      where: { key: category },
    });

    if (!categoryExists) {
      return NextResponse.json(
        { success: false, error: "Invalid category" },
        { status: 400 }
      );
    }

    if (!affiliateUrl || affiliateUrl.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Affiliate URL is required" },
        { status: 400 }
      );
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one video is required" },
        { status: 400 }
      );
    }

    // Generate normalized name
    const normalizedName = normalizeKorean(name.trim());

    // Check if product with same normalized name exists
    const existingProduct = await prisma.product.findUnique({
      where: { normalizedName },
    });

    if (existingProduct) {
      return NextResponse.json(
        { success: false, error: "A product with a similar name already exists" },
        { status: 409 }
      );
    }

    // Check if any video already exists
    const existingVideoIds = await prisma.video.findMany({
      where: {
        youtubeId: { in: videos.map((v) => v.youtubeId) },
      },
      select: { youtubeId: true },
    });

    if (existingVideoIds.length > 0) {
      const existingIds = existingVideoIds.map((v) => v.youtubeId).join(", ");
      return NextResponse.json(
        { success: false, error: `Some videos already exist: ${existingIds}` },
        { status: 409 }
      );
    }

    // Calculate video scores and prepare data
    const videosWithScores: VideoWithScore[] = [];
    const videoCreateData = videos.map((video) => {
      const metrics: VideoMetricsForScore = {
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        subscriberCount: video.subscriberCount,
        publishedAt: new Date(video.publishedAt),
        videoType: video.isShorts ? "SHORTS" : "REGULAR",
      };
      const score = calculateVideoScore(metrics);

      videosWithScores.push({
        score,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
      });

      return {
        youtubeId: video.youtubeId,
        title: video.title,
        description: video.description || null,
        channelId: video.channelId,
        channelName: video.channelName,
        subscriberCount: video.subscriberCount,
        publishedAt: new Date(video.publishedAt),
        videoType: video.isShorts ? "SHORTS" as const : "REGULAR" as const,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
      };
    });

    // Calculate product score
    const productScoreBreakdown = calculateProductScoreWithBreakdown(videosWithScores);

    // Use first video's thumbnail if not provided
    const productThumbnail = thumbnailUrl || thumbnailUrls?.[0] || videos[0]?.thumbnailUrl || null;
    const productThumbnailUrls = thumbnailUrls && thumbnailUrls.length > 0
      ? thumbnailUrls
      : (thumbnailUrl ? [thumbnailUrl] : []);

    // Create product with videos in a transaction
    const product = await prisma.$transaction(async (tx) => {
      // Create product
      const newProduct = await tx.product.create({
        data: {
          name: name.trim(),
          normalizedName,
          category,
          affiliateUrl: affiliateUrl.trim(),
          productUrl: productUrl?.trim() || null,
          thumbnailUrl: productThumbnail,
          thumbnailUrls: productThumbnailUrls,
          price: price || null,
          originalPrice: originalPrice || null,
          discountRate: discountRate || null,
        },
      });

      // Create videos
      for (const videoData of videoCreateData) {
        const video = await tx.video.create({
          data: {
            ...videoData,
            productId: newProduct.id,
          },
        });

        // Create initial video metrics
        const originalVideo = videos.find((v) => v.youtubeId === videoData.youtubeId)!;
        await tx.videoMetric.create({
          data: {
            videoId: video.id,
            collectedAt: new Date(),
            viewCount: originalVideo.viewCount,
            likeCount: originalVideo.likeCount,
            commentCount: originalVideo.commentCount,
            subscriberCount: originalVideo.subscriberCount,
          },
        });
      }

      // Log admin action
      await tx.adminAction.create({
        data: {
          actionType: "CREATE",
          targetType: "product",
          targetId: newProduct.id,
          details: {
            name: newProduct.name,
            category: newProduct.category,
            videoCount: videos.length,
            score: productScoreBreakdown.score,
          },
        },
      });

      return newProduct;
    });

    // Create rankings for the new product
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const periods = await getOrCreateRankingPeriods(tx, now);

      const productScoreData = {
        productId: product.id,
        score: productScoreBreakdown.score,
        totalViews: productScoreBreakdown.totalViews,
        totalLikes: productScoreBreakdown.totalLikes,
        totalComments: productScoreBreakdown.totalComments,
        videoCount: productScoreBreakdown.videoCount,
        avgEngagement: productScoreBreakdown.avgEngagement,
      };

      // Create/update rankings for each period
      for (const period of periods) {
        await recalculateRankings(tx, period.id, productScoreData);
      }
    });

    // Fetch the created product with videos
    const createdProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        videos: {
          include: {
            metrics: {
              orderBy: { collectedAt: "desc" },
              take: 1,
            },
          },
        },
        _count: {
          select: {
            videos: true,
            clicks: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        product: createdProduct,
        score: productScoreBreakdown.score,
        scoreBreakdown: productScoreBreakdown.breakdown,
      },
    });
  } catch (error) {
    console.error("Admin create product API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to create product: ${message}` },
      { status: 500 }
    );
  }
}
