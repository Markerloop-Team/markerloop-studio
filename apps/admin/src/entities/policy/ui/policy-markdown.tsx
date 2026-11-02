import Link from "next/link";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@markerloop/ui/ui";

// The rules are written in a deliberately small markdown subset (SDL-658):
// "## " and "### " headings, "- " lists, "|" tables, paragraphs and [[slug]]
// references to other sections. A tiny renderer instead of a markdown
// dependency: the subset is ours. Tables are the kit's Table.

type Block =
  | { kind: "h2" | "h3" | "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

// A table whose last column holds short values (the limits table: "50",
// "256 KB") gets them right-aligned on one line. A table of prose (the
// Privacy Policy's data and provider tables, SDL-784) wraps every column.
const VALUE_CELL_MAX = 24;
const valueColumn = (block: { rows: string[][] }) =>
  block.rows.every((row) => (row[row.length - 1] ?? "").replace(/\{\{[^}]*\}\}/g, "0000").length <= VALUE_CELL_MAX);

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

export function parsePolicyMarkdown(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
    } else if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
      i += 1;
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
      i += 1;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2).trim());
        i += 1;
      }
      blocks.push({ kind: "ul", items });
    } else if (line.trim().startsWith("|")) {
      const table: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        table.push(lines[i]);
        i += 1;
      }
      const [head, , ...rows] = table;
      blocks.push({ kind: "table", head: cells(head), rows: rows.map(cells) });
    } else {
      const paragraph: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{2,3} |- |\s*\|)/.test(lines[i])
      ) {
        paragraph.push(lines[i].trim());
        i += 1;
      }
      blocks.push({ kind: "p", text: paragraph.join(" ") });
    }
  }
  return blocks;
}

/** Section title by slug, for [[slug]]; `visible` = sections open here. */
export type SectionRefs = {
  titles: Readonly<Record<string, string>>;
  /** Translated titles by locale (SDL-784); see localizeSectionRefs. */
  titlesByLocale?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  visible: readonly string[];
};

const REF = /\[\[([a-z0-9-]+)\]\]/g;

/**
 * [[slug]] → a link to /rules/<slug> when that section is visible on this
 * contour, its «title» as plain text otherwise (never a link to a 404).
 */
function Inline({ text, refs }: { text: string; refs: SectionRefs }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(REF)) {
    const index = match.index ?? 0;
    parts.push(text.slice(last, index));
    const slug = match[1];
    const title = refs.titles[slug] ?? slug;
    parts.push(
      refs.visible.includes(slug) ? (
        <Link key={index} href={`/rules/${slug}`} className="text-primary underline">
          {`«${title}»`}
        </Link>
      ) : (
        `«${title}»`
      )
    );
    last = index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function PolicyMarkdown({ body, refs }: { body: string; refs: SectionRefs }) {
  return (
    <Box gap={4} data-testid="policy-body">
      {parsePolicyMarkdown(body).map((block, index) => {
        switch (block.kind) {
          case "h2":
            return (
              <Text key={index} as="h2" size="xl" weight="semibold" className="pt-2">
                {block.text}
              </Text>
            );
          case "h3":
            return (
              <Text key={index} as="h3" size="lg" weight="semibold" className="pt-1">
                {block.text}
              </Text>
            );
          case "ul":
            return (
              <ul key={index} className="list-disc space-y-2 pl-5">
                {block.items.map((item, itemIndex) => (
                  <Text key={itemIndex} as="li">
                    <Inline text={item} refs={refs} />
                  </Text>
                ))}
              </ul>
            );
          case "table":
            return (
              <Box key={index} className="overflow-x-auto rounded-md border">
                <Table data-testid="policy-table">
                  <TableHeader>
                    <TableRow>
                      {block.head.map((cell, cellIndex) => (
                        <TableHead key={cellIndex}>{cell}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) =>
                          cellIndex === row.length - 1 && valueColumn(block) ? (
                            <TableCell key={cellIndex} align="right" className="whitespace-nowrap tabular-nums">
                              <Inline text={cell} refs={refs} />
                            </TableCell>
                          ) : (
                            <TableCell key={cellIndex} className="whitespace-normal">
                              <Inline text={cell} refs={refs} />
                            </TableCell>
                          )
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            );
          default:
            return (
              <Text key={index}>
                <Inline text={block.text} refs={refs} />
              </Text>
            );
        }
      })}
    </Box>
  );
}
