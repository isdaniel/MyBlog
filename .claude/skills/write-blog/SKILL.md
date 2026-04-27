---
name: write-blog
description: >
  Create a new blog post for this Hexo blog. Handles research, writing,
  frontmatter metadata, and file placement in source/_posts/. Use when the
  user wants to write, draft, or create a new blog post or article.
  Supports topics like Rust, PostgreSQL, C#, system design, databases, and
  any technical subject. Can research via web if a URL or topic is provided.
arguments: [topic]
argument-hint: "[topic or URL] [--lang en|zh-tw]"
allowed-tools: Read Write Edit Glob Grep WebSearch WebFetch Bash(git status) Bash(git diff) Bash(git log *)
---

# Blog Post Writing Skill

You are helping the user write a blog post for their Hexo-based technical blog.

**Topic / Reference:** $ARGUMENTS

## Step 1: Understand the Request

Parse the user's input to determine:

- **Topic**: What the post is about
- **Reference URL(s)**: If a GitHub repo URL or other link is provided, fetch and study it thoroughly using WebFetch
- **Language**: If `--lang en` or `--lang zh-tw` is specified, use that. Otherwise default to `en` for English topics (Rust, open-source tools) or `zh-tw` for Chinese topics. Ask the user if unclear.

## Step 2: Research

### If a GitHub repository URL is provided:
1. Fetch the README with WebFetch
2. Understand the project: purpose, architecture, features, installation, usage
3. Look for benchmarks, load tests, or performance data (check for files like `LOAD_TEST_COMPARISON.md`, `benches/`, `load-tests/`)
4. Identify code examples from the repo's `examples/` directory or README
5. Check Cargo.toml or package.json for description and dependencies

### If a general topic is provided:
1. Use WebSearch to find current, accurate information
2. Gather supporting sources and references

### Always:
- Read 2-3 existing posts in `source/_posts/` using Glob + Read to match the blog's writing style and voice
- Pay attention to how the author structures posts: introduction style, heading hierarchy, code block usage, conclusion format

## Step 3: Study Existing Blog Conventions

Read existing posts to confirm the current conventions. The blog follows these patterns:

### Frontmatter Schema

```yaml
---
title: Post Title Here
date: YYYY-MM-DD HH:mm:ss
tags: [Tag1, Tag2, Tag3]
categories: [Category1, Category2]
keywords: keyword1, keyword2, keyword3
description: "A concise one-sentence description for SEO"
lang: en
---
```

**Field rules:**
- **title**: Descriptive, can include project name and subtitle. Match the post language.
- **date**: Use the current date/time in `YYYY-MM-DD HH:mm:ss` format.
- **tags**: YAML inline array `[Tag1, Tag2]`. Fine-grained topic labels. Include the programming language, specific technologies, and concepts. Typically 3-6 tags.
- **categories**: YAML inline array `[Cat1, Cat2]`. Broader groupings — usually a subset of tags (the 1-3 broadest ones).
- **keywords**: Comma-separated plain string (NOT a YAML array). Includes tags plus additional SEO-relevant terms and synonyms (e.g., both "CDC" and "Change-Data-Capture").
- **description**: A quoted string, one sentence, under 160 characters. Same language as the post. Serves as the SEO meta description.
- **lang**: `en` for English posts, `zh-tw` for Traditional Chinese posts.

### File Naming

- Kebab-case filename: `topic-name-here.md`
- Placed in `source/_posts/`
- Examples: `pg-walstream-rust-postgresql-wal-streaming.md`, `pgtuner-mcp-ai-powered-postgresql-performance.md`

### Common Tags and Categories in This Blog

Frequently used tags (use existing ones when applicable):
- Languages: `Rust`, `C#`, `Python`, `SQL`
- Databases: `PostgreSQL`, `SQL Server`, `Redis`
- PostgreSQL: `pgrx`, `logical-replication`, `WAL`, `CDC`
- Concepts: `Design-Pattern`, `SystemDesign`, `Performance-Tuning`, `Docker`
- Cloud: `AWS`, `Azure`, `Kubernetes`

## Step 4: Write the Post

### Structure for English posts (`lang: en`):

```markdown
# Post Title

Opening paragraph: 1-2 sentences explaining what the project/topic is and the problem it solves. Link to the source repo if applicable.

[GitHub Repository](url) | [crates.io / npm](url) | [API Docs](url)

## Background / Context (if needed)
Explain prerequisite knowledge the reader needs.

## Key Features
Bullet list of the most important capabilities.

## Architecture (if applicable)
ASCII diagram showing the system design, with explanation.

## Getting Started / How to Use
### Installation
### Configuration / Setup
### Basic Example (with code block)
### Advanced Example (if applicable)

## Performance / Benchmarks (if data available)
Tables with benchmark results. Highlight key numbers in bold.

## Conclusion
2-3 sentences summarizing the value and key takeaways.

## References
Linked list of resources.
```

### Structure for Chinese posts (`lang: zh-tw`):

```markdown
## 前言
Opening paragraph explaining the topic.

## Main sections using ## headers

### Sub-sections using ### headers

Code blocks with language hints (```sql, ```rust, ```bash)

## 小結
Summary section.
```

### Writing Style Guidelines:
- **Technical and direct** — no filler or marketing language
- **Code-heavy** — include real, runnable code examples
- **Tables** for comparisons, feature lists, and benchmark data
- **ASCII diagrams** using box-drawing characters for architecture
- For GitHub projects by the blog author (isdaniel), link to the repo near the top
- Cross-reference other posts on this blog when relevant (use `https://isdaniel.github.io/post-slug/`)

## Step 5: Review and Validate

Before finishing:

1. **Re-read the post** using the Read tool — check for:
   - Valid YAML frontmatter (no syntax errors)
   - Consistent heading hierarchy (no skipped levels)
   - All code blocks have language hints
   - Links are properly formatted
   - Tags and categories follow existing conventions
2. **Check for duplicates** — Grep `source/_posts/` to make sure a post on this exact topic doesn't already exist
3. **Report to the user**:
   - The file path of the new post
   - A summary of the frontmatter metadata chosen
   - Any sections that may need the user's review or additional input (e.g., benchmarks they need to verify, sections where you made assumptions)
