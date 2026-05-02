export class FrontmatterProcessor {
  name = 'FrontmatterProcessor';
  constructor(private strategy: string) {}
  process(content: string): string {
    if (this.strategy === 'strip') {
      return content.replace(/^---[\s\S]*?\n---\n?/, '');
    }
    return content;
  }
}
