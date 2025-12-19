"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/hooks/useCategories";
import { formatDistanceToNow, format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArticleSource, JobStatus } from "@prisma/client";
import { useArticleCollectionStore } from "@/stores/article-collection-store";

type SortOption = "publishedAtDesc" | "publishedAtAsc" | "createdAtDesc" | "createdAtAsc" | "title" | "titleDesc";
type SourceFilter = "NAVER" | "GOOGLE" | undefined;

interface Article {
  id: string;
  title: string;
  summary: string | null;
  originalUrl: string;
  thumbnailUrl: string | null;
  source: "NAVER" | "GOOGLE";
  category: string | null;
  publishedAt: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    products: number;
    views: number;
    shares: number;
  };
}

interface ArticlesResponse {
  success: boolean;
  data: {
    articles: Article[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

interface CollectionJob {
  id: string;
  source: ArticleSource;
  status: JobStatus;
  startedAt: string | null;
  completedAt: string | null;
  totalFound: number;
  newArticles: number;
  duplicates: number;
  summarized: number;
  linkedProducts: number;
  errorLog: string | null;
  createdAt: string;
}

interface CollectionJobsResponse {
  success: boolean;
  data: {
    jobs: CollectionJob[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

async function fetchArticles(params: {
  page: number;
  search: string;
  category?: string;
  source?: SourceFilter;
  sortBy: SortOption;
}): Promise<ArticlesResponse> {
  const searchParams = new URLSearchParams({
    page: params.page.toString(),
    limit: "20",
    sortBy: params.sortBy,
  });

  if (params.search) searchParams.set("search", params.search);
  if (params.category) searchParams.set("category", params.category);
  if (params.source) searchParams.set("source", params.source);

  const res = await fetch(`/api/admin/articles?${searchParams}`);
  if (!res.ok) throw new Error("Failed to fetch articles");
  return res.json();
}

async function fetchCollectionJobs(page: number): Promise<CollectionJobsResponse> {
  const res = await fetch(`/api/admin/articles/collect?page=${page}&limit=10`);
  if (!res.ok) throw new Error("Failed to fetch collection jobs");
  return res.json();
}

async function triggerCollection(source: ArticleSource | "ALL") {
  const res = await fetch("/api/admin/articles/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, async: true }),
  });
  return res.json();
}

function getStatusBadgeVariant(status: JobStatus): "default" | "secondary" | "destructive" | "outline" | "success" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "RUNNING":
      return "default";
    case "FAILED":
      return "destructive";
    case "PENDING":
    default:
      return "secondary";
  }
}

function getStatusLabel(status: JobStatus): string {
  switch (status) {
    case "COMPLETED":
      return "완료";
    case "RUNNING":
      return "실행 중";
    case "FAILED":
      return "실패";
    case "PENDING":
    default:
      return "대기";
  }
}

function getSourceLabel(source: ArticleSource): string {
  switch (source) {
    case "NAVER":
      return "네이버";
    case "GOOGLE":
      return "구글";
    default:
      return source;
  }
}

export default function AdminArticlesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [source, setSource] = useState<SourceFilter>();
  const [sortBy, setSortBy] = useState<SortOption>("publishedAtDesc");
  const [jobsPage, setJobsPage] = useState(1);
  const [showJobs, setShowJobs] = useState(false);
  const [selectedJobError, setSelectedJobError] = useState<string | null>(null);

  const { data: categories = [] } = useCategories();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-articles", page, search, category, source, sortBy],
    queryFn: () => fetchArticles({ page, search, category, source, sortBy }),
  });

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ["admin-article-jobs", jobsPage],
    queryFn: () => fetchCollectionJobs(jobsPage),
    enabled: showJobs,
  });

  const { startCollection, status: collectionStatus } = useArticleCollectionStore();

  const collectMutation = useMutation({
    mutationFn: triggerCollection,
    onSuccess: (data) => {
      if (data.success && data.data?.jobId) {
        // 비동기 모드: store에 jobId 저장하고 polling 시작
        startCollection(data.data.jobId);
        refetchJobs();
      } else if (!data.success) {
        alert(`수집 실패: ${data.error}`);
        refetchJobs();
      }
    },
    onError: () => {
      alert("수집 중 오류가 발생했습니다.");
      refetchJobs();
    },
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategoryChange = (cat: string | undefined) => {
    setCategory(cat);
    setPage(1);
  };

  const handleSourceChange = (src: SourceFilter) => {
    setSource(src);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">기사 관리</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowJobs(!showJobs);
              if (!showJobs) refetchJobs();
            }}
          >
            {showJobs ? "수집 히스토리 닫기" : "수집 히스토리"}
          </Button>
          <Button
            variant="outline"
            onClick={() => collectMutation.mutate("ALL")}
            disabled={collectMutation.isPending || collectionStatus === "collecting"}
          >
            {collectMutation.isPending ? "시작 중..." : collectionStatus === "collecting" ? "수집 중..." : "기사 수집"}
          </Button>
          <Link href="/admin/articles/new">
            <Button>새 기사 등록</Button>
          </Link>
        </div>
      </div>

      {/* 수집 히스토리 */}
      {showJobs && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>수집 히스토리</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => collectMutation.mutate("NAVER")}
                  disabled={collectMutation.isPending || collectionStatus === "collecting"}
                >
                  네이버만 수집
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => collectMutation.mutate("GOOGLE")}
                  disabled={collectMutation.isPending || collectionStatus === "collecting"}
                >
                  구글만 수집
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : jobsData?.data.jobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                수집 히스토리가 없습니다.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-3 px-2 font-medium">소스</th>
                        <th className="py-3 px-2 font-medium">상태</th>
                        <th className="py-3 px-2 font-medium text-center">발견</th>
                        <th className="py-3 px-2 font-medium text-center">신규</th>
                        <th className="py-3 px-2 font-medium text-center">중복</th>
                        <th className="py-3 px-2 font-medium text-center">요약</th>
                        <th className="py-3 px-2 font-medium">시작</th>
                        <th className="py-3 px-2 font-medium">완료</th>
                        <th className="py-3 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobsData?.data.jobs.map((job) => (
                        <tr key={job.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <Badge variant={job.source === "NAVER" ? "default" : "secondary"}>
                              {getSourceLabel(job.source)}
                            </Badge>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={getStatusBadgeVariant(job.status)}>
                              {getStatusLabel(job.status)}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-center">{job.totalFound}</td>
                          <td className="py-3 px-2 text-center text-green-600 font-medium">
                            {job.newArticles}
                          </td>
                          <td className="py-3 px-2 text-center text-muted-foreground">
                            {job.duplicates}
                          </td>
                          <td className="py-3 px-2 text-center">{job.summarized}</td>
                          <td className="py-3 px-2 text-sm text-muted-foreground">
                            {job.startedAt
                              ? format(new Date(job.startedAt), "MM/dd HH:mm", { locale: ko })
                              : "-"}
                          </td>
                          <td className="py-3 px-2 text-sm text-muted-foreground">
                            {job.completedAt
                              ? format(new Date(job.completedAt), "MM/dd HH:mm", { locale: ko })
                              : "-"}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex gap-2 justify-end">
                              {job.errorLog && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedJobError(job.errorLog)}
                                >
                                  오류 보기
                                </Button>
                              )}
                              {job.status === "FAILED" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => collectMutation.mutate(job.source)}
                                  disabled={collectMutation.isPending || collectionStatus === "collecting"}
                                >
                                  재시도
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {jobsData && jobsData.data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setJobsPage(jobsPage - 1)}
                      disabled={jobsPage === 1}
                    >
                      이전
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {jobsPage} / {jobsData.data.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setJobsPage(jobsPage + 1)}
                      disabled={jobsPage === jobsData.data.pagination.totalPages}
                    >
                      다음
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* 오류 로그 모달 */}
      {selectedJobError && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedJobError(null)}
        >
          <div
            className="bg-background rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4">오류 로그</h3>
            <pre className="bg-muted p-4 rounded text-sm whitespace-pre-wrap break-words">
              {selectedJobError}
            </pre>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setSelectedJobError(null)}>닫기</Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>검색 및 필터</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="기사 제목 검색..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="max-w-md"
          />

          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center">소스:</span>
            <Button
              variant={source === undefined ? "default" : "outline"}
              size="sm"
              onClick={() => handleSourceChange(undefined)}
            >
              전체
            </Button>
            <Button
              variant={source === "NAVER" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSourceChange("NAVER")}
            >
              네이버
            </Button>
            <Button
              variant={source === "GOOGLE" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSourceChange("GOOGLE")}
            >
              구글
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center">카테고리:</span>
            <Button
              variant={category === undefined ? "default" : "outline"}
              size="sm"
              onClick={() => handleCategoryChange(undefined)}
            >
              전체
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.key}
                variant={category === cat.key ? "default" : "outline"}
                size="sm"
                onClick={() => handleCategoryChange(cat.key)}
              >
                {cat.name}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center">정렬:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="publishedAtDesc">발행일 최신순</option>
              <option value="publishedAtAsc">발행일 오래된순</option>
              <option value="createdAtDesc">등록일 최신순</option>
              <option value="createdAtAsc">등록일 오래된순</option>
              <option value="title">제목 가나다순</option>
              <option value="titleDesc">제목 역순</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          기사를 불러오는데 실패했습니다.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3 px-2 font-medium">기사</th>
                  <th className="py-3 px-2 font-medium">소스</th>
                  <th className="py-3 px-2 font-medium">카테고리</th>
                  <th className="py-3 px-2 font-medium text-center">조회</th>
                  <th className="py-3 px-2 font-medium text-center">공유</th>
                  <th className="py-3 px-2 font-medium text-center">상품</th>
                  <th className="py-3 px-2 font-medium">발행일</th>
                  <th className="py-3 px-2 font-medium">상태</th>
                  <th className="py-3 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {data?.data.articles.map((article) => (
                  <tr key={article.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-xs">
                          {article.title}
                        </div>
                        {article.summary && (
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {article.summary}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={article.source === "NAVER" ? "default" : "secondary"}>
                        {article.source === "NAVER" ? "네이버" : "구글"}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">
                      {article.category ? (
                        <Badge variant="outline">
                          {categories.find((c) => c.key === article.category)?.name || article.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center">{article._count.views}</td>
                    <td className="py-3 px-2 text-center">{article._count.shares}</td>
                    <td className="py-3 px-2 text-center">{article._count.products}</td>
                    <td className="py-3 px-2 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(article.publishedAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={article.isActive ? "success" : "secondary"}>
                        {article.isActive ? "활성" : "비활성"}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">
                      <Link href={`/admin/articles/${article.id}`}>
                        <Button variant="outline" size="sm">
                          편집
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data?.data.articles.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              등록된 기사가 없습니다.
            </div>
          )}

          {data && data.data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {data.data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page === data.data.pagination.totalPages}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
