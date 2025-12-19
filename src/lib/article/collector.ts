import { ArticleSource, JobStatus } from "@prisma/client";
import { fetchAllNaverRss, type ParsedArticle as NaverArticle } from "./naver-rss";
import { fetchAllGoogleNews, type ParsedArticle as GoogleArticle } from "./google-news";
import { fetchArticleContentWithRetry } from "./content-fetcher";
import { summarizeArticle, summarizeFromMetadata } from "@/lib/gemini/client";
import prisma from "@/lib/prisma";

type ParsedArticle = NaverArticle | GoogleArticle;

export interface CollectionResult {
  total: number;
  newArticles: number;
  duplicates: number;
  summarized: number;
  linkedProducts: number;
  errors: string[];
  jobId?: string;
}

export interface CollectionOptions {
  source?: ArticleSource | "ALL";
  createJob?: boolean;
}

export async function collectArticles(options?: CollectionOptions): Promise<CollectionResult> {
  const { source = "ALL", createJob = false } = options || {};

  const result: CollectionResult = {
    total: 0,
    newArticles: 0,
    duplicates: 0,
    summarized: 0,
    linkedProducts: 0,
    errors: [],
  };

  // Job 생성 (소스별로 생성)
  const jobs: { source: ArticleSource; jobId: string }[] = [];

  if (createJob) {
    const sourcesToTrack = source === "ALL"
      ? [ArticleSource.NAVER, ArticleSource.GOOGLE]
      : [source as ArticleSource];

    for (const src of sourcesToTrack) {
      const job = await prisma.articleCollectionJob.create({
        data: {
          source: src,
          status: JobStatus.RUNNING,
          startedAt: new Date(),
        },
      });
      jobs.push({ source: src, jobId: job.id });
    }
  }

  try {
    let allArticles: ParsedArticle[] = [];
    const sourceResults: Map<ArticleSource, CollectionResult> = new Map();

    // 소스별 수집
    if (source === "ALL" || source === ArticleSource.NAVER) {
      console.log("네이버 RSS 수집 시작...");
      const naverArticles = await fetchAllNaverRss();
      console.log(`네이버 기사 ${naverArticles.length}개 수집`);
      allArticles = [...allArticles, ...naverArticles];
      sourceResults.set(ArticleSource.NAVER, {
        total: naverArticles.length,
        newArticles: 0,
        duplicates: 0,
        summarized: 0,
        linkedProducts: 0,
        errors: [],
      });
    }

    if (source === "ALL" || source === ArticleSource.GOOGLE) {
      console.log("Google News 수집 시작...");
      const googleArticles = await fetchAllGoogleNews();
      console.log(`Google 기사 ${googleArticles.length}개 수집`);
      allArticles = [...allArticles, ...googleArticles];
      sourceResults.set(ArticleSource.GOOGLE, {
        total: googleArticles.length,
        newArticles: 0,
        duplicates: 0,
        summarized: 0,
        linkedProducts: 0,
        errors: [],
      });
    }

    result.total = allArticles.length;

    // 3. 중복 체크 및 저장
    for (const article of allArticles) {
      const articleSource = article.source as ArticleSource;
      const srcResult = sourceResults.get(articleSource);

      try {
        // URL 기반 중복 체크
        const existing = await prisma.article.findUnique({
          where: { originalUrl: article.originalUrl },
        });

        if (existing) {
          result.duplicates++;
          if (srcResult) srcResult.duplicates++;
          continue;
        }

        // 새 기사 저장
        const newArticle = await prisma.article.create({
          data: {
            title: article.title,
            description: article.description,
            originalUrl: article.originalUrl,
            source: articleSource,
            category: article.category,
            publishedAt: article.publishedAt,
            collectedAt: new Date(),
          },
        });

        result.newArticles++;
        if (srcResult) srcResult.newArticles++;

        // 4. 기사 본문 크롤링 및 요약 생성 (동기 처리)
        try {
          const success = await processArticleSummary(
            newArticle.id,
            article.originalUrl,
            article.title,
            article.description
          );
          if (success) {
            result.summarized++;
            if (srcResult) srcResult.summarized++;
          }
        } catch (error) {
          const errMsg = `요약 생성 실패 (${newArticle.id}): ${error}`;
          result.errors.push(errMsg);
          if (srcResult) srcResult.errors.push(errMsg);
        }

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errMsg = `기사 저장 실패: ${message}`;
        result.errors.push(errMsg);
        if (srcResult) srcResult.errors.push(errMsg);
      }
    }

    // 5. 카테고리 기반 연관 상품 연결
    const linkedCount = await linkArticlesToProducts();
    result.linkedProducts = linkedCount;

    // Job 업데이트 (성공)
    for (const job of jobs) {
      const srcResult = sourceResults.get(job.source);
      await prisma.articleCollectionJob.update({
        where: { id: job.jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          totalFound: srcResult?.total || 0,
          newArticles: srcResult?.newArticles || 0,
          duplicates: srcResult?.duplicates || 0,
          summarized: srcResult?.summarized || 0,
          linkedProducts: linkedCount,
          errorLog: srcResult?.errors.length ? srcResult.errors.join("\n") : null,
        },
      });
    }

    if (jobs.length > 0) {
      result.jobId = jobs[0].jobId;
    }

    console.log("기사 수집 완료:", result);
    return result;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`수집 프로세스 오류: ${message}`);

    // Job 업데이트 (실패)
    for (const job of jobs) {
      await prisma.articleCollectionJob.update({
        where: { id: job.jobId },
        data: {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          errorLog: message,
        },
      });
    }

    return result;
  }
}

