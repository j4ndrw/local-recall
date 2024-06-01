import { createLocalRecall } from "@j4ndrw/local-recall-core";

import { Kafka } from "kafkajs";
import {
  DEFAULT_KAFKA_BROKER,
  DEFAULT_KAFKA_CLIENT_ID,
} from "@j4ndrw/local-recall-core/src/modules/clients/kafka/constants";

import { ChromaClient } from "chromadb";
import {
  DEFAULT_CHROMA_DB,
  DEFAULT_CHROMA_HOST,
} from "@j4ndrw/local-recall-core/src/modules/clients/chroma/constants";

import { Ollama } from "ollama";
import { DEFAULT_OLLAMA_HOST } from "@j4ndrw/local-recall-core/src/modules/clients/ollama/constants";

import dotenv from "dotenv";

dotenv.config();

const localRecall = createLocalRecall({
  ollamaClient: new Ollama({
    host: process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST,
  }),
  chromaClient: new ChromaClient({
    database: process.env.CHROMA_DB ?? DEFAULT_CHROMA_DB,
    path: process.env.CHROMA_HOST ?? DEFAULT_CHROMA_HOST,
  }),
  kafkaClient: new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? DEFAULT_KAFKA_CLIENT_ID,
    brokers: [process.env.KAFKA_BROKER ?? DEFAULT_KAFKA_BROKER],
  }),
});

async function main() {
  await localRecall.record({ everyMs: 1000 });
}

main();
