## ADDED Requirements

### Requirement: PreProcessor SHALL apply a configurable processor pipeline
The PreProcessor SHALL accept raw Obsidian Markdown content and pass it through a series of processors in order, each transforming the content.

#### Scenario: Pipeline executes all enabled processors in order
- **WHEN** PreProcessor receives raw Markdown content
- **THEN** each enabled processor SHALL transform the content sequentially in the following default order:
  1. FrontmatterProcessor
  2. DataviewProcessor
  3. WikilinkProcessor
  4. TagProcessor
  5. ImageProcessor
  6. TableProcessor
  7. CalloutProcessor
  8. MathProcessor
- **AND** the output SHALL be clean Feishu-compatible Markdown

#### Scenario: Disabled processors are skipped
- **WHEN** a processor is disabled in settings
- **THEN** PreProcessor SHALL skip that processor entirely
- **AND** pass content unchanged to the next processor

### Requirement: FrontmatterProcessor SHALL handle YAML frontmatter
The FrontmatterProcessor SHALL extract Obsidian YAML frontmatter (delimited by `---`) and handle it per the configured strategy.

#### Scenario: Strip frontmatter (default)
- **WHEN** content starts with `---\n...\n---\n`
- **AND** strategy is "strip"
- **THEN** FrontmatterProcessor SHALL remove the frontmatter block from output
- **AND** record the removed frontmatter in skipped blocks metadata

#### Scenario: Keep frontmatter as visible text
- **WHEN** strategy is "keep-as-text"
- **THEN** FrontmatterProcessor SHALL convert frontmatter to a visible code block or text block

### Requirement: WikilinkProcessor SHALL resolve [[wikilink]] syntax
The WikilinkProcessor SHALL parse `[[wikilink]]` and `[[wikilink|display text]]` syntax per configured strategy.

#### Scenario: Strip brackets keeping text
- **WHEN** encountering `[[wikilink]]` or `[[target|display text]]`
- **AND** strategy is "keep-text"
- **THEN** WikilinkProcessor SHALL output the display text (or target if no display text)

### Requirement: TagProcessor SHALL handle Obsidian #tags
The TagProcessor SHALL process `#tag` syntax used in Obsidian.

#### Scenario: Keep tags inline
- **WHEN** encountering `#tag-name`
- **AND** strategy is "keep-inline"
- **THEN** TagProcessor SHALL retain `#tag-name` as-is in the output

#### Scenario: Strip tags
- **WHEN** strategy is "strip"
- **THEN** TagProcessor SHALL remove all `#tag-name` occurrences from output

### Requirement: TableProcessor SHALL handle long tables
The TableProcessor SHALL detect tables exceeding the configured max row count and split them into multiple tables.

#### Scenario: Split table exceeding max rows
- **WHEN** a Markdown table has >9 body rows
- **THEN** TableProcessor SHALL split it into multiple tables, each with the original header row
- **AND** record the split action in processing metadata

#### Scenario: Normal table passes through
- **WHEN** a Markdown table has <=9 body rows
- **THEN** TableProcessor SHALL pass it through unchanged

### Requirement: ImageProcessor SHALL handle local image references
The ImageProcessor SHALL detect Obsidian image references `![[image.png]]` or `![](path/to/image.png)` and handle per strategy.

#### Scenario: Collect image references for upload
- **WHEN** encountering `![[image.png]]` or `![](path/to/image.png)`
- **AND** strategy is "upload"
- **THEN** ImageProcessor SHALL collect the image local path into the processing metadata
- **AND** replace the reference with a placeholder marker in the Markdown content

#### Scenario: Strip image references
- **WHEN** strategy is "strip"
- **THEN** ImageProcessor SHALL remove all image references from output

### Requirement: DataviewProcessor SHALL handle Dataview query blocks
The DataviewProcessor SHALL detect ````dataview` and ````dataviewjs` code blocks.

#### Scenario: Comment out Dataview blocks
- **WHEN** encountering a `dataview` or `dataviewjs` code block
- **AND** strategy is "comment-out"
- **THEN** DataviewProcessor SHALL wrap the block in HTML comments or replace with a descriptive notice

#### Scenario: Strip Dataview blocks
- **WHEN** strategy is "strip"
- **THEN** DataviewProcessor SHALL remove the entire Dataview block from output

### Requirement: MathProcessor SHALL handle LaTeX math expressions
The MathProcessor SHALL detect `$...$` inline and `$$...$$` block math expressions.

#### Scenario: Retain math expressions
- **WHEN** strategy is "keep"
- **THEN** MathProcessor SHALL pass `$...$` and `$$...$$` through unchanged (Feishu supports Equation blocks via markdown conversion)

### Requirement: CalloutProcessor SHALL convert Obsidian callouts
The CalloutProcessor SHALL detect Obsidian callout syntax (`> [!TYPE]`) and convert it to Feishu-compatible blockquote formatting per configured strategy.

#### Scenario: Strip callout type markers
- **WHEN** encountering `> [!note]` or `> [!warning]` or `> [!tip]` callout blocks
- **AND** strategy is "strip-type"
- **THEN** CalloutProcessor SHALL remove the `[!TYPE]` marker
- **AND** retain the blockquote content as standard `> ...` markdown

#### Scenario: Keep callouts as-is
- **WHEN** strategy is "keep"
- **THEN** CalloutProcessor SHALL pass callout content through unchanged

#### Scenario: Convert callouts to code blocks
- **WHEN** strategy is "convert-to-codeblock"
- **THEN** CalloutProcessor SHALL wrap callout content in a fenced code block with the callout type as language tag

### Requirement: PreProcessor SHALL expose an extension API
The PreProcessor SHALL support custom processors registered by external code through the plugin's public API.

#### Scenario: Custom processor executes in pipeline
- **WHEN** a plugin registers a custom processor via `registerProcessor()`
- **THEN** the custom processor SHALL be included in the pipeline at the configured position
