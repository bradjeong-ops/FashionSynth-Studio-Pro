// IndexedDB Persistence has been removed as per request.
// This file is kept as a placeholder to prevent import errors in untracked files if any,
// but all internal logic is disabled.

import { GenerationHistoryItem, GeneratedImage, FashionCategory } from '../types';

export const saveModelHistoryItem = async (item: GenerationHistoryItem) => {
  // No-op
  return Promise.resolve();
};

export const getModelHistory = async (): Promise<GenerationHistoryItem[]> => {
  // Return empty array
  return Promise.resolve([]);
};

export const deleteModelItem = async (id: string) => {
  // No-op
  return Promise.resolve();
};

export const saveOutfitHistoryItem = async (item: GeneratedImage, category: FashionCategory) => {
  // No-op
  return Promise.resolve();
};

export const getOutfitHistory = async (): Promise<GeneratedImage[]> => {
  // Return empty array
  return Promise.resolve([]);
};

export const deleteOutfitItem = async (id: string) => {
  // No-op
  return Promise.resolve();
};