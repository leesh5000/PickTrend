import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "daily";

    // Map period string to PeriodType enum
    const periodTypeMap: Record<string, string> = {
      yearly: "YEARLY",
      monthly: "MONTHLY",
      daily: "DAILY",
      four_hourly: "FOUR_HOURLY",
    };
    const periodType = periodTypeMap[period] || "DAILY";

    // Get distinct periods ordered by date
    const periods = await prisma.rankingPeriod.findMany({
      where: {
        periodType: periodType as any,
      },
      orderBy: { startedAt: "desc" },
      take: 30, // Last 30 periods
      select: {
        id: true,
        year: true,
        month: true,
        day: true,
        hourSlot: true,
        startedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: periods,
    });
  } catch (error) {
    console.error("Rankings periods API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch ranking periods" },
      { status: 500 }
    );
  }
}
