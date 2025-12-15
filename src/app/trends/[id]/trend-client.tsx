"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryMap } from "@/hooks/useCategories";
import { formatPrice } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendDetailClientProps {
  keyword: {
    id: string;
    keyword: string;
    category: string | null;
    source: string;
    createdAt: string;
  };
  ranking: {
    rank: number;
    previousRank: number | null;
    score: number;
    period: {
      type: string;
      year: number;
      month: number | null;
      day: number | null;
    };
  } | null;
  products: Array<{
    id: string;
    name: string;
    category: string | null;
    thumbnailUrl: string | null;
    price: number | null;
    originalPrice: number | null;
    discountRate: number | null;
    affiliateUrl: string | null;
    videoCount: number;
    matchScore: number;
    matchType: string;
  }>;
  chartData: Array<{
    date: string;
    volume: number;
    source: string;
    rank: number | null;
  }>;
  latestMetric: {
    searchVolume: number;
    collectedAt: string;
    source: string;
  } | null;
}

function getSourceLabel(source: string) {
  switch (source) {
    case "NAVER_DATALAB":
      return "Naver DataLab";
    case "GOOGLE_TRENDS":
      return "Google Trends";
    case "DAUM":
      return "다음";
    case "MANUAL":
    default:
      return "수동 등록";
  }
}

function RankChange({
  currentRank,
  previousRank,
}: {
  currentRank: number;
  previousRank: number | null;
}) {
  if (previousRank === null) {
    return (
      <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
        NEW
      </span>
    );
  }

  const diff = previousRank - currentRank;
  if (diff > 0) {
    return (
      <span className="text-sm font-medium text-green-500">
        ▲ {diff}
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="text-sm font-medium text-red-500">
        ▼ {Math.abs(diff)}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">-</span>;
}

export default function TrendDetailClient({
  keyword,
  ranking,
  products,
  chartData,
  latestMetric,
}: TrendDetailClientProps) {
  const { categoryMap } = useCategoryMap();

  const handleProductClick = async (productId: string, affiliateUrl: string | null) => {
    if (!affiliateUrl) return;

    // Track click
    try {
      await fetch("/api/track/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          source: "trend_detail",
        }),
      });
    } catch (error) {
      console.error("Failed to track click:", error);
    }

    window.open(affiliateUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <nav className="mb-4 text-sm text-muted-foreground">
            <Link href="/trends" className="hover:text-foreground">
              트렌드
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{keyword.keyword}</span>
          </nav>

          {/* Header Section */}
          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold">{keyword.keyword}</h1>
              <Badge variant="outline">{getSourceLabel(keyword.source)}</Badge>
              {keyword.category && (
                <Badge variant="secondary">
                  {categoryMap[keyword.category] || keyword.category}
                </Badge>
              )}
            </div>

            {/* Ranking Info */}
            {ranking && (
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-primary">
                    #{ranking.rank}
                  </span>
                  <RankChange
                    currentRank={ranking.rank}
                    previousRank={ranking.previousRank}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  점수: {ranking.score.toFixed(1)}
                </div>
              </div>
            )}

            {/* Latest Metric */}
            {latestMetric && (
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>검색량 지수: {latestMetric.searchVolume}</span>
                <span>
                  수집일:{" "}
                  {new Date(latestMetric.collectedAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart Section */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>검색량 트렌드</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getMonth() + 1}/${date.getDate()}`;
                            }}
                          />
                          <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                          <Tooltip
                            labelFormatter={(value) =>
                              new Date(value).toLocaleDateString("ko-KR")
                            }
                            formatter={(value: number) => [value, "검색량 지수"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="volume"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      검색량 데이터가 없습니다.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Stats Section */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">키워드 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">소스</span>
                    <span>{getSourceLabel(keyword.source)}</span>
                  </div>
                  {keyword.category && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">카테고리</span>
                      <span>
                        {categoryMap[keyword.category] || keyword.category}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">등록일</span>
                    <span>
                      {new Date(keyword.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">연관 상품</span>
                    <span>{products.length}개</span>
                  </div>
                </CardContent>
              </Card>

              {ranking && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">랭킹 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">현재 순위</span>
                      <span className="font-semibold">#{ranking.rank}</span>
                    </div>
                    {ranking.previousRank && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">이전 순위</span>
                        <span>#{ranking.previousRank}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">트렌드 점수</span>
                      <span>{ranking.score.toFixed(1)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Related Products Section */}
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">
              연관 상품 ({products.length})
            </h2>

            {products.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  연관된 상품이 없습니다.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map((product) => (
                  <Card
                    key={product.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() =>
                      handleProductClick(product.id, product.affiliateUrl)
                    }
                  >
                    <div className="aspect-square bg-muted relative">
                      {product.thumbnailUrl ? (
                        <img
                          src={product.thumbnailUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <span className="text-4xl">📦</span>
                        </div>
                      )}
                      {product.discountRate && product.discountRate > 0 && (
                        <Badge className="absolute top-2 right-2 bg-red-500">
                          -{product.discountRate}%
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium text-sm line-clamp-2 mb-2">
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-2 mb-2">
                        {product.category && (
                          <Badge variant="outline" className="text-xs">
                            {categoryMap[product.category] || product.category}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          영상 {product.videoCount}개
                        </Badge>
                      </div>
                      <div className="flex items-end gap-2">
                        {product.price && (
                          <span className="text-lg font-bold text-primary">
                            {formatPrice(product.price)}
                          </span>
                        )}
                        {product.originalPrice &&
                          product.originalPrice > (product.price || 0) && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(product.originalPrice)}
                            </span>
                          )}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        매칭 점수: {product.matchScore.toFixed(0)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Back Button */}
          <div className="mt-8">
            <Link href="/trends">
              <Button variant="outline">← 트렌드 목록으로</Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
