import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";
import { TrendSource } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/trends/[id]
 * Get a single trend keyword with details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const keyword = await prisma.trendKeyword.findUnique({
      where: { id },
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
                affiliateUrl: true,
              },
            },
          },
          orderBy: { matchScore: "desc" },
        },
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 30, // Last 30 records
        },
        _count: {
          select: {
            productMatches: true,
            metrics: true,
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

    return NextResponse.json({
      success: true,
      data: { keyword },
    });
  } catch (error) {
    console.error("Admin get trend keyword API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trend keyword" },
      { status: 500 }
    );
  }
}

interface UpdateTrendKeywordRequest {
  keyword?: string;
  category?: string | null;
  source?: TrendSource;
  isActive?: boolean;
}

/**
 * PATCH /api/admin/trends/[id]
 * Update a trend keyword
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body: UpdateTrendKeywordRequest = await request.json();
    const { keyword, category, source, isActive } = body;

    // Check if keyword exists
    const existingKeyword = await prisma.trendKeyword.findUnique({
      where: { id },
    });

    if (!existingKeyword) {
      return NextResponse.json(
        { success: false, error: "Keyword not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};

    if (keyword !== undefined && keyword.trim().length > 0) {
      const normalizedKeyword = normalizeKorean(keyword.trim());

      // Check for duplicate if keyword changed
      if (normalizedKeyword !== existingKeyword.normalizedKeyword) {
        const duplicate = await prisma.trendKeyword.findFirst({
          where: {
            normalizedKeyword,
            id: { not: id },
          },
        });

        if (duplicate) {
          return NextResponse.json(
            { success: false, error: "A similar keyword already exists" },
            { status: 409 }
          );
        }
      }

      updateData.keyword = keyword.trim();
      updateData.normalizedKeyword = normalizedKeyword;
    }

    if (category !== undefined) {
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
      updateData.category = category;
    }

    if (source !== undefined) {
      updateData.source = source;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    // Update keyword
    const updatedKeyword = await prisma.$transaction(async (tx) => {
      const updated = await tx.trendKeyword.update({
        where: { id },
        data: updateData,
      });

      // Log admin action
      await tx.adminAction.create({
        data: {
          actionType: "UPDATE",
          targetType: "trend_keyword",
          targetId: id,
          details: {
            changes: updateData,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: { keyword: updatedKeyword },
    });
  } catch (error) {
    console.error("Admin update trend keyword API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to update trend keyword: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/trends/[id]
 * Delete a trend keyword
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Check if keyword exists
    const existingKeyword = await prisma.trendKeyword.findUnique({
      where: { id },
    });

    if (!existingKeyword) {
      return NextResponse.json(
        { success: false, error: "Keyword not found" },
        { status: 404 }
      );
    }

    // Delete keyword (cascade will handle related records)
    await prisma.$transaction(async (tx) => {
      await tx.trendKeyword.delete({
        where: { id },
      });

      // Log admin action
      await tx.adminAction.create({
        data: {
          actionType: "DELETE",
          targetType: "trend_keyword",
          targetId: id,
          details: {
            keyword: existingKeyword.keyword,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Keyword deleted successfully",
    });
  } catch (error) {
    console.error("Admin delete trend keyword API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to delete trend keyword: ${message}` },
      { status: 500 }
    );
  }
}
