/**
 * Builds the manifest.json structure from compiled file results.
 * @param {Array<{frontmatter: object, outputFilename: string, route: string, isOpen: boolean}>} compiled
 * @returns {{ routes: Record<string, object> }}
 */
export function buildManifest(compiled) {
  const routes = {};

  for (const item of compiled) {
    routes[item.route] = {
      title: item.frontmatter.title,
      tags: item.frontmatter.tags,
      folder: item.frontmatter.folder,
      description: item.frontmatter.description,
      encrypted_file_path: `content/${item.outputFilename}`,
      open: item.isOpen,
    };
  }

  return { routes };
}
