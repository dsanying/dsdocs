const normalizeModuleId = (moduleId) => moduleId.replaceAll("\\", "/");

const outputChunks = (bundle) =>
  Object.values(bundle).filter((output) => output.type === "chunk");

const findChunkByModule = (chunks, moduleSuffix) =>
  chunks.find((chunk) =>
    Object.keys(chunk.modules).some((moduleId) =>
      normalizeModuleId(moduleId).endsWith(moduleSuffix),
    ),
  );

const collectStaticClosure = (chunksByFileName, roots) => {
  const closure = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const fileName = pending.pop();
    if (!fileName || closure.has(fileName)) continue;
    closure.add(fileName);
    const chunk = chunksByFileName.get(fileName);
    if (chunk) pending.push(...chunk.imports);
  }
  return closure;
};

const closureModuleIds = (chunksByFileName, closure) =>
  [...closure].flatMap((fileName) =>
    Object.keys(chunksByFileName.get(fileName)?.modules ?? {}).map(normalizeModuleId),
  );

export const inspectLazyBoundaries = (bundle, boundaries) => {
  const chunks = outputChunks(bundle);
  const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const entryClosure = collectStaticClosure(
    chunksByFileName,
    chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
  );
  const entryModules = closureModuleIds(chunksByFileName, entryClosure);
  const errors = [];

  for (const boundary of boundaries) {
    const ownerChunk = findChunkByModule(chunks, boundary.ownerModule);
    const lazyChunk = findChunkByModule(chunks, boundary.lazyModule);
    if (!ownerChunk) errors.push(`${boundary.id}: 未找到所有者产物块`);
    if (!lazyChunk) errors.push(`${boundary.id}: 未找到按需模块产物块`);
    if (!ownerChunk || !lazyChunk) continue;

    if (entryClosure.has(lazyChunk.fileName)) {
      errors.push(`${boundary.id}: 按需模块被生产入口静态加载`);
    }
    if (!ownerChunk.dynamicImports.includes(lazyChunk.fileName)) {
      errors.push(`${boundary.id}: 所有者未直接动态导入按需模块`);
    }

    const lazyClosure = collectStaticClosure(chunksByFileName, [lazyChunk.fileName]);
    const lazyModules = closureModuleIds(chunksByFileName, lazyClosure);
    for (const dependency of boundary.dependencies) {
      if (!lazyModules.some((moduleId) => moduleId.includes(dependency))) {
        errors.push(`${boundary.id}: 按需闭包缺少 ${dependency}`);
      }
      if (entryModules.some((moduleId) => moduleId.includes(dependency))) {
        errors.push(`${boundary.id}: ${dependency} 泄漏到生产入口静态闭包`);
      }
    }
  }

  return errors;
};

export const lazyBoundaryPlugin = (boundaries) => ({
  name: "dsdocs-lazy-boundaries",
  generateBundle(_options, bundle) {
    const errors = inspectLazyBoundaries(bundle, boundaries);
    if (errors.length > 0) this.error(`[lazy-boundaries] ${errors.join("；")}`);
  },
});
