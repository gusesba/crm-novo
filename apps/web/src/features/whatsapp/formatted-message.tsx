import { Fragment, type ReactNode } from "react";

function format(text: string, renderText: (text: string) => ReactNode, active: string[] = []): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(?<!`)```(?!`)([\s\S]+?)(?<!`)```(?!`)|(?<!`)`([^`\r\n]+)`(?!`)|\*([^\s*\r\n](?:[^*\r\n]*?[^\s*\r\n])?)\*|_([^\s_\r\n](?:[^_\r\n]*?[^\s_\r\n])?)_|~([^\s~\r\n](?:[^~\r\n]*?[^\s~\r\n])?)~/gu;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const marker = match[0][0];
    const code = marker === "`";
    const end = match.index + match[0].length;
    if (!code && (active.includes(marker) ||
        /[\p{L}\p{N}]/u.test(text[match.index - 1] || "") ||
        /[\p{L}\p{N}]/u.test(text[end] || "") ||
        text[match.index - 1] === marker || text[end] === marker)) continue;
    parts.push(<Fragment key={`text-${match.index}`}>{renderText(text.slice(cursor, match.index))}</Fragment>);
    const content = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (code) parts.push(<code className="message-code" key={match.index}>{content}</code>);
    else {
      const Element = marker === "*" ? "strong" : marker === "_" ? "em" : "s";
      parts.push(<Element key={match.index}>{format(content, renderText, [...active, marker])}</Element>);
    }
    cursor = end;
  }
  parts.push(<Fragment key="rest">{renderText(text.slice(cursor))}</Fragment>);
  return parts;
}

export function FormattedMessage({ text, renderText = (value) => value }: {
  text: string;
  renderText?: (text: string) => ReactNode;
}) {
  return <>{format(text, renderText)}</>;
}
