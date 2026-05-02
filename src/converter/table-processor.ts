export class TableProcessor {
  name = 'TableProcessor';
  constructor(private maxRows: number) {}
  process(content: string): string {
    return content.replace(/(^\|.+\|\n\|[-| ]+\|\n(?:\|.+\|\n?)*)/gm, (match) => {
      const lines = match.trim().split('\n');
      const header = lines[0];
      const bodyRows = lines.slice(2);
      if (bodyRows.length <= this.maxRows) return match;

      const chunks: string[] = [];
      for (let i = 0; i < bodyRows.length; i += this.maxRows) {
        chunks.push([header, lines[1], ...bodyRows.slice(i, i + this.maxRows)].join('\n'));
      }
      return chunks.join('\n\n');
    });
  }
}
