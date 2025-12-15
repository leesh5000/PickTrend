/**
 * Trend Ranking Generator
 *
 * Generates trend keyword rankings based on collected metrics.
 *
 * Score Calculation:
 * - Base Score (0-100): Latest search volume from trend sources
 * - Recency Bonus (0-10): Higher score for recently trending keywords
 * - Consistency Bonus (0-10): Bonus for keywords that appear across multiple collections
 * - Product Match Bonus (0-5): Bonus for keywords with matched products
 *
 * Final Score = Base Score + Recency Bonus + Consistency Bonus + Product Match Bonus
 * Maximum possible score: 125 points
 */

import prisma from "@/lib/prisma";
import { PeriodType } from "@prisma/client";

interface KeywordScoreData {
  keywordId: string;
  keyword: string;
  baseScore: number;
  recencyBonus: number;
  consistencyBonus: number;
  productMatchBonus: number;
  totalScore: number;
  searchVolume: number;
  productCount: number;
  metricCount: number;
  latestMetricDate: Date | null;
}

/**
 * Calculate score for a single keyword based on its metrics
 */
async function calculateKeywordScore(keywordId: string): Promise<KeywordScoreData | null> {
  const keyword = await prisma.trendKeyword.findUnique({
    where: { id: keywordId, isActive: true },
    include: {
      metrics: {
        orderBy: { collectedAt: "desc" },
        take: 30, // Last 30 metrics for consistency calculation
      },
      _count: {
        select: { productMatches: true },
      },
    },
  });

  if (!keyword || keyword.metrics.length === 0) {
    return null;
  }

  const latestMetric = keyword.metrics[0];
  const now = new Date();

  // Base Score (0-100): Latest search volume
  const baseScore = Math.min(latestMetric.searchVolume, 100);

  // Recency Bonus (0-10): Based on how recent the latest metric is
  const hoursSinceLastMetric = (now.getTime() - latestMetric.collectedAt.getTime()) / (1000 * 60 * 60);
  let recencyBonus = 0;
  if (hoursSinceLastMetric <= 6) {
    recencyBonus = 10; // Very recent
  } else if (hoursSinceLastMetric <= 24) {
    recencyBonus = 7; // Within a day
  } else if (hoursSinceLastMetric <= 72) {
    recencyBonus = 4; // Within 3 days
  } else if (hoursSinceLastMetric <= 168) {
    recencyBonus = 2; // Within a week
  }

  // Consistency Bonus (0-10): Based on number of metrics collected
  const metricCount = keyword.metrics.length;
  let consistencyBonus = 0;
  if (metricCount >= 20) {
    consistencyBonus = 10;
  } else if (metricCount >= 10) {
    consistencyBonus = 7;
  } else if (metricCount >= 5) {
    consistencyBonus = 4;
  } else if (metricCount >= 2) {
    consistencyBonus = 2;
  }

  // Product Match Bonus (0-5): Based on number of matched products
  const productCount = keyword._count.productMatches;
  let productMatchBonus = 0;
  if (productCount >= 5) {
    productMatchBonus = 5;
  } else if (productCount >= 3) {
    productMatchBonus = 3;
  } else if (productCount >= 1) {
    productMatchBonus = 1;
  }

  const totalScore = baseScore + recencyBonus + consistencyBonus + productMatchBonus;

  return {
    keywordId: keyword.id,
    keyword: keyword.keyword,
    baseScore,
    recencyBonus,
    consistencyBonus,
    productMatchBonus,
    totalScore,
    searchVolume: latestMetric.searchVolume,
    productCount,
    metricCount,
    latestMetricDate: latestMetric.collectedAt,
  };
}

/**
 * Generate rankings for a specific period
 */
