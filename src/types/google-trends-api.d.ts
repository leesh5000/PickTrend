declare module "google-trends-api" {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface RelatedQueriesOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface DailyTrendsOptions {
    trendDate?: Date;
    geo?: string;
    hl?: string;
  }

  interface RealTimeTrendsOptions {
    geo?: string;
    hl?: string;
    category?: string;
  }

  function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  function relatedQueries(options: RelatedQueriesOptions): Promise<string>;
  function dailyTrends(options: DailyTrendsOptions): Promise<string>;
  function realTimeTrends(options: RealTimeTrendsOptions): Promise<string>;

  export {
    interestOverTime,
    relatedQueries,
    dailyTrends,
    realTimeTrends,
    InterestOverTimeOptions,
    RelatedQueriesOptions,
    DailyTrendsOptions,
    RealTimeTrendsOptions,
  };
}
