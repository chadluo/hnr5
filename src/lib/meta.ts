import { type DefaultTreeAdapterTypes, type Token, parse } from "parse5";

export type Meta = {
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  authors?: string;
};

export async function getMeta(storyId: number, html: string) {
  const rawMeta = findRawMeta(storyId, html);
  const meta = {
    title: (rawMeta.get("title") ??
      rawMeta.get("og:title") ??
      rawMeta.get("twitter:title"))?.[0],
    description: (rawMeta.get("description") ??
      rawMeta.get("og:description") ??
      rawMeta.get("twitter:description"))?.[0],
    image: (rawMeta.get("og:image") ?? rawMeta.get("twitter:image"))?.[0],
    imageAlt: (rawMeta.get("og:image:alt") ??
      rawMeta.get("twitter:image:alt"))?.[0],
    authors: rawMeta.get("citation_author")?.join(" | "),
  };

  return meta;
}

function findRawMeta(storyId: number, html: string): Map<string, string[]> {
  const parsed = parse(html, { scriptingEnabled: false });
  const htmlNode: DefaultTreeAdapterTypes.Element | undefined =
    parsed?.childNodes.find(
      (node: DefaultTreeAdapterTypes.Node) => node.nodeName === "html",
    ) as DefaultTreeAdapterTypes.Element | undefined;
  const headNode: DefaultTreeAdapterTypes.Element | undefined =
    htmlNode?.childNodes.find(
      (node: DefaultTreeAdapterTypes.Node) => node.nodeName === "head",
    ) as DefaultTreeAdapterTypes.Element | undefined;
  const rawMeta = headNode?.childNodes
    .map((node) => {
      if (node.nodeName === "title") {
        const value = node.childNodes[0] as DefaultTreeAdapterTypes.TextNode;
        if (value == null) {
          console.warn("Cannot load title", { storyId });
        } else {
          return [
            "title",
            (node.childNodes[0] as DefaultTreeAdapterTypes.TextNode).value,
          ] as [string, string];
        }
      }

      if (node.nodeName === "meta") {
        const key = node.attrs.find(
          (attr: Token.Attribute) =>
            attr.name === "property" || attr.name === "name",
        )?.value;
        const value = node.attrs.find(
          (attr: Token.Attribute) => attr.name === "content",
        )?.value;
        if (key == null || value == null) {
          return;
        }
        return [key, value] as [string, string];
      }
    })
    .reduce(
      (map: Map<string, string[]>, entry: [string, string] | undefined) => {
        if (entry == null) {
          return map;
        }
        const [key, value] = entry;
        if (map.has(key)) {
          map.get(key)?.push(value);
        } else {
          map.set(key, [value]);
        }
        return map;
      },
      new Map(),
    );
  if (!rawMeta) {
    console.warn("Cannot load metadata", { storyId });
    return new Map();
  }
  return rawMeta;
}
