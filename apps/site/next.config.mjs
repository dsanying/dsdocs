const basePath = process.env.DSDOCS_BASE_PATH ?? '/docs';
if (!/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath) && basePath !== '') throw new Error('Invalid DSDOCS_BASE_PATH');
export default {
  basePath: basePath === '/' ? '' : basePath,
  poweredByHeader: false,
  images: {unoptimized: true},
  env: {NEXT_PUBLIC_DSDOCS_BASE_PATH: basePath === '/' ? '' : basePath},
  async headers() {return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'Content-Security-Policy',value:"object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'"}]}];},
};
