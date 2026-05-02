export class WikilinkProcessor {
  name = 'WikilinkProcessor';
  constructor(private strategy: string) {}
  process(content: string): string {
    return content.replace(/\[\[([^|]+?)(?:\|(.+?))?\]\]/g, (_, target, text) => {
      if (this.strategy === 'strip') return '';
      return text || target;
    });
  }
}
