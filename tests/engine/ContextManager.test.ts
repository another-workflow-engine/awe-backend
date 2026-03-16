import { contextManager } from "../../src/engine/ContextManager.js";

describe("ContextManager", () => {
  describe("create()", () => {
    it("returns an empty global scope", () => {
      const ctx = contextManager.create();
      expect(ctx.global).toEqual({});
    });
  });

  describe("merge()", () => {
    it("merges vars into global.constants", () => {
      const ctx = contextManager.create();
      const merged = contextManager.merge(ctx, { x: 1 });
      expect(merged.global).toEqual({ constants: { x: 1 } });
    });

    it("does not mutate the original context object", () => {
      const ctx = { global: { a: 1 } };
      const globalBefore = { ...ctx.global };
      contextManager.merge(ctx, { x: 99 });
      expect(ctx.global).toEqual(globalBefore);
    });

    it("merges new vars on top of existing global vars", () => {
      const ctx = { global: { a: 1, b: 2 } };
      const merged = contextManager.merge(ctx, { b: 99, c: 3 });
      expect(merged.global).toEqual({ a: 1, b: 2, constants: { b: 99, c: 3 } });
    });
  });

  describe("resolveForNode()", () => {
    it("returns all global vars", () => {
      const ctx = { global: { a: 1, b: 2 } };
      expect(contextManager.resolveForNode(ctx)).toEqual({ a: 1, b: 2 });
    });

    it("returns empty object when global is empty", () => {
      const ctx = contextManager.create();
      expect(contextManager.resolveForNode(ctx)).toEqual({});
    });
  });

  describe("fromJson()", () => {
    it("returns correct WorkflowContext from well-formed JSON", () => {
      const json = { global: { x: 1 } };
      const result = contextManager.fromJson(json);
      expect(result.global).toEqual({ x: 1 });
    });

    it("returns empty global when input is null", () => {
      const result = contextManager.fromJson(null);
      expect(result).toEqual({ global: {} });
    });

    it("defaults global to empty object when key is missing", () => {
      const json = { other: "ignored" };
      const result = contextManager.fromJson(json);
      expect(result.global).toEqual({});
    });
  });
});
