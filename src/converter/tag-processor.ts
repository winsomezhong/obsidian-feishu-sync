export class TagProcessor {
  name = 'TagProcessor';
  constructor(private strategy: string) {}
  process(content: string): string {
    if (this.strategy === 'strip') return content.replace(/#[\w-/]+/g, '');
    return content;
  }
}
