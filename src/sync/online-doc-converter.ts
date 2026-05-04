import type { FeishuCliBridge } from '../bridge/feishu-cli-bridge';

export interface ConvertResult {
  content: string;
  frontmatter: string;
}

export class OnlineDocConverter {
  constructor(private bridge: Pick<FeishuCliBridge, 'exportDoc'>) {}

  buildFrontmatter(token: string, docType: string, remoteModifiedAt: string): string {
    const now = new Date().toLocaleString();
    return [
      '---',
      `feishu_doc_token: "${token}"`,
      `feishu_doc_type: "${docType}"`,
      `feishu_last_synced_at: "${now}"`,
      `feishu_remote_modified_at: "${remoteModifiedAt}"`,
      '---',
      '',
    ].join('\n');
  }

  async convert(token: string, docType: string, remoteModifiedAt: string): Promise<ConvertResult> {
    const content = await this.bridge.exportDoc(token, docType);
    const frontmatter = this.buildFrontmatter(token, docType, remoteModifiedAt);
    return { content, frontmatter };
  }
}
