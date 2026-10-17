import type { Plugin } from "vite";

interface BundleChunk {
  type: "chunk";
  fileName: string;
  modules: Record<string, unknown>;
  imports: string[];
  dynamicImports: string[];
  isEntry: boolean;
}

interface BundleAsset { type: "asset" }
type BundleOutput = BundleChunk | BundleAsset;

export interface LazyBoundary {
  id: string;
  ownerModule: string;
  lazyModule: string;
  dependencies: string[];
}

export declare const inspectLazyBoundaries: (
  bundle: Record<string, BundleOutput>,
  boundaries: LazyBoundary[],
) => string[];
export declare const lazyBoundaryPlugin: (boundaries: LazyBoundary[]) => Plugin;
