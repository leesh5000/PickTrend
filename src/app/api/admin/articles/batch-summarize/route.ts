import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { summarizeFromMetadata } from "@/lib/openai/client";

export const maxDuration = 300; // 5 minutes timeout

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const limit = Math.min(body.limit || 20, 50); // Max 50 at a time

    // Fetch articles without summaries
    const articles = await prisma.article.findMany({
      where: {
        isActive: true,
        summary: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (articles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No articles need summarization",
        data: { processed: 0, succeeded: 0, failed: 0 },
      });
    }

    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const article of articles) {
      try {
        const summary = await summarizeFromMetadata(
          article.title,
          article.description || ""
        );

        if (summary) {
          await prisma.article.update({
            where: { id: article.id },
            data: { summary },
          });
          succeeded++;
        } else {
          failed++;
          errors.push(`${article.id}: 요약 생성 실패`);
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${article.id}: ${msg}`);
      }

      // Rate limiting - avoid OpenAI rate limits
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: articles.length,
        succeeded,
        failed,
        errors: errors.slice(0, 10), // Return first 10 errors only
      },
    });
  } catch (error) {
    console.error("Batch summarize error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get count of articles without summaries
    const withoutSummary = await prisma.article.count({
      where: { isActive: true, summary: null },
    });

    const withSummary = await prisma.article.count({
      where: { isActive: true, summary: { not: null } },
    });

    return NextResponse.json({
      success: true,
      data: {
        withSummary,
        withoutSummary,
        total: withSummary + withoutSummary,
      },
    });
  } catch (error) {
    console.error("Get summary stats error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
