"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCategoryMap } from "@/hooks/useCategories";
import { format } from "date-fns";
import { TrendSource } from "@prisma/client";

interface TrendRankingItem {
  id: string;
  rank: number;
  previousRank: number | null;
  score: number;
  searchVolume: number;
  productCount: number;
  keyword: {
    id: string;
    keyword: string;
    category: string | null;
    source: TrendSource;
  };
  products: Array<{
    id: string;
    name: string;
    thumbnailUrl: string | null;
    price: number | null;
  }>;
  change: {
    type: "UP" | "DOWN" | "SAME" | "NEW";
    value: number;
    label: string;
  };
}

interface TrendsResponse {
  success: boolean;
  data: {
    rankings: TrendRankingItem[];
    period: {
      startedAt: string;
    } | null;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

const LIMIT_OPTIONS = [50, 100] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const SORT_OPTIONS = [
  { value: "rank", label: "순위순" },
  { value: "score", label: "점수순" },
  { value: "volume", label: "검색량순" },
  { value: "products", label: "상품 많은순" },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]["value"];

async function fetchTrends(params: {
  period: string;
  category?: string;
  sortBy?: string;
  page: number;
  limit: number;
  year?: number;
  month?: number;
  day?: number;
}): Promise<TrendsResponse> {
  const searchParams = new URLSearchParams({
    period: params.period,
    page: params.page.toString(),
    limit: params.limit.toString(),
  });
  if (params.category) {
    searchParams.set("category", params.category);
  }
  if (params.sortBy) {
    searchParams.set("sortBy", params.sortBy);
  }
  if (params.year) {
    searchParams.set("year", params.year.toString());
  }
  if (params.month) {
    searchParams.set("month", params.month.toString());
  }
  if (params.day) {
    searchParams.set("day", params.day.toString());
  }

  const res = await fetch(`/api/trends?${searchParams}`);
  return res.json();
}

function RankChange({
  change,
}: {
  change: { type: string; value: number; label: string };
}) {
  if (change.type === "NEW") {
    return (
      <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
        NEW
      </span>
    );
  }
  if (change.type === "UP") {
    return (
      <span className="text-xs font-medium text-green-500">
        ▲{change.value}
      </span>
    );
  }
  if (change.type === "DOWN") {
    return (
      <span className="text-xs font-medium text-red-500">▼{change.value}</span>
    );
  }
  return <span className="text-xs text-muted-foreground">-</span>;
}

function getSourceLabel(source: TrendSource) {
  switch (source) {
    case "NAVER_DATALAB":
      return "N";
    case "GOOGLE_TRENDS":
      return "G";
    case "DAUM":
      return "D";
    case "MANUAL":
    default:
      return "M";
  }
}

export default function TrendsPage() {
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [category, setCategory] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<SortOption>("rank");
  const [limit, setLimit] = useState<LimitOption>(50);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);

  const { categoryMap, categories } = useCategoryMap();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["trends", period, category, sortBy, limit, selectedDate],
    queryFn: ({ pageParam = 1 }) =>
      fetchTrends({
        period,
        category,
        sortBy,
        page: pageParam,
        limit,
        year: selectedDate.getFullYear(),
        month: selectedDate.getMonth() + 1,
        day: period === "daily" ? selectedDate.getDate() : undefined,
      }),
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.data?.pagination;
      if (pagination && pagination.page < pagination.totalPages) {
        return pagination.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  // Infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
    });
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    return () => observer.disconnect();
  }, [handleObserver]);

  const allRankings =
    data?.pages.flatMap((page) => page.data?.rankings || []) || [];
  const totalCount = data?.pages[0]?.data?.pagination?.total || 0;

  // Category filter - show limited on mobile
  const visibleCategories = isCategoryExpanded
    ? categories
    : categories?.slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Title */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              검색어 트렌드 랭킹
            </h1>
            <p className="text-muted-foreground">
              현재 인기 있는 검색어와 관련 상품을 확인하세요.
            </p>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Period & Sort */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={period === "daily" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPeriod("daily")}
                  >
                    일별
                  </Button>
                  <Button
                    variant={period === "monthly" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPeriod("monthly")}
                  >
                    월별
                  </Button>

                  <div className="w-px bg-border mx-2" />

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-3 py-1 border rounded-lg text-sm bg-background"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={limit}
                    onChange={(e) =>
                      setLimit(parseInt(e.target.value) as LimitOption)
                    }
                    className="px-3 py-1 border rounded-lg text-sm bg-background"
                  >
                    {LIMIT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}개
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Selector */}
                <div>
                  <input
                    type={period === "monthly" ? "month" : "date"}
                    value={
                      period === "monthly"
                        ? format(selectedDate, "yyyy-MM")
                        : format(selectedDate, "yyyy-MM-dd")
                    }
                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                    className="px-3 py-2 border rounded-lg text-sm bg-background"
                  />
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant={!category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCategory(undefined)}
                  >
                    전체
                  </Button>
                  {visibleCategories?.map((cat) => (
                    <Button
                      key={cat.key}
                      variant={category === cat.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCategory(cat.key)}
                    >
                      {cat.name}
                    </Button>
                  ))}
                  {categories && categories.length > 4 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCategoryExpanded(!isCategoryExpanded)}
                    >
                      {isCategoryExpanded ? "접기" : `+${categories.length - 4}개 더보기`}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rankings List */}
          <div className="mb-4 text-sm text-muted-foreground">
            총 {totalCount}개 키워드
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : allRankings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                등록된 트렌드 키워드가 없습니다.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {allRankings.map((item) => (
                <Link key={item.id} href={`/trends/${item.keyword.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Rank */}
                        <div className="flex flex-col items-center min-w-[48px]">
                          <span className="text-2xl font-bold text-primary">
                            #{item.rank}
                          </span>
                          <RankChange change={item.change} />
                        </div>

                        {/* Keyword Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-semibold truncate">
                              {item.keyword.keyword}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getSourceLabel(item.keyword.source)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {item.keyword.category && (
                              <Badge variant="secondary" className="text-xs">
                                {categoryMap[item.keyword.category] ||
                                  item.keyword.category}
                              </Badge>
                            )}
                            <span>검색량 {item.searchVolume}</span>
                            <span>연관상품 {item.productCount}개</span>
                          </div>
                        </div>

                        {/* Related Products Preview */}
                        {item.products.length > 0 && (
                          <div className="hidden sm:flex -space-x-2">
                            {item.products.slice(0, 3).map((product) => (
                              <div
                                key={product.id}
                                className="w-10 h-10 rounded-lg border-2 border-background overflow-hidden bg-muted"
                              >
                                {product.thumbnailUrl ? (
                                  <img
                                    src={product.thumbnailUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                    📦
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Load More */}
          <div ref={loadMoreRef} className="py-8 flex justify-center">
            {isFetchingNextPage && (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
