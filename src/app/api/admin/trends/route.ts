import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";
import { TrendSource } from "@prisma/client";

/**
 * GET /api/admin/trends
 * List trend keywords with pagination and filtering
 */
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
    const source = searchParams.get("source") as TrendSource | null;
    const category = searchParams.get("category");
    const isActive = searchParams.get("isActive");
    const sortBy = searchParams.get("sortBy") || "createdAtDesc";

    // Build filter
    const where: any = {};
    if (search) {
      where.OR = [
        { keyword: { contains: search, mode: "insensitive" } },
        { normalizedKeyword: { contains: search, mode: "insensitive" } },
      ];
    }
    if (source && Object.values(TrendSource).includes(source)) {
      where.source = source;
    }
    if (category) {
      where.category = category;
    }
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      where.isActive = isActive === "true";
    }

    // Build orderBy
    let orderBy: any = { createdAt: "desc" };
    switch (sortBy) {
      case "createdAtAsc":
        orderBy = { createdAt: "asc" };
        break;
      case "createdAtDesc":
        orderBy = { createdAt: "desc" };
        break;
      case "keyword":
        orderBy = { keyword: "asc" };
        break;
      case "keywordDesc":
        orderBy = { keyword: "desc" };
        break;
    }

    const [keywords, total] = await Promise.all([
      prisma.trendKeyword.findMany({
        where,
        include: {
          _count: {
            select: {
              productMatches: true,
              metrics: true,
            },
          },
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trendKeyword.count({ where }),
    ]);

    // Add latest search volume to response
    const keywordsWithVolume = keywords.map((keyword) => ({
      ...keyword,
      latestSearchVolume: keyword.metrics[0]?.searchVolume || null,
      latestRank: keyword.metrics[0]?.rank || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        keywords: keywordsWithVolume,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Admin trends API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trend keywords" },
      { status: 500 }
    );
  }
}

interface CreateTrendKeywordRequest {
  keyword: string;
  category?: string;
  source?: TrendSource;
  isActive?: boolean;
}

/**
 * POST /api/admin/trends
 * Create a new trend keyword
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateTrendKeywordRequest = await request.json();
    const { keyword, category, source = "MANUAL", isActive = true } = body;

    // Validation
    if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Keyword is required" },
        { status: 400 }
      );
    }

    // Generate normalized keyword
    const normalizedKeyword = normalizeKorean(keyword.trim());

    // Check if keyword already exists
    const existingKeyword = await prisma.trendKeyword.findUnique({
      where: { normalizedKeyword },
    });

    if (existingKeyword) {
      return NextResponse.json(
        { success: false, error: "A similar keyword already exists" },
        { status: 409 }
      );
    }

    // Verify category exists if provided
    if (category) {
      const categoryExists = await prisma.category.findUnique({
        where: { key: category },
      });

      if (!categoryExists) {
        return NextResponse.json(
          { success: false, error: "Invalid category" },
          { status: 400 }
        );
      }
    }

    // Create keyword
    const trendKeyword = await prisma.$transaction(async (tx) => {
      const newKeyword = await tx.trendKeyword.create({
        data: {
          keyword: keyword.trim(),
          normalizedKeyword,
          category: category || null,
          source,
          isActive,
        },
      });

      // Log admin action
      await tx.adminAction.create({
        data: {
          actionType: "CREATE",
          targetType: "trend_keyword",
          targetId: newKeyword.id,
          details: {
            keyword: newKeyword.keyword,
            source: newKeyword.source,
            category: newKeyword.category,
          },
        },
      });

      return newKeyword;
    });

    return NextResponse.json({
      success: true,
      data: { keyword: trendKeyword },
    });
  } catch (error) {
    console.error("Admin create trend keyword API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to create trend keyword: ${message}` },
      { status: 500 }
    );
  }
}
