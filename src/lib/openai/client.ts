import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface SummarizeOptions {
  maxLength?: number;
  language?: "ko" | "en";
}

export async function summarizeArticle(
  content: string,
  options: SummarizeOptions = {}
): Promise<string | null> {
  const { maxLength = 300, language = "ko" } = options;

  if (!content || content.length < 50) {
    console.log("본문이 너무 짧아 요약을 생성할 수 없습니다.");
    return null;
  }

  // 본문이 너무 길면 앞부분만 사용 (토큰 절약)
  const truncatedContent = content.length > 4000 ? content.slice(0, 4000) : content;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `당신은 쇼핑 트렌드 기사를 요약하는 전문가입니다.
- 핵심 내용을 ${maxLength}자 이내로 간결하게 요약해주세요.
- ${language === "ko" ? "한국어" : "영어"}로 작성하세요.
- 객관적인 톤을 유지하세요.
- 제품명, 브랜드명, 핵심 특징을 포함하세요.
- 가격 정보가 있다면 포함하세요.`,
        },
        {
          role: "user",
          content: `다음 기사를 요약해주세요:\n\n${truncatedContent}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const summary = response.choices[0]?.message?.content?.trim();
    return summary || null;
  } catch (error) {
    console.error("OpenAI 요약 생성 오류:", error);
    return null;
  }
}

export async function classifyCategory(
  title: string,
  content: string
): Promise<string | null> {
  const truncatedContent = content.length > 1000 ? content.slice(0, 1000) : content;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `기사를 다음 카테고리 중 하나로 분류하세요:
- electronics: 스마트폰, 노트북, 태블릿, 이어폰, IT 기기
- beauty: 화장품, 스킨케어, 메이크업, 뷰티 제품
- appliances: 가전제품, 냉장고, 세탁기, 청소기, TV
- food: 식품, 음료, 건강식품, 간식

해당하는 카테고리 키워드만 반환하세요. 해당 없으면 null을 반환하세요.`,
        },
        {
          role: "user",
          content: `제목: ${title}\n내용: ${truncatedContent}`,
        },
      ],
      max_tokens: 20,
      temperature: 0.1,
    });

    const category = response.choices[0]?.message?.content?.trim().toLowerCase();
    const validCategories = ["electronics", "beauty", "appliances", "food"];

    if (category && validCategories.includes(category)) {
      return category;
    }
    return null;
  } catch (error) {
    console.error("OpenAI 카테고리 분류 오류:", error);
    return null;
  }
}

export async function summarizeFromMetadata(
  title: string,
  description: string,
  options: SummarizeOptions = {}
): Promise<string | null> {
  const { maxLength = 200, language = "ko" } = options;

  if (!title || title.length < 10) {
    console.log("제목이 너무 짧아 요약을 생성할 수 없습니다.");
    return null;
  }

  const inputText = description && description.length > 10
    ? `제목: ${title}\n설명: ${description}`
    : `제목: ${title}`;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `당신은 쇼핑 트렌드 뉴스 기사를 요약하는 전문가입니다.
- 주어진 제목과 설명을 바탕으로 ${maxLength}자 이내의 요약을 작성하세요.
- ${language === "ko" ? "한국어" : "영어"}로 작성하세요.
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

    const summary = response.choices[0]?.message?.content?.trim();
    return summary || null;
  } catch (error) {
    console.error("OpenAI 메타데이터 기반 요약 생성 오류:", error);
    return null;
  }
}

export async function extractKeywords(content: string): Promise<string[]> {
  const truncatedContent = content.length > 2000 ? content.slice(0, 2000) : content;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `기사에서 쇼핑/제품 관련 핵심 키워드를 5개 이하로 추출하세요.
제품명, 브랜드명, 카테고리 등을 포함하세요.
키워드는 쉼표로 구분하여 반환하세요.`,
        },
        {
          role: "user",
          content: truncatedContent,
        },
      ],
      max_tokens: 100,
      temperature: 0.2,
    });

    const keywords = response.choices[0]?.message?.content?.trim();
    if (keywords) {
      return keywords.split(",").map((k) => k.trim()).filter(Boolean);
    }
    return [];
  } catch (error) {
    console.error("OpenAI 키워드 추출 오류:", error);
    return [];
  }
}
