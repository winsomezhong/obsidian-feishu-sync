import { FrontmatterProcessor } from './frontmatter-processor';
import { DataviewProcessor } from './dataview-processor';
import { WikilinkProcessor } from './wikilink-processor';
import { TagProcessor } from './tag-processor';
import { ImageProcessor } from './image-processor';
import { TableProcessor } from './table-processor';
import { CalloutProcessor } from './callout-processor';
import { MathProcessor } from './math-processor';

export interface SyncProcessor {
  name: string;
  process(content: string): string;
}

export interface ProcessResult {
  content: string;
  metadata: Record<string, unknown>;
}

export interface ProcessorConfig {
  frontmatter: 'strip' | 'keep-as-text';
  wikilink: 'keep-text' | 'strip';
  tag: 'keep-inline' | 'strip';
  dataview: 'comment-out' | 'strip';
  image: 'upload' | 'strip';
  tableMaxRows: number;
  callout: 'strip-type' | 'keep' | 'convert-to-codeblock';
  math: 'keep';
}

const DEFAULT_CONFIG: ProcessorConfig = {
  frontmatter: 'strip',
  wikilink: 'keep-text',
  tag: 'keep-inline',
  dataview: 'comment-out',
  image: 'strip',
  tableMaxRows: 9,
  callout: 'strip-type',
  math: 'keep',
};

export class Preprocessor {
  private processors: SyncProcessor[] = [];

  constructor(private config: ProcessorConfig = DEFAULT_CONFIG) {
    this.buildPipeline();
  }

  private buildPipeline(): void {
    this.processors = [
      new FrontmatterProcessor(this.config.frontmatter),
      new DataviewProcessor(this.config.dataview),
      new WikilinkProcessor(this.config.wikilink),
      new TagProcessor(this.config.tag),
      new ImageProcessor(this.config.image),
      new TableProcessor(this.config.tableMaxRows),
      new CalloutProcessor(this.config.callout),
      new MathProcessor(),
    ];
  }

  registerProcessor(processor: SyncProcessor, position?: number): void {
    if (position !== undefined) {
      this.processors.splice(position, 0, processor);
    } else {
      this.processors.push(processor);
    }
  }

  process(content: string): ProcessResult {
    let current = content;
    const metadata: Record<string, unknown> = {};
    for (const processor of this.processors) {
      current = processor.process(current);
    }
    return { content: current, metadata };
  }
}
