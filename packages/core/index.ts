import { EmbeddingsRequest, Ollama, ProgressResponse } from "ollama";
import { ChromaClient, Collection } from "chromadb";
import {
  DEFAULT_CHROMA_DB,
  DEFAULT_OLLAMA_HOST,
  EMBEDDING_MODEL,
  IMAGE_DESCRIPTION_MODEL,
  IMAGE_DESCRIPTION_PROMPT,
} from "./constants";

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

  async init() {
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

  private async createScreenshotsCollection() {
    const collectionName = "recall-screenshots";
    return this.chromaClient.getOrCreateCollection({ name: collectionName });
  }

  private async takeScreenshots() {
    const displays = await screenshot.listDisplays();
    return Promise.all(
      displays.map(async (display) => {
        const s = await screenshot({ format: "jpg", screen: display.id });
        return { data: s.toString("base64"), display };
      }),
    );
  }

  public async record(options: { everyMs: number, maxScreenshots: number }) {
    if (!this.screenshotCollection) await this.init();

    const screenshots: Awaited<ReturnType<typeof this.takeScreenshots>> = [];

    while (screenshots.length < options.maxScreenshots) {
      screenshots.push(...await this.takeScreenshots());
      await delay(options.everyMs);
    }


    const now = new Date();
    const timestamp = now.getTime();
    const descriptions = await this.generateDescriptions(
      screenshots.map(({ data }) => data),
    );

    console.log({ descriptions });
    const embeddings = await this.generateEmbeddings(descriptions);

    for (let idx = 0; idx < screenshots.length; idx++) {
      const screenshot = screenshots[idx]!;
      const description = descriptions[idx]!;
      const embedding = embeddings[idx]!;

      const id = `${timestamp}-${screenshot.display.name}-${screenshot.display.id}`;
      await this.screenshotCollection!.add({
        ids: [id],
        embeddings: [embedding],
        documents: [
          `DATE-AND-TIME: ${now.toISOString()}, DESCRIPTION: ${description}`,
        ],
      });
    }
  }

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
    const ids = results.ids[0] ?? [];

    if (documents.length === 0 || ids.length === 0)
      return {
        results: [],
        error:
          "I couldn't find any relevant information related to that query.",
      };

    return {
      results: documents.map((d, idx) => ({ id: ids[idx], doc: d })),
    };
  }
}

export const createLocalRecall = (
  ...args: ConstructorParameters<typeof LocalRecall>
) => new LocalRecall(...args);
