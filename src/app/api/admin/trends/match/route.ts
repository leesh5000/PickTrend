import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  matchKeywordToProducts,
  matchAllKeywordsToProducts,
} from "@/lib/trends/matcher";

/**
 * POST /api/admin/trends/match
 * Trigger product matching for keywords
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { keywordId, clearExisting = false, preserveManual = true } = body;

    let result;

    if (keywordId) {
      // Match single keyword
      result = await matchKeywordToProducts(keywordId, {
        clearExisting,
        preserveManual,
      });

      // Log admin action
      await prisma.adminAction.create({
        data: {
          actionType: "MATCH",
          targetType: "trend_keyword",
          targetId: keywordId,
          details: {
            matched: result.matched,
            updated: result.updated,
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          keywordId,
          ...result,
        },
        message: `Matched ${result.matched} products, updated ${result.updated} existing matches`,
      });
    } else {
      // Match all keywords
      result = await matchAllKeywordsToProducts({
        clearExisting,
        preserveManual,
      });

      // Log admin action
      await prisma.adminAction.create({
        data: {
          actionType: "MATCH_ALL",
          targetType: "trend_keyword",
          targetId: "all",
          details: {
            keywordsProcessed: result.keywordsProcessed,
            totalMatched: result.totalMatched,
            totalUpdated: result.totalUpdated,
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: result,
        message: `Processed ${result.keywordsProcessed} keywords, matched ${result.totalMatched} products, updated ${result.totalUpdated} existing matches`,
      });
    }
  } catch (error) {
    console.error("Admin match trends API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to match products: ${message}` },
      { status: 500 }
    );
  }
}
