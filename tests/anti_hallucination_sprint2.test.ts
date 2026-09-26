import { describe, expect, it } from 'vitest';
import { ReActExecutor } from '../src/capabilities/dialogue/cognitive/ReActExecutor';

describe('Anti-Hallucination Sprint 2: Grounding Interceptor & Observation Injector', () => {
  it('ReActExecutor.isEmptySensoryPayload correctly identifies zero-record payloads', () => {
    // Array cases
    expect(ReActExecutor.isEmptySensoryPayload('THREADS_GET_POSTS', [])).toBe(true);
    expect(ReActExecutor.isEmptySensoryPayload('THREADS_GET_POSTS', null)).toBe(true);
    expect(ReActExecutor.isEmptySensoryPayload('THREADS_GET_POSTS', undefined)).toBe(true);

    // Threads empty posts case
    expect(ReActExecutor.isEmptySensoryPayload('THREADS_GET_POSTS', { success: true, posts: [] })).toBe(true);
    expect(ReActExecutor.isEmptySensoryPayload('THREADS_GET_POSTS', { success: true, posts: [{ id: '123', text: 'Hi' }] })).toBe(false);

    // Catalog empty products case
    expect(ReActExecutor.isEmptySensoryPayload('CATALOG_SEARCH_PRODUCTS', { success: true, products: [] })).toBe(true);
    expect(ReActExecutor.isEmptySensoryPayload('CATALOG_SEARCH_PRODUCTS', { success: true, products: [{ id: 'item1' }] })).toBe(false);

    // Web search empty results case
    expect(ReActExecutor.isEmptySensoryPayload('WEB_SEARCH', { results: [] })).toBe(true);
    expect(ReActExecutor.isEmptySensoryPayload('WEB_SEARCH', { results: [{ title: 'News', url: 'https://...' }] })).toBe(false);

    // Generic count or data case
    expect(ReActExecutor.isEmptySensoryPayload('CUSTOM_QUERY', { data: [], count: 0 })).toBe(true);
    expect(ReActExecutor.isEmptySensoryPayload('CUSTOM_QUERY', { data: [{ a: 1 }], count: 1 })).toBe(false);
  });
});
