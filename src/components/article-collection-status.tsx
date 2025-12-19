"use client";

import { useEffect, useRef } from "react";
import { useArticleCollectionStore } from "@/stores/article-collection-store";
import { X, Loader2, CheckCircle2, XCircle, Newspaper } from "lucide-react";

interface JobStatusResponse {
  success: boolean;
  data: {
    jobs: Array<{
      id: string;
      status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
      totalFound: number;
      newArticles: number;
      duplicates: number;
      summarized: number;
      errorLog: string | null;
    }>;
  };
}

export function ArticleCollectionStatus() {
  const { status, jobId, result, error, isVisible, setCompleted, setFailed, hide, reset } =
    useArticleCollectionStore();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const autoHideRef = useRef<NodeJS.Timeout | null>(null);

  // Polling for job status
  useEffect(() => {
    if (status !== "collecting" || !jobId) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const pollJobStatus = async () => {
      try {
        const res = await fetch(`/api/admin/articles/collect?limit=5`);
        if (!res.ok) return;

        const data: JobStatusResponse = await res.json();
        const job = data.data.jobs.find((j) => j.id === jobId);

        if (!job) return;

        if (job.status === "COMPLETED") {
          setCompleted({
            total: job.totalFound,
            newArticles: job.newArticles,
            duplicates: job.duplicates,
            summarized: job.summarized,
            errors: job.errorLog ? [job.errorLog] : [],
          });
        } else if (job.status === "FAILED") {
          setFailed(job.errorLog || "수집 중 오류가 발생했습니다.");
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    // Initial poll
    pollJobStatus();

    // Start polling every 2 seconds
    pollingRef.current = setInterval(pollJobStatus, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [status, jobId, setCompleted, setFailed]);

  // Auto hide after completion
  useEffect(() => {
    if (status === "completed" || status === "failed") {
      autoHideRef.current = setTimeout(() => {
        hide();
      }, 5000);

      return () => {
        if (autoHideRef.current) {
          clearTimeout(autoHideRef.current);
        }
      };
    }
  }, [status, hide]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-card border rounded-lg shadow-lg p-4 min-w-[280px] max-w-[320px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">기사 수집</span>
          </div>
          <button
            onClick={() => {
              hide();
              if (status !== "collecting") reset();
            }}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {status === "collecting" && (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <div>
              <p className="text-sm font-medium">수집 중...</p>
              <p className="text-xs text-muted-foreground">
                잠시만 기다려주세요
              </p>
            </div>
          </div>
        )}

        {status === "completed" && result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">수집 완료!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted rounded px-2 py-1">
                <span className="text-muted-foreground">새 기사</span>
                <span className="ml-1 font-medium text-green-600">
                  {result.newArticles}개
                </span>
              </div>
              <div className="bg-muted rounded px-2 py-1">
                <span className="text-muted-foreground">중복</span>
                <span className="ml-1 font-medium">{result.duplicates}개</span>
              </div>
              <div className="bg-muted rounded px-2 py-1">
                <span className="text-muted-foreground">요약 생성</span>
                <span className="ml-1 font-medium">{result.summarized}개</span>
              </div>
              <div className="bg-muted rounded px-2 py-1">
                <span className="text-muted-foreground">총 처리</span>
                <span className="ml-1 font-medium">{result.total}개</span>
              </div>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              <span className="text-sm font-medium">수집 실패</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {error || "알 수 없는 오류가 발생했습니다."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
