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

interface RankingItem {
  id: string;
  rank: number;
  previousRank: number | null;
  score: number;
  totalViews: number;
  totalLikes: number;
  videoCount: number;
  product: {
    id: string;
    name: string;
    category: string;
    thumbnailUrl: string | null;
    price: number | null;
    originalPrice: number | null;
    discountRate: number | null;
  };
  change: {
    type: "UP" | "DOWN" | "SAME" | "NEW";
    value: number | null;
    label: string;
  };
}

interface RankingsResponse {
  success: boolean;
  data: {
    rankings: RankingItem[];
    period: {
      startedAt: string;
    };
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

const LIMIT_OPTIONS = [50, 100, 150] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const SORT_OPTIONS = [
  { value: "score", label: "점수순" },
  { value: "price", label: "가격 낮은순" },
  { value: "priceDesc", label: "가격 높은순" },
  { value: "discount", label: "할인율순" },
  { value: "videoCount", label: "영상 많은순" },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]["value"];

async function fetchRankings(params: {
  period: string;
  category?: string;
  sortBy?: string;
  page: number;
  limit: number;
  year?: number;
  month?: number;
  day?: number;
  slot?: number;
}): Promise<RankingsResponse> {
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
  if (params.slot !== undefined) {
    searchParams.set("slot", params.slot.toString());
  }

  const res = await fetch(`/api/rankings?${searchParams}`);
  return res.json();
}

// Get today's date in YYYY-MM-DD format
function getTodayString(): string {
  const today = new Date();
  return format(today, "yyyy-MM-dd");
}

// Get current month in YYYY-MM format
function getCurrentMonthString(): string {
  const today = new Date();
  return format(today, "yyyy-MM");
}

// 모바일에서 기본으로 보여줄 카테고리 개수
const MOBILE_CATEGORY_LIMIT = 3;

export default function RankingsPage() {
  const [period, setPeriod] = useState("daily");
  const [category, setCategory] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const [limit, setLimit] = useState<LimitOption>(50);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthString());
  const [showAllCategories, setShowAllCategories] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { categoryMap, categories } = useCategoryMap();

  // Parse selected date/month into year, month, day
  const getDateParams = () => {
    if (period === "monthly") {
      const [year, month] = selectedMonth.split("-").map(Number);
      return { year, month, day: undefined };
    } else {
      const [year, month, day] = selectedDate.split("-").map(Number);
      return { year, month, day };
    }
  };

  const dateParams = getDateParams();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["rankings", period, category, sortBy, limit, selectedDate, selectedMonth],
    queryFn: ({ pageParam = 1 }) =>
      fetchRankings({
        period,
        category,
        sortBy,
        page: pageParam,
        limit,
        year: dateParams.year,
        month: dateParams.month,
        day: dateParams.day,
      }),
    getNextPageParam: (lastPage) => {
      const pagination = lastPage?.data?.pagination;
      if (!pagination) return undefined;
      const { page, totalPages } = pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  // Intersection Observer for infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
      rootMargin: "100px",
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Flatten all pages into a single array
  const rankings: RankingItem[] =
    data?.pages.flatMap((page) => page.data.rankings) || [];
  const totalCount = data?.pages[0]?.data?.pagination?.total || 0;

  const handleFilterChange = (
    newPeriod?: string,
    newCategory?: string | undefined,
    newLimit?: LimitOption
  ) => {
    if (newPeriod !== undefined) setPeriod(newPeriod);
    if (newCategory !== undefined) setCategory(newCategory || undefined);
    if (newLimit !== undefined) setLimit(newLimit);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">상품 랭킹</h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex gap-2">
            {[
              { value: "four_hourly", label: "실시간" },
              { value: "daily", label: "일별" },
              { value: "monthly", label: "월별" },
            ].map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? "default" : "outline"}
                onClick={() => handleFilterChange(p.value)}
                size="sm"
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* 카테고리 필터 - 데스크톱: 전체 표시, 모바일: 제한된 개수 + 더보기 */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={!category ? "default" : "outline"}
              onClick={() => handleFilterChange(undefined, "")}
              size="sm"
            >
              전체
            </Button>
            {/* 데스크톱: 모든 카테고리 표시 */}
            <div className="hidden sm:flex gap-2 flex-wrap">
              {categories?.map((cat) => (
                <Button
                  key={cat.key}
                  variant={category === cat.key ? "default" : "outline"}
                  onClick={() => handleFilterChange(undefined, cat.key)}
                  size="sm"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
            {/* 모바일: 제한된 개수만 표시 + 더보기 버튼 */}
            <div className="flex sm:hidden gap-2 flex-wrap">
              {categories
                ?.slice(0, showAllCategories ? undefined : MOBILE_CATEGORY_LIMIT)
                .map((cat) => (
                  <Button
                    key={cat.key}
                    variant={category === cat.key ? "default" : "outline"}
                    onClick={() => handleFilterChange(undefined, cat.key)}
                    size="sm"
                  >
                    {cat.name}
                  </Button>
                ))}
              {categories && categories.length > MOBILE_CATEGORY_LIMIT && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllCategories(!showAllCategories)}
                  className="text-muted-foreground"
                >
                  {showAllCategories ? "접기 ▲" : `+${categories.length - MOBILE_CATEGORY_LIMIT}개 더보기`}
                </Button>
              )}
            </div>
          </div>

          {/* Sort & Limit Selectors */}
          <div className="flex items-center gap-4 ml-auto flex-wrap">
            {/* Sort Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">정렬:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-1.5 text-sm border rounded-lg bg-background"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Limit Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">표시:</span>
              <div className="flex gap-1">
                {LIMIT_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    variant={limit === option ? "default" : "outline"}
                    onClick={() => handleFilterChange(undefined, undefined, option)}
                    size="sm"
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Date Selector & Count */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {period === "monthly" ? (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                max={getCurrentMonthString()}
                className="text-sm px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
              />
            ) : (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={getTodayString()}
                className="text-sm px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
              />
            )}
          </div>
          {totalCount > 0 && (
            <p className="text-sm text-muted-foreground">
              총 {totalCount.toLocaleString()}개 상품
            </p>
          )}
        </div>

        {/* Rankings List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            랭킹 데이터가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {rankings.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-0 sm:p-4">
                  <Link href={`/products/${item.product.id}`}>
                    {/* 모바일: 세로형 레이아웃 */}
                    <div className="sm:hidden">
                      {/* 상단 바 */}
                      <div className="flex items-center justify-between px-3 py-2 border-b">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">#{item.rank}</span>
                          <RankChangeIndicator change={item.change} />
                        </div>
                        <div className="flex items-center gap-2">
                          {item.product.category && (
                            <Badge variant="secondary" className="text-xs">
                              {categoryMap[item.product.category] || item.product.category}
                            </Badge>
                          )}
                          <span className="font-bold text-primary">{item.score.toFixed(1)}</span>
                        </div>
                      </div>
                      {/* 썸네일 */}
                      <div className="aspect-video bg-muted overflow-hidden">
                        {item.product.thumbnailUrl ? (
                          <img
                            src={item.product.thumbnailUrl}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No Image
                          </div>
                        )}
                      </div>
                      {/* 상품 정보 */}
                      <div className="px-3 py-2">
                        <h3 className="font-medium line-clamp-2 text-sm">{item.product.name}</h3>
                        {/* 가격 정보 */}
                        {(item.product.price || item.product.originalPrice) && (
                          <div className="flex items-center gap-2 mt-1">
                            {item.product.discountRate && (
                              <span className="text-sm font-bold text-red-500">
                                {item.product.discountRate}%
                              </span>
                            )}
                            {item.product.originalPrice && item.product.originalPrice !== item.product.price && (
                              <span className="text-xs text-muted-foreground line-through">
                                {item.product.originalPrice.toLocaleString()}원
                              </span>
                            )}
                            {item.product.price && (
                              <span className="text-sm font-bold">
                                {item.product.price.toLocaleString()}원
                              </span>
                            )}
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">영상 {item.videoCount}개</span>
                      </div>
                    </div>

                    {/* sm 이상: 기존 가로형 레이아웃 */}
                    <div className="hidden sm:flex items-center gap-4">
                      {/* Rank */}
                      <div className="flex flex-col items-center w-12">
                        <span className="text-2xl font-bold">{item.rank}</span>
                        <RankChangeIndicator change={item.change} />
                      </div>

                      {/* Thumbnail */}
                      <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                        {item.product.thumbnailUrl ? (
                          <img
                            src={item.product.thumbnailUrl}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            No Image
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">
                          {item.product.name}
                        </h3>
                        {/* 가격 정보 */}
                        {(item.product.price || item.product.originalPrice) && (
                          <div className="flex items-center gap-2 mt-1">
                            {item.product.discountRate && (
                              <span className="text-sm font-bold text-red-500">
                                {item.product.discountRate}%
                              </span>
                            )}
                            {item.product.originalPrice && item.product.originalPrice !== item.product.price && (
                              <span className="text-sm text-muted-foreground line-through">
                                {item.product.originalPrice.toLocaleString()}원
                              </span>
                            )}
                            {item.product.price && (
                              <span className="text-sm font-bold">
                                {item.product.price.toLocaleString()}원
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {item.product.category && (
                            <Badge variant="secondary">
                              {categoryMap[item.product.category] || item.product.category}
                            </Badge>
                          )}
                          <span className="text-sm text-muted-foreground">
                            영상 {item.videoCount}개
                          </span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="text-right hidden md:block">
                        <div className="text-sm">
                          <span className="text-muted-foreground">조회수</span>{" "}
                          <span className="font-medium">
                            {formatNumber(item.totalViews)}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">좋아요</span>{" "}
                          <span className="font-medium">
                            {formatNumber(item.totalLikes)}
                          </span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">
                          {item.score.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">점수</div>
                      </div>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            ))}

            {/* Load More Trigger */}
            <div ref={loadMoreRef} className="py-4">
              {isFetchingNextPage && (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              )}
              {!hasNextPage && rankings.length > 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  모든 상품을 불러왔습니다
                </p>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function RankChangeIndicator({
  change,
}: {
  change: { type: string; value: number | null; label: string };
}) {
  if (change.type === "NEW") {
    return <Badge variant="success" className="text-xs">NEW</Badge>;
  }
  if (change.type === "UP") {
    return (
      <span className="text-green-500 text-xs font-medium">
        ▲{change.value}
      </span>
    );
  }
  if (change.type === "DOWN") {
    return (
      <span className="text-red-500 text-xs font-medium">▼{change.value}</span>
    );
  }
  return <span className="text-muted-foreground text-xs">-</span>;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

