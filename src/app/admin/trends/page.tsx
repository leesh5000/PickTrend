"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCategoryMap } from "@/hooks/useCategories";
import { TrendSource } from "@prisma/client";

const SOURCE_OPTIONS = [
  { value: "", label: "전체 소스" },
  { value: "MANUAL", label: "수동 등록" },
  { value: "NAVER_DATALAB", label: "Naver DataLab" },
  { value: "GOOGLE_TRENDS", label: "Google Trends" },
  { value: "DAUM", label: "다음" },
  { value: "ZUM", label: "줌" },
] as const;

const SORT_OPTIONS = [
  { value: "createdAtDesc", label: "등록일 (최신순)" },
  { value: "createdAtAsc", label: "등록일 (오래된순)" },
  { value: "keyword", label: "키워드 (가나다순)" },
  { value: "keywordDesc", label: "키워드 (역순)" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

function getSourceBadgeVariant(source: TrendSource) {
  switch (source) {
    case "NAVER_DATALAB":
      return "default";
    case "GOOGLE_TRENDS":
      return "secondary";
    case "DAUM":
      return "outline";
    case "ZUM":
      return "destructive";
    case "MANUAL":
    default:
      return "secondary";
  }
}

function getSourceLabel(source: TrendSource) {
  switch (source) {
    case "NAVER_DATALAB":
      return "Naver";
    case "GOOGLE_TRENDS":
      return "Google";
    case "DAUM":
      return "다음";
    case "ZUM":
      return "줌";
    case "MANUAL":
    default:
      return "수동";
  }
}

async function fetchTrends(params: {
  page: number;
  search?: string;
  source?: string;
  category?: string;
  sortBy?: string;
}) {
  const searchParams = new URLSearchParams({
    page: params.page.toString(),
    limit: "20",
  });
  if (params.search) searchParams.set("search", params.search);
  if (params.source) searchParams.set("source", params.source);
  if (params.category) searchParams.set("category", params.category);
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);

  const res = await fetch(`/api/admin/trends?${searchParams}`);
  return res.json();
}

async function triggerCollect(source: string) {
  const res = await fetch("/api/admin/trends/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, importNew: true }),
  });
  return res.json();
}

async function triggerMatch() {
  const res = await fetch("/api/admin/trends/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clearExisting: false, preserveManual: true }),
  });
  return res.json();
}

async function deleteTrend(id: string) {
  const res = await fetch(`/api/admin/trends/${id}`, {
    method: "DELETE",
  });
  return res.json();
}

export default function AdminTrendsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("");
  const [category, setCategory] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<SortOption>("createdAtDesc");
  const { categoryMap, categories } = useCategoryMap();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-trends", page, search, source, category, sortBy],
    queryFn: () => fetchTrends({ page, search, source, category, sortBy }),
  });

  const collectMutation = useMutation({
    mutationFn: triggerCollect,
    onSuccess: (data) => {
      if (data.success) {
        alert(`수집 완료: ${data.message}`);
        refetch();
      } else {
        alert(`수집 실패: ${data.error}`);
      }
    },
    onError: () => {
      alert("수집 중 오류가 발생했습니다.");
    },
  });

  const matchMutation = useMutation({
    mutationFn: triggerMatch,
    onSuccess: (data) => {
      if (data.success) {
        alert(`매칭 완료: ${data.message}`);
        refetch();
      } else {
        alert(`매칭 실패: ${data.error}`);
      }
    },
    onError: () => {
      alert("매칭 중 오류가 발생했습니다.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTrend,
    onSuccess: (data) => {
      if (data.success) {
        refetch();
      } else {
        alert(`삭제 실패: ${data.error}`);
      }
    },
  });

  const keywords = data?.data?.keywords || [];
  const pagination = data?.data?.pagination;

  const handleDelete = (id: string, keyword: string) => {
    if (confirm(`"${keyword}" 키워드를 삭제하시겠습니까?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">트렌드 관리</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => collectMutation.mutate("ALL")}
            disabled={collectMutation.isPending}
          >
            {collectMutation.isPending ? "수집 중..." : "데이터 수집"}
          </Button>
          <Button
            variant="outline"
            onClick={() => matchMutation.mutate()}
            disabled={matchMutation.isPending}
          >
            {matchMutation.isPending ? "매칭 중..." : "상품 매칭"}
          </Button>
          <Link href="/admin/trends/new">
            <Button>키워드 등록</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Input
              placeholder="키워드 검색..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-lg text-sm bg-background"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-lg text-sm bg-background"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={!category ? "default" : "outline"}
                onClick={() => {
                  setCategory(undefined);
                  setPage(1);
                }}
                size="sm"
              >
                전체
              </Button>
              {categories?.map((cat) => (
                <Button
                  key={cat.key}
                  variant={category === cat.key ? "default" : "outline"}
                  onClick={() => {
                    setCategory(cat.key);
                    setPage(1);
                  }}
                  size="sm"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keywords Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            트렌드 키워드 목록
            {pagination && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (총 {pagination.total}개)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : keywords.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              등록된 키워드가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">키워드</th>
                    <th className="text-left py-3 px-2">소스</th>
                    <th className="text-left py-3 px-2">카테고리</th>
                    <th className="text-center py-3 px-2">검색량</th>
                    <th className="text-center py-3 px-2">연관상품</th>
                    <th className="text-center py-3 px-2">상태</th>
                    <th className="text-right py-3 px-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((keyword: any) => (
                    <tr key={keyword.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="font-medium">{keyword.keyword}</div>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={getSourceBadgeVariant(keyword.source)}>
                          {getSourceLabel(keyword.source)}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        {keyword.category ? (
                          <Badge variant="outline">
                            {categoryMap[keyword.category] || keyword.category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {keyword.latestSearchVolume ?? "-"}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {keyword._count.productMatches}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge
                          variant={keyword.isActive ? "success" : "secondary"}
                        >
                          {keyword.isActive ? "활성" : "비활성"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/admin/trends/${keyword.id}`}>
                            <Button variant="outline" size="sm">
                              편집
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleDelete(keyword.id, keyword.keyword)
                            }
                            disabled={deleteMutation.isPending}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              <span className="flex items-center px-4">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>수집 소스별 실행</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => collectMutation.mutate("NAVER_DATALAB")}
              disabled={collectMutation.isPending}
            >
              Naver DataLab
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => collectMutation.mutate("GOOGLE_TRENDS")}
              disabled={collectMutation.isPending}
            >
              Google Trends
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => collectMutation.mutate("DAUM")}
              disabled={collectMutation.isPending}
            >
              다음
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => collectMutation.mutate("ZUM")}
              disabled={collectMutation.isPending}
            >
              줌
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
