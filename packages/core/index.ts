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
  DESCRIPTION_INTERPRETER_PROMPT,
  QUERY_INTERPRETER_PROMPT,
} from "./constants";
import { Screenshot } from "./types";

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
    console.info("Initializing local recall agent");
    if (options?.reset) {
      await this.chromaClient.reset().catch(() => { });
      await this.chromaClient.deleteCollection({ name: COLLECTION_NAME });
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
    const interpreterModelPullProgress = await this.ollamaClient.pull({
      model: INTERPRETER_MODEL,
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

    for await (const progress of interpreterModelPullProgress) {
      trackProgress(INTERPRETER_MODEL, progress);
    }

    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  }

  private async generateEmbeddings(
    prompts: string[],
    options?: {
      model?: string;
      parallel?: boolean;
    } & EmbeddingsRequest["options"],
  ) {
    const routine = async (prompt: string) => {
      const response = await this.ollamaClient.embeddings({
        model: options?.model ?? EMBEDDING_MODEL,
        prompt,
        options,
      });
      return response.embedding;
    };

    if (options?.parallel) return Promise.all(prompts.map(routine));

    const aggregates: Awaited<ReturnType<typeof routine>>[] = [];
    for await (const prompt of prompts) {
      aggregates.push(await routine(prompt));
    }
    return aggregates;
  }

  private async generateDescriptions(
    images: string[],
    options?: { model?: string; parallel?: boolean; prompt?: string },
  ) {
    const routine = async (image: string) => {
      const { response } = await this.ollamaClient.generate({
        model: options?.model ?? IMAGE_DESCRIPTION_MODEL,
        prompt: options?.prompt ?? IMAGE_DESCRIPTION_PROMPT,
        images: [image],
        keep_alive: "5m",
      });
      return response.trim();
    };

    if (options?.parallel) return Promise.all(images.map(routine));

    const aggregates: Awaited<ReturnType<typeof routine>>[] = [];
    for await (const image of images) {
      aggregates.push(await routine(image));
    }
    return aggregates;
  }

  private async interpretQueryResults(
    initialQuery: string,
    queryResults: string[],
    options?: { model?: string },
  ) {
    const stream = await this.ollamaClient.generate({
      model: options?.model ?? INTERPRETER_MODEL,
      prompt: DESCRIPTION_INTERPRETER_PROMPT(initialQuery, queryResults),
      stream: true,
      keep_alive: "5m",
    });
    return stream;
  }

  private async expandQuery(query: string, options?: { model?: string }) {
    const { response } = await this.ollamaClient.generate({
      model: options?.model ?? INTERPRETER_MODEL,
      prompt: QUERY_INTERPRETER_PROMPT(query),
      keep_alive: "5m",
    });

    console.info(`Expanded query to: "${response}"`);

    return response;
  }

  private async createScreenshotsCollection() {
    return this.chromaClient.getOrCreateCollection({ name: COLLECTION_NAME });
  }

  private async takeScreenshots(options?: {
    parallel?: boolean;
  }): Promise<Screenshot[]> {
    const displays = await screenshot.listDisplays();
    const routine = async (display: (typeof displays)[number]) => {
      const s = await screenshot({ format: "jpeg", screen: display.id });
      return { data: s.toString("base64"), display };
    };

    if (options?.parallel) return Promise.all(displays.map(routine));

    const aggregates: Awaited<ReturnType<typeof routine>>[] = [];
    for await (const display of displays) {
      aggregates.push(await routine(display));
    }
    return aggregates;
  }

  public async record(options: { everyMs: number; maxScreenshotSets: number }) {
    if (!this.screenshotCollection) await this.init();

    console.info("Recording started...");
    for (let idx = 0; idx < options.maxScreenshotSets; idx++) {
      const screenshots = await this.takeScreenshots();
      await this.describeScreenshots(screenshots);
      await delay(options.everyMs);
    }
    console.info("Recording stopped...");
  }

  private async describeScreenshots(screenshots: Screenshot[]) {
    console.info(
      `Describing screenshots for displays: ${[...new Set(screenshots.map((s) => s.display.name))]}`,
    );

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

  public async query(prompt: string, options?: { maxResults?: number }) {
    if (!this.screenshotCollection) await this.init();

    console.info(`Generating answer to query '${prompt}'...`);

    const now = new Date();
    // prompt = await this.expandQuery(prompt);
    const embeddings = await this.generateEmbeddings([
      `DATE-AND-TIME: ${now.toISOString()}, DESCRIPTION: ${prompt}`,
    ]);
    const results = await this.screenshotCollection!.query({
      nResults: options?.maxResults ?? this.options.query.maxResultsPerQuery,
      queryEmbeddings: embeddings,
    });
    const documents =
      results.documents?.[0]?.flatMap((d) => (d ? [d] : [])) ?? [];

    if (documents.length === 0)
      return {
        stream: null,
        error:
          "I couldn't find any relevant information related to that query.",
      };

    console.log(documents);

    const stream = await this.interpretQueryResults(prompt, documents);
    return { stream };
  }
}

export const createLocalRecall = (
  ...args: ConstructorParameters<typeof LocalRecall>
) => new LocalRecall(...args);