async function processArticleSummary(
  articleId: string,
  url: string,
  title: string,
  description: string
): Promise<boolean> {
  try {
    // 1. 먼저 본문 크롤링 시도
    const content = await fetchArticleContentWithRetry(url);

    let summary: string | null = null;
    let thumbnailUrl: string | null = null;

    if (content && content.content) {
      // 본문 크롤링 성공 시 전체 내용으로 요약 생성
      summary = await summarizeArticle(content.content);
      thumbnailUrl = content.thumbnailUrl || null;
    }

    // 2. 본문 크롤링 실패 또는 요약 생성 실패 시 제목/설명으로 요약 생성
    if (!summary) {
      console.log(`본문 크롤링 실패, 메타데이터로 요약 생성 시도: ${url}`);
      summary = await summarizeFromMetadata(title, description);
    }

    if (!summary) {
      console.log(`요약 생성 최종 실패: ${url}`);
      return false;
    }

    // DB 업데이트
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary,
        ...(thumbnailUrl && { thumbnailUrl }),
      },
    });

    return true;
  } catch (error) {
    console.error(`기사 처리 오류 (${articleId}):`, error);
    return false;
  }
}

export async function linkArticlesToProducts(): Promise<number> {
  let linkedCount = 0;

  try {
    // 연관 상품이 없는 기사 조회
    const articlesWithoutProducts = await prisma.article.findMany({
      where: {
        isActive: true,
        category: { not: null },
        products: { none: {} },
      },
      select: {
        id: true,
        category: true,
      },
    });

    for (const article of articlesWithoutProducts) {
      if (!article.category) continue;

      // 같은 카테고리의 활성 상품 조회 (최대 5개)
      const products = await prisma.product.findMany({
        where: {
          category: article.category,
          isActive: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true },
      });

      if (products.length > 0) {
        // 연관 상품 연결
        await prisma.articleProduct.createMany({
          data: products.map((product) => ({
            articleId: article.id,
            productId: product.id,
          })),
          skipDuplicates: true,
        });

        linkedCount += products.length;
      }
    }

    console.log(`${linkedCount}개 연관 상품 연결 완료`);
    return linkedCount;

  } catch (error) {
    console.error("상품 연결 오류:", error);
    return linkedCount;
  }
}

export async function summarizeUnsummarizedArticles(): Promise<number> {
  let summarizedCount = 0;

  try {
    // 요약이 없는 기사 조회
    const articles = await prisma.article.findMany({
      where: {
        isActive: true,
        summary: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        originalUrl: true,
      },
      take: 50, // 한 번에 50개씩 처리
    });

    for (const article of articles) {
      const success = await processArticleSummary(
        article.id,
        article.originalUrl,
        article.title,
        article.description || ""
      );
      if (success) {
        summarizedCount++;
      }
      // Rate limiting - OpenAI API 호출 간격
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return summarizedCount;

  } catch (error) {
    console.error("요약 생성 오류:", error);
    return summarizedCount;
  }
}
