const SITE = 'https://usetroupe.dev'

// docs.termul.dev served the docs home at / and the pages at /docs/*. Its root
// files (llms.txt, openapi.yaml, api-reference.html) now live under /docs/, and
// /llms.mdx/docs/* became /docs/llms.mdx/*.
function docsPath(pathname: string): string {
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return pathname
  if (pathname.startsWith('/llms.mdx/docs/')) {
    return `/docs/llms.mdx/${pathname.slice('/llms.mdx/docs/'.length)}`
  }
  return `/docs${pathname}`
}

export function redirectTarget(requestUrl: string): string {
  const url = new URL(requestUrl)
  const path = url.hostname === 'docs.termul.dev' ? docsPath(url.pathname) : url.pathname
  return `${SITE}${path}${url.search}`
}

export default {
  fetch(request: Request): Response {
    return Response.redirect(redirectTarget(request.url), 308)
  }
}
