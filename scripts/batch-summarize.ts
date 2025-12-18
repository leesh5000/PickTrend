import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

// Use direct URL to avoid PgBouncer prepared statement issues
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function summarizeFromMetadata(
  title: string,
  description: string
): Promise<string | null> {
  if (!title || title.length < 10) {
    console.log("제목이 너무 짧습니다.");
    return null;
  }

  const inputText =
    description && description.length > 10
      ? `제목: ${title}\n설명: ${description}`
      : `제목: ${title}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `당신은 쇼핑 트렌드 뉴스 기사를 요약하는 전문가입니다.
- 주어진 제목과 설명을 바탕으로 200자 이내의 요약을 작성하세요.
- 한국어로 작성하세요.
- 객관적인 톤을 유지하세요.
- 핵심 내용과 트렌드를 강조하세요.
- 제품명, 브랜드명이 있다면 포함하세요.`,
        },
        {
          role: "user",
          content: `다음 기사 정보를 바탕으로 요약을 작성해주세요:\n\n${inputText}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("OpenAI 요약 생성 오류:", error);
    return null;
  }
}

async function main() {
  const limit = parseInt(process.argv[2] || "20", 10);
  console.log(`\n📝 기사 AI 요약 생성 시작 (최대 ${limit}개)\n`);

  // Get articles without summaries
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

  console.log(`📊 요약이 필요한 기사: ${articles.length}개\n`);

  if (articles.length === 0) {
    console.log("✅ 모든 기사에 요약이 있습니다.");
    await prisma.$disconnect();
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    process.stdout.write(`[${i + 1}/${articles.length}] ${article.title.substring(0, 40)}... `);

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
        console.log("✅");
        succeeded++;
      } else {
        console.log("❌ 요약 생성 실패");
        failed++;
      }
    } catch (error) {
      console.log(`❌ 오류: ${error}`);
      failed++;
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(`\n📊 결과: 성공 ${succeeded}개, 실패 ${failed}개`);

  // Show remaining count
  const remaining = await prisma.article.count({
    where: { isActive: true, summary: null },
  });
  console.log(`📝 남은 기사: ${remaining}개\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
