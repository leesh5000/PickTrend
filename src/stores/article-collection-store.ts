import { create } from "zustand";

export type CollectionStatus = "idle" | "collecting" | "completed" | "failed";

interface CollectionResult {
  total: number;
  newArticles: number;
  duplicates: number;
  summarized: number;
  errors: string[];
}

interface ArticleCollectionState {
  status: CollectionStatus;
  jobId: string | null;
  result: CollectionResult | null;
  error: string | null;
  isVisible: boolean;

  // Actions
  startCollection: (jobId: string) => void;
  setCompleted: (result: CollectionResult) => void;
  setFailed: (error: string) => void;
  reset: () => void;
  hide: () => void;
  show: () => void;
}

export const useArticleCollectionStore = create<ArticleCollectionState>((set) => ({
  status: "idle",
  jobId: null,
  result: null,
  error: null,
  isVisible: false,

  startCollection: (jobId: string) =>
    set({
      status: "collecting",
      jobId,
      result: null,
      error: null,
      isVisible: true,
    }),

  setCompleted: (result: CollectionResult) =>
    set({
      status: "completed",
      result,
      error: null,
    }),

  setFailed: (error: string) =>
    set({
      status: "failed",
      error,
    }),

  reset: () =>
    set({
      status: "idle",
      jobId: null,
      result: null,
      error: null,
      isVisible: false,
    }),

  hide: () => set({ isVisible: false }),
  show: () => set({ isVisible: true }),
}));
