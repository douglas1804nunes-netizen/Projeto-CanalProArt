import "@testing-library/jest-dom/vitest";

// jsdom não implementa ResizeObserver — o Recharts (usado no Dashboard, Fase
// 9) precisa dele pra medir o container do gráfico.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
