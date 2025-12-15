import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/trends/[id]/matches
 * Get product matches for a trend keyword
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify keyword exists
    const keyword = await prisma.trendKeyword.findUnique({
      where: { id },
    });

    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "Keyword not found" },
        { status: 404 }
      );
    }

    const matches = await prisma.trendProductMatch.findMany({
      where: { keywordId: id },
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
          },
        },
      },
      orderBy: { matchScore: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: { matches },
    });
  } catch (error) {
    console.error("Admin get trend matches API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch matches" },
      { status: 500 }
    );
  }
}

interface CreateMatchRequest {
  productId: string;
  matchScore?: number;
}

/**
 * POST /api/admin/trends/[id]/matches
 * Create a manual product match
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body: CreateMatchRequest = await request.json();
    const { productId, matchScore = 100 } = body;

    // Validation
    if (!productId) {
      return NextResponse.json(
        { success: false, error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Verify keyword exists
    const keyword = await prisma.trendKeyword.findUnique({
      where: { id },
    });

    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "Keyword not found" },
        { status: 404 }
      );
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    // Check if match already exists
    const existingMatch = await prisma.trendProductMatch.findUnique({
      where: {
        keywordId_productId: {
          keywordId: id,
          productId,
        },
      },
    });

    if (existingMatch) {
      // Update existing match to manual
      const updatedMatch = await prisma.trendProductMatch.update({
        where: { id: existingMatch.id },
        data: {
          matchScore,
          matchType: "manual",
          isManual: true,
        },
        include: {
          product: true,
        },
      });

      return NextResponse.json({
        success: true,
        data: { match: updatedMatch },
        message: "Match updated to manual",
      });
    }

    // Create new manual match
    const match = await prisma.$transaction(async (tx) => {
      const newMatch = await tx.trendProductMatch.create({
        data: {
          keywordId: id,
          productId,
          matchScore,
          matchType: "manual",
          isManual: true,
        },
        include: {
          product: true,
        },
      });

      // Log admin action
      await tx.adminAction.create({
        data: {
          actionType: "CREATE",
          targetType: "trend_match",
          targetId: newMatch.id,
          details: {
            keywordId: id,
            keyword: keyword.keyword,
            productId,
            productName: product.name,
          },
        },
      });

      return newMatch;
    });

    return NextResponse.json({
      success: true,
      data: { match },
    });
  } catch (error) {
    console.error("Admin create trend match API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to create match: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/trends/[id]/matches
 * Delete a product match (expects matchId in query string)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: "Match ID is required" },
        { status: 400 }
      );
    }

    // Verify match exists and belongs to this keyword
    const match = await prisma.trendProductMatch.findFirst({
      where: {
        id: matchId,
        keywordId: id,
      },
      include: {
        keyword: true,
        product: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Match not found" },
        { status: 404 }
      );
    }

    // Delete match
    await prisma.$transaction(async (tx) => {
      await tx.trendProductMatch.delete({
        where: { id: matchId },
      });

      // Log admin action
      await tx.adminAction.create({
        data: {
          actionType: "DELETE",
          targetType: "trend_match",
          targetId: matchId,
          details: {
            keywordId: id,
            keyword: match.keyword.keyword,
            productId: match.productId,
            productName: match.product.name,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Match deleted successfully",
    });
  } catch (error) {
    console.error("Admin delete trend match API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to delete match: ${message}` },
      { status: 500 }
    );
  }
}
