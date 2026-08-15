import vm from "node:vm";

import { describe, expect, it } from "vitest";

import {
  ONE_SHEET_PRINT_DPI,
  ONE_SHEET_PRINT_JPEG_QUALITY,
  ONE_SHEET_PRINT_OPTIMIZER_SCRIPT,
  ONE_SHEET_PRINT_SELECTOR,
} from "./print";

type Listener = () => void;

type DrawCall = readonly [
  unknown,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

describe("preparazione PDF delle foto", () => {
  it("fissa il budget visivo a 300 dpi e JPEG 90%", () => {
    expect(ONE_SHEET_PRINT_DPI).toBe(300);
    expect(ONE_SHEET_PRINT_JPEG_QUALITY).toBe(0.9);
    expect(ONE_SHEET_PRINT_SELECTOR).toBe("img[data-one-sheet-photo]");
  });

  it("prima della stampa riduce e ritaglia come object-fit cover, poi ripristina l'originale", () => {
    const listeners: Record<string, Listener> = {};
    const drawCalls: DrawCall[] = [];
    const dataUrls: [string, number][] = [];

    const image = {
      complete: true,
      naturalWidth: 3200,
      naturalHeight: 4200,
      src: "https://example.test/original.jpg",
      getBoundingClientRect: () => ({ width: 140, height: 150 }),
      closest: () => ({ kind: "sheet" }),
    };

    const context = {
      fillStyle: "",
      fillRect: () => undefined,
      drawImage: (...args: unknown[]) => drawCalls.push(args as unknown as DrawCall),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: (mime: string, quality: number) => {
        dataUrls.push([mime, quality]);
        return "data:image/jpeg;base64,optimized";
      },
    };

    vm.runInNewContext(ONE_SHEET_PRINT_OPTIMIZER_SCRIPT, {
      Map,
      Math,
      document: {
        querySelectorAll: (selector: string) => {
          expect(selector).toBe(ONE_SHEET_PRINT_SELECTOR);
          return [image];
        },
        createElement: (tag: string) => {
          expect(tag).toBe("canvas");
          return canvas;
        },
      },
      getComputedStyle: () => ({ backgroundColor: "rgb(245, 242, 234)" }),
      addEventListener: (name: string, listener: Listener) => {
        listeners[name] = listener;
      },
    });

    expect(listeners.beforeprint).toBeTypeOf("function");
    expect(listeners.afterprint).toBeTypeOf("function");
    listeners.beforeprint?.();

    expect(canvas.width).toBe(Math.ceil(140 * (300 / 96)));
    expect(canvas.height).toBe(Math.ceil(150 * (300 / 96)));
    expect(dataUrls).toEqual([["image/jpeg", 0.9]]);
    expect(image.src).toBe("data:image/jpeg;base64,optimized");

    const call = drawCalls[0];
    expect(call).toBeDefined();
    if (call === undefined) throw new Error("drawImage non è stato chiamato");
    expect(call[1]).toBe(0);
    expect(call[2]).toBeGreaterThan(0); // portrait -> crop verticale centrato
    expect(call[3]).toBe(3200);
    expect(call[4]).toBeLessThan(4200);
    expect(call[7]).toBe(canvas.width);
    expect(call[8]).toBe(canvas.height);

    listeners.afterprint?.();
    expect(image.src).toBe("https://example.test/original.jpg");
  });

  it("non ricampiona una foto che è già più piccola del target di stampa", () => {
    const listeners: Record<string, Listener> = {};
    let canvasCreated = false;
    const image = {
      complete: true,
      naturalWidth: 300,
      naturalHeight: 300,
      src: "small.jpg",
      getBoundingClientRect: () => ({ width: 140, height: 140 }),
      closest: () => null,
    };

    vm.runInNewContext(ONE_SHEET_PRINT_OPTIMIZER_SCRIPT, {
      Map,
      Math,
      document: {
        querySelectorAll: () => [image],
        createElement: () => {
          canvasCreated = true;
          return {};
        },
      },
      getComputedStyle: () => ({ backgroundColor: "white" }),
      addEventListener: (name: string, listener: Listener) => {
        listeners[name] = listener;
      },
    });

    listeners.beforeprint?.();
    expect(canvasCreated).toBe(false);
    expect(image.src).toBe("small.jpg");
  });
});
