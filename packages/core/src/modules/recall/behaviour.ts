import { EmbeddingsRequest } from "ollama";
import { ollamaClientModule } from "../clients";
import { screenshotModule } from "../screenshot";
import {
  DESCRIPTION_INTERPRETER_PROMPT,
  IMAGE_DESCRIPTION_PROMPT,
  QUERY_INTERPRETER_SYSTEM_PROMPT,
} from "./config";
import { RecordOptions, Screenshot } from "../../types";
import { delay, logger } from "../../utils";

export const generateDescription = async (
  image: string,
  options?: {
    model?: string;
    prompt?: string;
  },
) => {
  const response = await ollamaClientModule.getClient().generate({
    model: options?.model ?? ollamaClientModule.config.IMAGE_DESCRIPTION_MODEL,
    prompt: options?.prompt ?? IMAGE_DESCRIPTION_PROMPT,
    images: [image],
    stream: true,
  });

  let description = "";
  for await (const { response: chunk } of response) {
    if (process.env["LOCAL_RECALL_DEBUG"]) process.stdout.write(chunk);
    description += chunk;
  }

  return description;
};

export const generateEmbedding = async (
  prompt: string,
  options?: { model?: string } & EmbeddingsRequest["options"],
) => {
  const response = await ollamaClientModule.getClient().embeddings({
    model: options?.model ?? ollamaClientModule.config.EMBEDDING_MODEL,
    prompt,
    options,
  });
  return response.embedding;
};

export const interpretQueryResults = async (
  initialQuery: string,
  queryResults: string[],
  options?: { model?: string },
) => {
  const stream = await ollamaClientModule.getClient().generate({
    model: options?.model ?? ollamaClientModule.config.INTERPRETER_MODEL,
    prompt: DESCRIPTION_INTERPRETER_PROMPT(initialQuery, queryResults),
    stream: true,
  });
  return stream;
};

export const expandQuery = async (
  query: string,
  options?: { model?: string },
) => {
  const { response } = await ollamaClientModule.getClient().generate({
    model: options?.model ?? ollamaClientModule.config.INTERPRETER_MODEL,
    system: QUERY_INTERPRETER_SYSTEM_PROMPT,
    prompt: query,
  });

  logger.debug(`Expanded query to: "${response}"`);

  return response;
};

export const record = async (options: RecordOptions) => {
  await ollamaClientModule.behaviour.pullModels([
    ollamaClientModule.config.IMAGE_DESCRIPTION_MODEL,
    ollamaClientModule.config.EMBEDDING_MODEL,
    ollamaClientModule.config.INTERPRETER_MODEL,
  ]);

  const screenshotCollection = await screenshotModule.collection.create();
  const screenshotConsumer = await screenshotModule.consumer.create().init();
  const screenshotProducer = await screenshotModule.producer.create().init();

  logger.debug("Recording started...");

  await screenshotModule.behaviour.describeOnDemand(
    screenshotConsumer,
    screenshotCollection,
  );

  if (!options.maxScreenshotSets) {
    while (true) {
      await screenshotModule.behaviour.stream(screenshotProducer);
      await delay(options.everyMs);
    }
  } else {
    for (let idx = 0; idx < options.maxScreenshotSets; idx++) {
      await screenshotModule.behaviour.stream(screenshotProducer);
      await delay(options.everyMs);
    }
  }
};

export const query = async (
  prompt: string,
  options?: { expandQuery?: boolean; maxResults?: number },
) => {
  await ollamaClientModule.behaviour.pullModels([
    ollamaClientModule.config.IMAGE_DESCRIPTION_MODEL,
    ollamaClientModule.config.EMBEDDING_MODEL,
    ollamaClientModule.config.INTERPRETER_MODEL,
  ]);

  const screenshotCollection = await screenshotModule.collection.create();

  logger.debug(`Generating answer to query '${prompt}'...`);

  if (options?.expandQuery) prompt = await expandQuery(prompt);

  const now = new Date();
  const embedding = await generateEmbedding(
    `DATE-AND-TIME: ${now.toISOString()}, DESCRIPTION: ${prompt}`,
  );
  const results = await screenshotCollection.query({
    nResults: options?.maxResults,
    queryEmbeddings: [embedding],
  });
  const documents =
    results?.documents?.[0]?.flatMap((d) =>
      d
        ? [JSON.parse(d) as { description: string; screenshot: Screenshot }]
        : [],
    ) ?? [];

  if (documents.length === 0) {
    return {
      stream: null,
      error: "I couldn't find any relevant information related to that query.",
    };
  }

  const stream = await interpretQueryResults(
    prompt,
    documents.map(({ description }) => description),
  );

  return { stream };
};
