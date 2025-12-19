import { XMLParser } from "fast-xml-parser";

export interface GoogleNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export interface ParsedArticle {
  title: string;
  originalUrl: string;
  description: string;
  publishedAt: Date;
  source: "GOOGLE";
  category: string | null;
}

// 카테고리별 검색 키워드
const SEARCH_QUERIES: Record<string, string[]> = {
  electronics: ["스마트폰 추천", "노트북 추천", "IT 기기 리뷰"],
  beauty: ["화장품 추천", "뷰티 트렌드", "스킨케어 추천"],
  appliances: ["가전제품 추천", "생활가전 리뷰"],
  food: ["건강식품 추천", "음식 트렌드"],
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function parseGoogleRssXml(xml: string): GoogleNewsItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  try {
    const result = parser.parse(xml);
    const items = result?.rss?.channel?.item;

    if (!items) return [];

    const itemArray = Array.isArray(items) ? items : [items];

    return itemArray.map((item) => {
      // Google News RSS의 source 정보 추출
      const sourceMatch = item.title?.match(/ - ([^-]+)$/);
      const source = sourceMatch ? sourceMatch[1].trim() : "";
      const cleanTitle = item.title?.replace(/ - [^-]+$/, "").trim() || "";

      return {
        title: decodeHtmlEntities(cleanTitle),
        link: item.link || "",
        pubDate: item.pubDate || "",
        source: decodeHtmlEntities(source),
      };
    });
  } catch (error) {
    console.error("Google RSS XML 파싱 오류:", error);
    return [];
  }
}

export async function fetchGoogleNews(query: string, category: string | null = null): Promise<ParsedArticle[]> {
  const encodedQuery = encodeURIComponent(query);
  // when:1d = 최근 1일 이내 기사만, 최신순 정렬
  const url = `https://news.google.com/rss/search?q=${encodedQuery}+when:1d&hl=ko&gl=KR&ceid=KR:ko`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PickRanky/1.0)",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Google News 요청 실패: ${response.status}`);
    }

    const xml = await response.text();
    const items = parseGoogleRssXml(xml);

    return items.map((item) => ({
      title: item.title,
      originalUrl: item.link,
      description: `출처: ${item.source}`,
      publishedAt: new Date(item.pubDate),
      source: "GOOGLE" as const,
      category,
    }));
  } catch (error) {
    console.error(`Google News 수집 오류 (${query}):`, error);
    return [];
  }
}

export async function fetchGoogleNewsByCategory(category: string): Promise<ParsedArticle[]> {
  const queries = SEARCH_QUERIES[category];
  if (!queries) {
    console.warn(`알 수 없는 카테고리: ${category}`);
    return [];
  }

  const results: ParsedArticle[] = [];

  for (const query of queries) {
    const articles = await fetchGoogleNews(query, category);
    results.push(...articles);
    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

export async function fetchAllGoogleNews(): Promise<ParsedArticle[]> {
  const categories = Object.keys(SEARCH_QUERIES);
  const results: ParsedArticle[] = [];

  for (const category of categories) {
    const articles = await fetchGoogleNewsByCategory(category);
    results.push(...articles);
  }

  return results;
}

export { SEARCH_QUERIES };