export async function generateTrendRankings(
  periodType: PeriodType,
  options?: {
    year?: number;
    month?: number;
    day?: number;
  }
): Promise<{
  periodId: string;
  rankingsCreated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const now = new Date();

  const year = options?.year ?? now.getFullYear();
  const month = options?.month ?? now.getMonth() + 1;
  const day = periodType === "DAILY" ? (options?.day ?? now.getDate()) : null;

  // Calculate period start and end times
  let startedAt: Date;
  let endedAt: Date;

  if (periodType === "DAILY") {
    startedAt = new Date(year, month - 1, day!, 0, 0, 0);
    endedAt = new Date(year, month - 1, day!, 23, 59, 59);
  } else if (periodType === "MONTHLY") {
    startedAt = new Date(year, month - 1, 1, 0, 0, 0);
    endedAt = new Date(year, month, 0, 23, 59, 59); // Last day of month
  } else {
    // YEARLY
    startedAt = new Date(year, 0, 1, 0, 0, 0);
    endedAt = new Date(year, 11, 31, 23, 59, 59);
  }

  // Find or create ranking period
  let rankingPeriod = await prisma.trendRankingPeriod.findFirst({
    where: {
      periodType,
      year,
      month: periodType !== "YEARLY" ? month : null,
      day: periodType === "DAILY" ? day : null,
    },
  });

  if (!rankingPeriod) {
    rankingPeriod = await prisma.trendRankingPeriod.create({
      data: {
        periodType,
        year,
        month: periodType !== "YEARLY" ? month : null,
        day: periodType === "DAILY" ? day : null,
        startedAt,
        endedAt,
      },
    });
  }

  // Get previous period for rank comparison
  let previousPeriod = null;
  if (periodType === "DAILY") {
    const prevDate = new Date(year, month - 1, day! - 1);
    previousPeriod = await prisma.trendRankingPeriod.findFirst({
      where: {
        periodType,
        year: prevDate.getFullYear(),
        month: prevDate.getMonth() + 1,
        day: prevDate.getDate(),
      },
      include: {
        rankings: true,
      },
    });
  } else if (periodType === "MONTHLY") {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    previousPeriod = await prisma.trendRankingPeriod.findFirst({
      where: {
        periodType,
        year: prevYear,
        month: prevMonth,
      },
      include: {
        rankings: true,
      },
    });
  }

  // Build previous rank map
  const previousRankMap = new Map<string, number>();
  if (previousPeriod?.rankings) {
    for (const ranking of previousPeriod.rankings) {
      previousRankMap.set(ranking.keywordId, ranking.rank);
    }
  }

  // Get all active keywords (exclude community sources from ranking)
  const keywords = await prisma.trendKeyword.findMany({
    where: {
      isActive: true,
      source: {
        notIn: ["DCINSIDE", "FMKOREA", "THEQOO"],
      },
    },
    select: { id: true },
  });

  // Calculate scores for all keywords
  const scoreDataList: KeywordScoreData[] = [];
  for (const keyword of keywords) {
    try {
      const scoreData = await calculateKeywordScore(keyword.id);
      if (scoreData) {
        scoreDataList.push(scoreData);
      }
    } catch (error) {
      errors.push(`Failed to calculate score for keyword ${keyword.id}`);
    }
  }

  // Sort by total score (descending)
  scoreDataList.sort((a, b) => b.totalScore - a.totalScore);

  // Delete existing rankings for this period (to regenerate)
  await prisma.trendKeywordRanking.deleteMany({
    where: { periodId: rankingPeriod.id },
  });

  // Create rankings
  let rankingsCreated = 0;
  for (let i = 0; i < scoreDataList.length; i++) {
    const scoreData = scoreDataList[i];
    const rank = i + 1;
    const previousRank = previousRankMap.get(scoreData.keywordId) ?? null;

    try {
      await prisma.trendKeywordRanking.create({
        data: {
          keywordId: scoreData.keywordId,
          periodId: rankingPeriod.id,
          rank,
          previousRank,
          score: scoreData.totalScore,
          searchVolume: scoreData.searchVolume,
          productCount: scoreData.productCount,
        },
      });
      rankingsCreated++;
    } catch (error) {
      errors.push(`Failed to create ranking for keyword ${scoreData.keyword}`);
    }
  }

  return {
    periodId: rankingPeriod.id,
    rankingsCreated,
    errors,
  };
}

/**
 * Generate both daily and monthly rankings for current date
 */
export async function generateAllRankings(): Promise<{
  daily: { periodId: string; rankingsCreated: number; errors: string[] };
  monthly: { periodId: string; rankingsCreated: number; errors: string[] };
}> {
  const daily = await generateTrendRankings("DAILY");
  const monthly = await generateTrendRankings("MONTHLY");

  return { daily, monthly };
}

/**
 * Get ranking calculation details for display
 */
export function getRankingMethodDescription(): {
  title: string;
  description: string;
  factors: Array<{
    name: string;
    maxPoints: number;
    description: string;
  }>;
} {
  return {
    title: "검색어 트렌드 순위 산정 방식",
    description: "검색어 순위는 다양한 요소를 종합하여 산정됩니다. 최대 125점 만점으로 계산됩니다.",
    factors: [
      {
        name: "검색량 점수",
        maxPoints: 100,
        description: "Google Trends, Zum 등 검색 트렌드 소스에서 수집한 검색량 지수입니다.",
      },
      {
        name: "최신성 보너스",
        maxPoints: 10,
        description: "최근에 수집된 데이터일수록 높은 점수를 받습니다. (6시간 이내: +10점)",
      },
      {
        name: "지속성 보너스",
        maxPoints: 10,
        description: "꾸준히 검색되는 키워드에 보너스를 부여합니다. (20회 이상 수집: +10점)",
      },
      {
        name: "상품 연관 보너스",
        maxPoints: 5,
        description: "연관된 상품이 많을수록 보너스를 받습니다. (5개 이상: +5점)",
      },
    ],
  };
}
