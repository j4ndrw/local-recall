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
  QUERY_INTERPRETER_SYSTEM_PROMPT,
  DEFAULT_KAFKA_CLIENT_ID,
  DEFAULT_KAFKA_BROKER,
  KAFKA_SCREENSHOT_GROUP_ID,
  KAFKA_SCREENSHOT_TOPIC,
} from "./constants";
import { Screenshot } from "./types";

import screenshot from "screenshot-desktop";
import { Consumer, Kafka, Producer } from "kafkajs";

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(() => resolve(null), ms));

class LocalRecall {
  private screenshotCollection: Collection | null = null;

  private screenshotProducer: Producer | null = null;

  private screenshotConsumer: Consumer | null = null;

  constructor(
    private ollamaClient: Ollama = new Ollama({ host: DEFAULT_OLLAMA_HOST }),
    private chromaClient: ChromaClient = new ChromaClient({
      database: DEFAULT_CHROMA_DB,
    }),
    private kafkaClient: Kafka = new Kafka({
      clientId: DEFAULT_KAFKA_CLIENT_ID,
      brokers: [DEFAULT_KAFKA_BROKER],
    }),
    private options: { query: { maxResultsPerQuery: number } },
  ) { }

  async init(options?: { reset?: boolean }) {
    console.log("Initializing local recall agent");
    if (options?.reset) {
      await this.chromaClient.reset().catch(() => { });
      await this.chromaClient.deleteCollection({ name: COLLECTION_NAME });
    }
    this.screenshotCollection = await this.createScreenshotsCollection();

    this.screenshotProducer = this.kafkaClient.producer();
    this.screenshotConsumer = this.kafkaClient.consumer({
      groupId: KAFKA_SCREENSHOT_GROUP_ID,
    });

    await this.screenshotProducer.connect();
    await this.screenshotConsumer.subscribe({ topic: KAFKA_SCREENSHOT_TOPIC });

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
    });
    return stream;
  }

  private async expandQuery(query: string, options?: { model?: string }) {
    const { response } = await this.ollamaClient.generate({
      model: options?.model ?? INTERPRETER_MODEL,
      system: QUERY_INTERPRETER_SYSTEM_PROMPT,
      prompt: query,
    });

    console.log(`Expanded query to: "${response}"`);

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

  public async record(options: {
    everyMs: number;
    maxScreenshotSets?: number;
  }) {
    await Promise.all([
      async () => {
        console.log("Recording started...");
        const routine = async () => {
          const screenshots = await this.takeScreenshots();
          this.screenshotProducer?.send({
            topic: KAFKA_SCREENSHOT_TOPIC,
            messages: screenshots.map((s) => ({ value: JSON.stringify(s) })),
          });
          await delay(options.everyMs);
        };

        if (!options.maxScreenshotSets) while (true) await routine();
        else
          for (let idx = 0; idx < options.maxScreenshotSets; idx++)
            await routine();

        console.log("Recording stopped...");
      },
      this.describeScreenshots(),
    ]);
  }

  private async describeScreenshots() {
    await this.screenshotConsumer?.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: async ({ topic, message, pause }) => {
        if (topic !== KAFKA_SCREENSHOT_TOPIC) return;

        const screenshot = message.value
          ? (JSON.parse(message.value.toString()) as Screenshot)
          : null;
        console.log({ message });
        if (!screenshot) return;

        const resume = pause();

        console.log(
          `Describing screenshot for display: ${screenshot.display.name}`,
        );

        const now = new Date();
        const timestamp = now.getTime();
        const description = (
          await this.generateDescriptions([screenshot.data])
        )[0]!;
        const embedding = (await this.generateEmbeddings([description]))[0]!;

        const id = `${timestamp}-${screenshot.display.name}-${screenshot.display.id}`;
        const doc = JSON.stringify({
          screenshot,
          description: `DATE-AND-TIME: ${now}, DESCRIPTION: ${description}`,
        });
        await this.screenshotCollection?.add({
          ids: [id],
          embeddings: [embedding],
          documents: [doc],
        });

        resume();
      },
    });
  }

  public async query(prompt: string, options?: { maxResults?: number }) {
    if (!this.screenshotCollection) await this.init();

    console.log(`Generating answer to query '${prompt}'...`);

    prompt = await this.expandQuery(prompt);

    const now = new Date();
    const embeddings = await this.generateEmbeddings([
      `DATE-AND-TIME: ${now.toISOString()}, DESCRIPTION: ${prompt}`,
    ]);
    const results = await this.screenshotCollection?.query({
      nResults: options?.maxResults ?? this.options.query.maxResultsPerQuery,
      queryEmbeddings: embeddings,
    });
    const documents =
      results?.documents?.[0]?.flatMap((d) =>
        d
          ? [JSON.parse(d) as { description: string; screenshot: Screenshot }]
          : [],
      ) ?? [];

    if (documents.length === 0)
      return {
        stream: null,
        error:
          "I couldn't find any relevant information related to that query.",
      };

    console.log(documents);

    const stream = await this.interpretQueryResults(
      prompt,
      documents.map((d) => d.description),
    );
    return { stream };
  }
}

export const createLocalRecall = (
  ...args: ConstructorParameters<typeof LocalRecall>
) => new LocalRecall(...args);
