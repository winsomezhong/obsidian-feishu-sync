import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnlineDocConverter } from './online-doc-converter';
import type { FeishuCliBridge } from '../bridge/feishu-cli-bridge';

describe('OnlineDocConverter', () => {
  let mockBridge: Pick<FeishuCliBridge, 'exportDoc'>;

  beforeEach(() => {
    mockBridge = {
      exportDoc: vi.fn().mockResolvedValue('# Exported content\n\nHello world'),
    };
  });

  describe('buildFrontmatter', () => {
    it('generates frontmatter with all required fields', () => {
      const converter = new OnlineDocConverter(mockBridge as any);
      const frontmatter = converter.buildFrontmatter('token123', 'docx', '2026-05-04T12:00:00Z');
      expect(frontmatter).toContain('feishu_doc_token: "token123"');
      expect(frontmatter).toContain('feishu_doc_type: "docx"');
      expect(frontmatter).toContain('feishu_remote_modified_at: "2026-05-04T12:00:00Z"');
      expect(frontmatter).toContain('feishu_last_synced_at:');
    });

    it('starts with --- and ends with ---', () => {
      const converter = new OnlineDocConverter(mockBridge as any);
      const frontmatter = converter.buildFrontmatter('t1', 'sheet', '2026-05-04T10:00:00Z');
      expect(frontmatter.startsWith('---\n')).toBe(true);
      expect(frontmatter.endsWith('\n---\n')).toBe(true);
    });

    it('handles bitable doc type', () => {
      const converter = new OnlineDocConverter(mockBridge as any);
      const frontmatter = converter.buildFrontmatter('bt1', 'bitable', '2026-05-04T08:00:00Z');
      expect(frontmatter).toContain('feishu_doc_type: "bitable"');
    });
  });

  describe('convert', () => {
    it('calls exportDoc and returns content with frontmatter', async () => {
      const converter = new OnlineDocConverter(mockBridge as any);
      const result = await converter.convert('token123', 'docx', '2026-05-04T12:00:00Z');
      expect(mockBridge.exportDoc).toHaveBeenCalledWith('token123', 'docx');
      expect(result.content).toContain('# Exported content');
      expect(result.frontmatter).toContain('feishu_doc_token: "token123"');
    });

    it('returns combined output with frontmatter prepended', async () => {
      const converter = new OnlineDocConverter(mockBridge as any);
      const result = await converter.convert('token456', 'sheet', '2026-05-04T14:00:00Z');
      const combined = result.frontmatter + result.content;
      expect(combined.startsWith('---')).toBe(true);
      expect(combined).toContain('feishu_doc_token: "token456"');
      expect(combined).toContain('# Exported content');
    });

    it('re-throws when exportDoc fails', async () => {
      mockBridge.exportDoc = vi.fn().mockRejectedValue(new Error('Export failed'));
      const converter = new OnlineDocConverter(mockBridge as any);
      await expect(converter.convert('badToken', 'docx', '2026-05-04T12:00:00Z')).rejects.toThrow('Export failed');
    });
  });
});
