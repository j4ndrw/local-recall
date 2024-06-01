import { createLocalRecall } from "@j4ndrw/local-recall-core";
import {
  DEFAULT_CHROMA_DB,
  DEFAULT_CHROMA_HOST,
  DEFAULT_KAFKA_BROKER,
  DEFAULT_KAFKA_CLIENT_ID,
  DEFAULT_OLLAMA_HOST,
} from "@j4ndrw/local-recall-core/constants";

import { ChromaClient } from "chromadb";
import { Ollama } from "ollama";

import dotenv from "dotenv";
import { Kafka } from "kafkajs";

dotenv.config();

const localRecall = createLocalRecall(
  new Ollama({ host: process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST }),
  new ChromaClient({
    database: process.env.CHROMA_DB ?? DEFAULT_CHROMA_DB,
    path: process.env.CHROMA_HOST ?? DEFAULT_CHROMA_HOST,
  }),
  new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? DEFAULT_KAFKA_CLIENT_ID,
    brokers: [process.env.KAFKA_BROKER ?? DEFAULT_KAFKA_BROKER]
  }),
  { query: { maxResultsPerQuery: 3 } },
);

async function main() {
  await localRecall.init();
  await localRecall.record({ everyMs: 1000 });
}

main();
