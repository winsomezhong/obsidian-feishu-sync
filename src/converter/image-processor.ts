export class ImageProcessor {
  name = 'ImageProcessor';
  constructor(private strategy: string) {}
  process(content: string): string {
    return content.replace(/!\[\[(.+?)\]\]|!\[.*?\]\(.+?\)/g, (match, captured) => {
      if (this.strategy === 'strip') return '';
      const filename = captured || match.replace(/!\[.*?\]\((.+?)\)/, '$1');
      return `[image: ${filename}]`;
    });
  }
}
