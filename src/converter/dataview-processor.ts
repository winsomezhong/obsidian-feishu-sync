export class DataviewProcessor {
  name = 'DataviewProcessor';
  constructor(private strategy: string) {}
  process(content: string): string {
    return content.replace(/(\n?)```(dataview|dataviewjs)\n[\s\S]*?\n```/g, (match, leadingNewline, lang) => {
      if (this.strategy === 'strip') {
        return '';
      }
      return (leadingNewline || '') + '<!-- dataview query removed for Feishu compatibility -->';
    });
  }
}
