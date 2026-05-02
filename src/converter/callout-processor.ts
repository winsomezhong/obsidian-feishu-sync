export class CalloutProcessor {
  name = 'CalloutProcessor';
  constructor(private strategy: string) {}
  process(content: string): string {
    return content.replace(/^> \[!(\w+)\]/gm, (match, type) => {
      if (this.strategy === 'keep') return match;
      if (this.strategy === 'convert-to-codeblock') {
        // Will be handled by caller post-processing
        return match;
      }
      return '>';
    });
  }
}
