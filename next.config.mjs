const basePath = process.env.NEXUSFLEET_BASE_PATH || '';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true
};
