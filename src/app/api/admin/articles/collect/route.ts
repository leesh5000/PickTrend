import { NextRequest, NextResponse } from "next/server";
import { ArticleSource } from "@prisma/client";
import { collectArticles } from "@/lib/article/collector";
import prisma from "@/lib/prisma";

// GET: 수집 작업 히스토리 조회
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const source = searchParams.get("source") as ArticleSource | null;
    const status = searchParams.get("status") as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null;

    const where = {
      ...(source && { source }),
      ...(status && { status }),
    };

    const [jobs, total] = await Promise.all([
      prisma.articleCollectionJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.articleCollectionJob.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("수집 히스토리 조회 오류:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST: 수동 수집 트리거
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const source = body.source as ArticleSource | "ALL" | undefined;
    const limit = body.limit as number | undefined;
    const async = body.async as boolean | undefined;

    // 이미 실행 중인 작업이 있는지 확인
    const runningJobs = await prisma.articleCollectionJob.findMany({
      where: { status: "RUNNING" },
    });

    if (runningJobs.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "이미 실행 중인 수집 작업이 있습니다.",
          runningJobs: runningJobs.map(j => ({
            id: j.id,
            source: j.source,
            startedAt: j.startedAt,
          })),
        },
        { status: 409 }
      );
    }

    // 비동기 모드: Job 생성 후 즉시 응답, 백그라운드에서 수집
    if (async) {
      const sourcesToTrack = (source === "ALL" || !source)
        ? [ArticleSource.NAVER, ArticleSource.GOOGLE]
        : [source as ArticleSource];

      // Job 먼저 생성
      const jobs = await Promise.all(
        sourcesToTrack.map((src) =>
          prisma.articleCollectionJob.create({
            data: {
              source: src,
              status: "RUNNING",
              startedAt: new Date(),
            },
          })
        )
      );

      const jobId = jobs[0].id;

      // 백그라운드에서 수집 실행 (응답 후에도 계속 실행)
      collectArticles({
        source: source || "ALL",
        createJob: false, // 이미 생성했으므로
        limit: limit || 20,
      }).then(async (result) => {
        // 완료 시 Job 업데이트
        await Promise.all(
          jobs.map((job) =>
            prisma.articleCollectionJob.update({
              where: { id: job.id },
              data: {
                status: result.errors.length > 0 && result.newArticles === 0 ? "FAILED" : "COMPLETED",
                completedAt: new Date(),
                totalFound: result.total,
                newArticles: result.newArticles,
                duplicates: result.duplicates,
                summarized: result.summarized,
                linkedProducts: result.linkedProducts,
                errorLog: result.errors.length ? result.errors.join("\n") : null,
              },
            })
          )
        );
      }).catch(async (error) => {
        // 실패 시 Job 업데이트
        const errorMsg = error instanceof Error ? error.message : String(error);
        await Promise.all(
          jobs.map((job) =>
            prisma.articleCollectionJob.update({
              where: { id: job.id },
              data: {
                status: "FAILED",
                completedAt: new Date(),
                errorLog: errorMsg,
              },
            })
          )
        );
      });

      // 즉시 응답
      return NextResponse.json({
        success: true,
        message: "수집이 시작되었습니다.",
        data: { jobId },
      });
    }

    // 동기 모드: 수집 완료까지 대기
    const result = await collectArticles({
      source: source || "ALL",
      createJob: true,
      limit: limit || 20,
    });

    const statusCode = result.errors.length > 0 && result.newArticles === 0 ? 500 : 200;

    return NextResponse.json(
      {
        success: result.errors.length === 0 || result.newArticles > 0,
        message: `수집 완료: ${result.newArticles}개 새 기사, ${result.duplicates}개 중복, ${result.summarized}개 요약 생성`,
        data: result,
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error("수동 수집 오류:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
