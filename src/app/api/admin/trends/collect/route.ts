import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { collectAllNaverTrends, collectNaverTrendsForKeywords } from "@/lib/trends/naver-datalab";
import { collectAllGoogleTrends, importGoogleTrendingKeywords } from "@/lib/trends/google-trends";
import { collectAllDaumTrends } from "@/lib/trends/daum-crawler";
import { TrendSource } from "@prisma/client";

interface CollectRequest {
  source?: TrendSource | "ALL";
  importNew?: boolean; // For Google/Daum: import new trending keywords
  keywordIds?: string[]; // Specific keywords to collect
}

/**
 * POST /api/admin/trends/collect
 * Trigger data collection from trend sources
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CollectRequest = await request.json();
    const { source = "ALL", importNew = false, keywordIds } = body;

    const results: any = {
      naver: null,
      google: null,
      daum: null,
    };

    const errors: string[] = [];

    // Collect from Naver DataLab
    if (source === "ALL" || source === "NAVER_DATALAB") {
      try {
        if (keywordIds && keywordIds.length > 0) {
          const result = await collectNaverTrendsForKeywords(keywordIds);
          results.naver = {
            collected: result.collected,
            errors: result.errors,
          };
        } else {
          const result = await collectAllNaverTrends();
          results.naver = {
            jobId: result.jobId,
            collected: result.collected,
            errors: result.errors,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Naver: ${message}`);
        results.naver = { error: message };
      }
    }

    // Collect from Google Trends
    if (source === "ALL" || source === "GOOGLE_TRENDS") {
      try {
        // Import new trending keywords if requested
        if (importNew) {
          const importResult = await importGoogleTrendingKeywords();
          results.google = {
            imported: importResult.imported,
            importErrors: importResult.errors,
          };
        }

        // Collect data for existing keywords
        const collectResult = await collectAllGoogleTrends();
        results.google = {
          ...results.google,
          jobId: collectResult.jobId,
          collected: collectResult.collected,
          errors: collectResult.errors,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Google: ${message}`);
        results.google = { ...results.google, error: message };
      }
    }

    // Collect from Daum
    if (source === "ALL" || source === "DAUM") {
      try {
        const result = await collectAllDaumTrends();
        results.daum = {
          jobId: result.jobId,
          collected: result.collected,
          imported: result.imported,
          errors: result.errors,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Daum: ${message}`);
        results.daum = { error: message };
      }
    }

    // Log admin action
    await prisma.adminAction.create({
      data: {
        actionType: "COLLECT",
        targetType: "trend_source",
        targetId: source,
        details: {
          source,
          importNew,
          keywordCount: keywordIds?.length || "all",
          results,
        },
      },
    });

    // Calculate totals
    const totalCollected =
      (results.naver?.collected || 0) +
      (results.google?.collected || 0) +
      (results.daum?.collected || 0);

    const totalImported =
      (results.google?.imported || 0) + (results.daum?.imported || 0);

    return NextResponse.json({
      success: true,
      data: {
        source,
        totalCollected,
        totalImported,
        details: results,
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Collected ${totalCollected} metrics, imported ${totalImported} new keywords`,
    });
  } catch (error) {
    console.error("Admin collect trends API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to collect trends: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/trends/collect
 * Get recent collection job status
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") as TrendSource | null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    const where: any = {};
    if (source) {
      where.source = source;
    }

    const jobs = await prisma.trendCollectionJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: { jobs },
    });
  } catch (error) {
    console.error("Admin get collection jobs API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch collection jobs" },
      { status: 500 }
    );
  }
}
