const noVisitWebsiteHostnames = [
  "bloomberg.com",
  "economist.com",
  "ft.com",
  "nytimes.com",
  "reddit.com",
  "reuters.com",
  "telegraph.co.uk",
  "washingtonpost.com",
  "wsj.com",
];

export const canVisit = (url: string) => {
  if (!URL.canParse(url)) {
    return false;
  }

  const { hostname, pathname } = new URL(url);

  // Match on the parsed pathname, not the raw URL: `paper.pdf?download=1`,
  // `paper.pdf#page=2` and `paper.PDF` all end with neither ".pdf" nor ".mp4".
  if (/\.(pdf|mp4)$/i.test(pathname)) {
    return false;
  }

  if (noVisitWebsiteHostnames.some((h) => hostname.includes(h))) {
    return false;
  }

  return true;
};
