"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface ArticleItem {
  id: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  source: "NAVER" | "GOOGLE";
  category: string | null;
  publishedAt: string;
  rank: number;
  _count: {
    views: number;
    shares: number;
  };
}

interface NewsGridProps {
  apiUrl: string;
  queryKey: string;
  itemsPerPage?: number;
  rotationInterval?: number;
}

async function fetchNews(apiUrl: string): Promise<ArticleItem[]> {
  const res = await fetch(apiUrl);
  const data = await res.json();
  return data.data?.articles || [];
}

export function NewsGrid({
  apiUrl,
  queryKey,
  itemsPerPage = 4,
  rotationInterval = 6000,
}: NewsGridProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: articles = [], isLoading } = useQuery<ArticleItem[]>({
    queryKey: [queryKey],
    queryFn: () => fetchNews(apiUrl),
    staleTime: 5 * 60 * 1000,
  });

  const totalPages = Math.ceil(articles.length / itemsPerPage);

  useEffect(() => {
    if (isPaused || totalPages <= 1) return;

    const timer = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, rotationInterval);

    return () => clearInterval(timer);
  }, [isPaused, totalPages, rotationInterval]);

  const goToPrev = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  const goToNext = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(itemsPerPage)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[16/9] bg-muted rounded-lg mb-2" />
            <div className="h-4 bg-muted rounded w-3/4 mb-1" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        등록된 뉴스가 없습니다.
      </p>
    );
  }

  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(articles.slice(i * itemsPerPage, (i + 1) * itemsPerPage));
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="overflow-hidden" ref={containerRef}>
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentPage * 100}%)` }}
        >
          {pages.map((pageArticles, pageIndex) => (
            <div key={pageIndex} className="w-full flex-shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {pageArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/news/${article.id}`}
                    className="group block"
                  >
                    <div className="bg-card rounded-lg border overflow-hidden hover:shadow-md hover:border-primary/50 transition">
                      {/* 내용 */}
                      <div className="p-3">
                        {/* 순위 및 출처 */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
                            {article.rank}위
                          </span>
                          <Badge
                            variant={article.source === "NAVER" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {article.source === "NAVER" ? "네이버" : "구글"}
                          </Badge>
                        </div>
                        <h3 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition mb-2">
                          {article.title}
                        </h3>
                        {article.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {article.summary}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(article.publishedAt), {
                              addSuffix: true,
                              locale: ko,
                            })}
                          </span>
                          <span>조회 {article._count.views}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 네비게이션 */}
      {totalPages > 1 && (
        <>
          <button
            onClick={goToPrev}
            className="absolute -left-3 top-1/3 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-background border shadow-sm hover:bg-muted transition z-10"
            aria-label="이전"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNext}
            className="absolute -right-3 top-1/3 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-background border shadow-sm hover:bg-muted transition z-10"
            aria-label="다음"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex justify-center gap-1.5 mt-4">
            {[...Array(totalPages)].map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPage(index)}
                className={`w-2 h-2 rounded-full transition ${
                  index === currentPage
                    ? "bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`페이지 ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
