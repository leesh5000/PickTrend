import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import TrendDetailClient from "./trend-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTrendKeyword(id: string) {
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
        take: 30,
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

  return keyword;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const keyword = await getTrendKeyword(id);

  if (!keyword) {
    return {
      title: "키워드를 찾을 수 없습니다 | PickRanky",
    };
  }

  return {
    title: `${keyword.keyword} 트렌드 | PickRanky`,
    description: `${keyword.keyword} 검색어 트렌드와 관련 상품을 확인하세요. ${keyword.productMatches.length}개의 연관 상품이 있습니다.`,
    openGraph: {
      title: `${keyword.keyword} 트렌드 | PickRanky`,
      description: `${keyword.keyword} 검색어 트렌드와 관련 상품을 확인하세요.`,
      type: "website",
    },
  };
}

export default async function TrendDetailPage({ params }: PageProps) {
  const { id } = await params;
  const keyword = await getTrendKeyword(id);

  if (!keyword) {
    notFound();
  }

  // Transform data for client
  const chartData = keyword.metrics
    .map((m) => ({
      date: m.collectedAt.toISOString().split("T")[0],
      volume: m.searchVolume,
      source: m.source,
      rank: m.rank,
    }))
    .reverse();

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

  const products = keyword.productMatches.map((m) => ({
    id: m.product.id,
    name: m.product.name,
    category: m.product.category,
    thumbnailUrl: m.product.thumbnailUrl,
    price: m.product.price,
    originalPrice: m.product.originalPrice,
    discountRate: m.product.discountRate,
    affiliateUrl: m.product.affiliateUrl,
    videoCount: m.product._count.videos,
    matchScore: m.matchScore,
    matchType: m.matchType,
  }));

  const latestMetric = keyword.metrics[0]
    ? {
        searchVolume: keyword.metrics[0].searchVolume,
        collectedAt: keyword.metrics[0].collectedAt.toISOString(),
        source: keyword.metrics[0].source,
      }
    : null;

  return (
    <TrendDetailClient
      keyword={{
        id: keyword.id,
        keyword: keyword.keyword,
        category: keyword.category,
        source: keyword.source,
        createdAt: keyword.createdAt.toISOString(),
      }}
      ranking={rankInfo}
      products={products}
      chartData={chartData}
      latestMetric={latestMetric}
    />
  );
}
