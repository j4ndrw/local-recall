import { EmbeddingsRequest, Ollama, ProgressResponse } from "ollama";
import { ChromaClient, Collection } from "chromadb";
import {
  COLLECTION_NAME,
  DEFAULT_CHROMA_DB,
  DEFAULT_OLLAMA_HOST,
  EMBEDDING_MODEL,
  IMAGE_DESCRIPTION_MODEL,
  IMAGE_DESCRIPTION_PROMPT,
  INTERPRETER_MODEL,
  INTERPRETER_PROMPT,
} from "./constants";
import { Screenshot } from "./types";
import { log } from "./utils";

import screenshot from "screenshot-desktop";

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(() => resolve(null), ms));

class LocalRecall {
  private screenshotCollection: Collection | null = null;

  constructor(
    private ollamaClient: Ollama = new Ollama({ host: DEFAULT_OLLAMA_HOST }),
    private chromaClient: ChromaClient = new ChromaClient({
      database: DEFAULT_CHROMA_DB,
    }),
    private options: { query: { maxResultsPerQuery: number } },
  ) { }

  async init(options?: { reset?: boolean }) {
    if (options?.reset) {
      await this.chromaClient.reset().catch(() => { });
      await this.chromaClient.deleteCollection({ name: COLLECTION_NAME })
    }
    this.screenshotCollection = await this.createScreenshotsCollection();

    const imageModelPullProgress = await this.ollamaClient.pull({
      model: IMAGE_DESCRIPTION_MODEL,
      stream: true,
    });
    const embeddingModelPullProgress = await this.ollamaClient.pull({
      model: EMBEDDING_MODEL,
      stream: true,
    });

    // https://github.com/ollama/ollama-js/blob/main/examples/pull-progress/pull.ts
    const trackProgress = (model: string, progress: ProgressResponse) => {
      if (progress.digest) {
        let percent = 0;
        if (progress.completed && progress.total) {
          percent = Math.round((progress.completed / progress.total) * 100);
        }
        process.stdout.clearLine(0); // Clear the current line
        process.stdout.cursorTo(0); // Move cursor to the beginning of the line
        process.stdout.write(
          `Pulling model ${model} - ${progress.status} ${percent}%...`,
        ); // Write the new text
      }
    };

    for await (const progress of imageModelPullProgress) {
      trackProgress(IMAGE_DESCRIPTION_MODEL, progress);
    }

    for await (const progress of embeddingModelPullProgress) {
      trackProgress(EMBEDDING_MODEL, progress);
    }

    process.stdout.clearLine(0); // Clear the current line
    process.stdout.cursorTo(0); // Move cursor to the beginning of the line
  }

  @log("Generating embeddings...")
  private async generateEmbeddings(
    prompts: string[],
    options?: { model?: string } & EmbeddingsRequest["options"],
  ) {
    return Promise.all(
      prompts.map(async (prompt) => {
        const response = await this.ollamaClient.embeddings({
          model: options?.model ?? EMBEDDING_MODEL,
          prompt,
          options,
        });
        return response.embedding;
      }),
    );
  }

  @log("Generating descriptions...")
  private async generateDescriptions(
    images: string[],
    options?: { model?: string; prompt?: string },
  ) {
    return Promise.all(
      images.map(async (image) => {
        const { response } = await this.ollamaClient.generate({
          model: options?.model ?? IMAGE_DESCRIPTION_MODEL,
          prompt: options?.prompt ?? IMAGE_DESCRIPTION_PROMPT,
          images: [image],
        });
        return response.trim();
      }),
    );
  }

  @log("Interpreting query...")
  private async interpretQueryResults(
    initialQuery: string,
    queryResults: string[],
    options?: { model?: string },
  ) {
    const stream = await this.ollamaClient.generate({
      model: options?.model ?? INTERPRETER_MODEL,
      prompt: INTERPRETER_PROMPT(initialQuery, queryResults),
      stream: true,
    });
    return stream;
  }

  private async createScreenshotsCollection() {
    return this.chromaClient.getOrCreateCollection({ name: COLLECTION_NAME });
  }

  @log("Taking screenshots...")
  private async takeScreenshots(): Promise<Screenshot[]> {
    const displays = await screenshot.listDisplays();
    return Promise.all(
      displays.map(async (display) => {
        const s = await screenshot({ format: "png", screen: display.id });
        return { data: s.toString("base64"), display };
      }),
    );
  }

  @log("Recording started")
  public async record(options: { everyMs: number; maxScreenshotSets: number }) {
    if (!this.screenshotCollection) await this.init();

    const screenshots: Screenshot[] = [];
    for (let idx = 0; idx < options.maxScreenshotSets; idx++) {
      screenshots.push(...(await this.takeScreenshots()));
      await delay(options.everyMs);
    }

    await this.describeScreenshots(screenshots);
  }

  private async describeScreenshots(screenshots: Screenshot[]) {
    const now = new Date();
    const timestamp = now.getTime();
    const descriptions = await this.generateDescriptions(
      screenshots.map(({ data }) => data),
    );
    const embeddings = await this.generateEmbeddings(descriptions);

    for (
      let screenshotIdx = 0;
      screenshotIdx < screenshots.length;
      screenshotIdx++
    ) {
      const screenshot = screenshots[screenshotIdx]!;
      const description = descriptions[screenshotIdx]!;
      const embedding = embeddings[screenshotIdx]!;

      const id = `${timestamp}-${screenshot.display.name}-${screenshot.display.id}`;
      await this.screenshotCollection!.add({
        ids: [id],
        embeddings: [embedding],
        documents: [`DATE-AND-TIME: ${now}, DESCRIPTION: ${description}`],
      });
    }
  }

  @log("Querying...")
  public async query(prompt: string, options?: { maxResults?: number }) {
    if (!this.screenshotCollection) await this.init();

    const now = new Date();
    const embeddings = await this.generateEmbeddings([
      `DATE-AND-TIME: ${now.toISOString()}, DESCRIPTION: ${prompt}`,
    ]);
    const results = await this.screenshotCollection!.query({
      nResults: options?.maxResults ?? this.options.query.maxResultsPerQuery,
      queryEmbeddings: embeddings,
    });
    const documents =
      results.documents[0]?.flatMap((d) => (d ? [d] : [])) ?? [];

    if (documents.length === 0)
      return {
        stream: null,
        error:
          "I couldn't find any relevant information related to that query.",
      };

    const stream = await this.interpretQueryResults(prompt, documents);
    return { stream };
  }
}

export const createLocalRecall = (
  ...args: ConstructorParameters<typeof LocalRecall>
) => new LocalRecall(...args);
