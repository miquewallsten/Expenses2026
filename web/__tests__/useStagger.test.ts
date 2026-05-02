import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStagger } from "../hooks/useStagger";

describe("useStagger", () => {
  it("returns empty array for count 0", () => {
    const { result } = renderHook(() => useStagger({ count: 0 }));
    expect(result.current).toEqual([]);
  });

  it("returns correct number of items", () => {
    const { result } = renderHook(() => useStagger({ count: 5 }));
    expect(result.current).toHaveLength(5);
  });

  it("uses default increment of 30ms", () => {
    const { result } = renderHook(() => useStagger({ count: 3 }));
    expect(result.current[0]).toEqual({ animationDelay: "0ms" });
    expect(result.current[1]).toEqual({ animationDelay: "30ms" });
    expect(result.current[2]).toEqual({ animationDelay: "60ms" });
  });

  it("respects baseDelay option", () => {
    const { result } = renderHook(() =>
      useStagger({ count: 3, baseDelay: 100 })
    );
    expect(result.current[0]).toEqual({ animationDelay: "100ms" });
    expect(result.current[1]).toEqual({ animationDelay: "130ms" });
    expect(result.current[2]).toEqual({ animationDelay: "160ms" });
  });

  it("respects custom increment", () => {
    const { result } = renderHook(() =>
      useStagger({ count: 3, increment: 50 })
    );
    expect(result.current[0]).toEqual({ animationDelay: "0ms" });
    expect(result.current[1]).toEqual({ animationDelay: "50ms" });
    expect(result.current[2]).toEqual({ animationDelay: "100ms" });
  });

  it("caps delay at maxDelay", () => {
    const { result } = renderHook(() =>
      useStagger({ count: 10, increment: 50, maxDelay: 200 })
    );
    expect(result.current[0]).toEqual({ animationDelay: "0ms" });
    expect(result.current[4]).toEqual({ animationDelay: "200ms" });
    expect(result.current[9]).toEqual({ animationDelay: "200ms" });
  });

  it("memoizes results for same inputs", () => {
    const { result, rerender } = renderHook(() =>
      useStagger({ count: 3, baseDelay: 0, increment: 30, maxDelay: 300 })
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns new array when count changes", () => {
    const { result, rerender } = renderHook(
      ({ count }) => useStagger({ count }),
      { initialProps: { count: 3 } }
    );
    const first = result.current;
    rerender({ count: 5 });
    expect(result.current).not.toBe(first);
    expect(result.current).toHaveLength(5);
  });
});