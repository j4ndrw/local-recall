import { ChromaClient } from "chromadb";
import { Kafka } from "kafkajs";
import { Ollama } from "ollama";
import {
  chromaClientModule,
  kafkaClientModule,
  ollamaClientModule,
} from "./modules/clients";
import { recallModule } from "./modules/recall";

export const createLocalRecall = (options?: {
  ollamaClient?: Ollama;
  chromaClient?: ChromaClient;
  kafkaClient?: Kafka;
}) => {
  ollamaClientModule.register(options?.ollamaClient);
  chromaClientModule.register(options?.chromaClient);
  kafkaClientModule.register(options?.kafkaClient);

  return {
    record: recallModule.behaviour.record,
    query: recallModule.behaviour.query,
  };
};
